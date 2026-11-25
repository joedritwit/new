import type { PostMinRole, ThreadPrefix } from '../shared/forum'
import { LIMITS, THREAD_PREFIXES } from '../shared/forum'
import type { Env } from './auth'
import { notifyReply } from './notifications'
import { fail, ok, type MutationResult } from './result'
import { canPostIn, canReadRestricted } from './roles'
import { cleanName, slugify } from './text'
import { canPostLinks, postLimitFor } from './trust'
import type { ViewerProfile } from './users'

const EXTERNAL_LINK = /(https?:\/\/|www\.)\S/i
const HOUR = 3_600_000

function validateTitle(title: string): MutationResult<never> | null {
  if (title.length < LIMITS.titleMin)
    return fail(400, 'Give the thread a title of at least 4 characters.')
  if (title.length > LIMITS.titleMax)
    return fail(400, `Titles are limited to ${LIMITS.titleMax} characters.`)
  return null
}

function validateBody(body: string): MutationResult<never> | null {
  if (!body) return fail(400, 'Write something before posting.')
  if (body.length > LIMITS.bodyMax)
    return fail(400, `Posts are limited to ${LIMITS.bodyMax} characters.`)
  return null
}

function checkMute(viewer: ViewerProfile): MutationResult<never> | null {
  const until = viewer.row.mutedUntil
  if (until && until > Date.now())
    return fail(
      403,
      `You are muted until ${new Date(until).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    )
  return null
}

async function checkRateLimit(
  db: D1Database,
  viewer: ViewerProfile,
): Promise<MutationResult<never> | null> {
  const limit = postLimitFor(viewer.trustLevel)
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM posts
       WHERE author_id = ? AND created_at > ?`,
    )
    .bind(viewer.row.id, Date.now() - HOUR)
    .first<{ count: number }>()
  if ((row?.count ?? 0) < limit) return null
  return fail(
    429,
    `New accounts can post ${limit} times an hour. That limit lifts as your account earns trust.`,
  )
}

function checkLinks(viewer: ViewerProfile, body: string) {
  if (canPostLinks(viewer.trustLevel) || !EXTERNAL_LINK.test(body)) return null
  return fail(
    403,
    'Links unlock once your account is 24 hours old and has 3 posts. Post the source in plain text for now.',
  )
}

async function uniqueThreadSlug(db: D1Database, title: string): Promise<string> {
  const base = slugify(title, 60) || 'thread'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
    const taken = await db
      .prepare('SELECT 1 AS taken FROM threads WHERE slug = ?')
      .bind(candidate)
      .first()
    if (!taken) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`
}

export async function createThread(
  db: D1Database,
  viewer: ViewerProfile,
  input: {
    boardId: string
    title: string
    body: string
    prefix: ThreadPrefix | null
  },
): Promise<MutationResult<{ slug: string }>> {
  const title = cleanName(input.title)
  const body = input.body.trim()

  const invalid = validateTitle(title) ?? validateBody(body) ?? checkMute(viewer)
  if (invalid) return invalid

  const board = await db
    .prepare(
      `SELECT id, staff_only AS staffOnly, post_min_role AS postMinRole,
              archived_at AS archivedAt
       FROM subcategories WHERE id = ?`,
    )
    .bind(input.boardId)
    .first<{
      id: string
      staffOnly: number
      postMinRole: PostMinRole
      archivedAt: number | null
    }>()
  if (!board) return fail(404, 'That board does not exist.')
  if (board.archivedAt) return fail(403, 'That board is archived.')
  if (board.staffOnly && !canReadRestricted(viewer.row.staffRole))
    return fail(403, 'That board is for supporters and staff.')
  if (!canPostIn(viewer.row.staffRole, board.postMinRole))
    return fail(403, 'Your account cannot start threads in that board.')

  const linkProblem = checkLinks(viewer, body)
  if (linkProblem) return linkProblem
  const rateProblem = await checkRateLimit(db, viewer)
  if (rateProblem) return rateProblem

  const id = crypto.randomUUID()
  const slug = await uniqueThreadSlug(db, title)
  const now = Date.now()

  await db.batch([
    db
      .prepare(
        `INSERT INTO threads (
           id, subcategory_id, author_id, slug, title, prefix,
           is_pinned, is_locked, status, created_at, last_activity_at
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'published', ?, ?)`,
      )
      .bind(id, board.id, viewer.row.id, slug, title, input.prefix, now, now),
    db
      .prepare(
        `INSERT INTO posts (id, thread_id, author_id, body, status, position, created_at)
         VALUES (?, ?, ?, ?, 'published', 0, ?)`,
      )
      .bind(`${id}:p0`, id, viewer.row.id, body, now),
  ])

  return ok({ slug })
}

export async function createReply(
  db: D1Database,
  viewer: ViewerProfile,
  slug: string,
  body: string,
  env?: Env,
): Promise<MutationResult<{ ok: true }>> {
  const text = body.trim()
  const invalid = validateBody(text) ?? checkMute(viewer)
  if (invalid) return invalid

  const thread = await db
    .prepare(
      `SELECT t.id, t.slug, t.author_id AS authorId, t.is_locked AS isLocked,
              s.staff_only AS staffOnly, s.post_min_role AS postMinRole,
              s.archived_at AS archivedAt
       FROM threads t
       JOIN subcategories s ON s.id = t.subcategory_id
       WHERE t.slug = ? AND t.status = 'published'`,
    )
    .bind(slug)
    .first<{
      id: string
      slug: string
      authorId: string
      isLocked: number
      staffOnly: number
      postMinRole: PostMinRole
      archivedAt: number | null
    }>()
  if (!thread) return fail(404, 'That thread does not exist.')
  if (thread.isLocked) return fail(403, 'This thread is locked.')
  if (thread.archivedAt) return fail(403, 'That board is archived.')
  if (thread.staffOnly && !canReadRestricted(viewer.row.staffRole))
    return fail(403, 'That thread is for supporters and staff.')
  if (!canPostIn(viewer.row.staffRole, thread.postMinRole))
    return fail(403, 'Your account cannot reply in that board.')

  const linkProblem = checkLinks(viewer, text)
  if (linkProblem) return linkProblem
  const rateProblem = await checkRateLimit(db, viewer)
  if (rateProblem) return rateProblem

  const next = await db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM posts WHERE thread_id = ?',
    )
    .bind(thread.id)
    .first<{ position: number }>()
  const now = Date.now()
  const postId = crypto.randomUUID()

  await db.batch([
    db
      .prepare(
        `INSERT INTO posts (id, thread_id, author_id, body, status, position, created_at)
         VALUES (?, ?, ?, ?, 'published', ?, ?)`,
      )
      .bind(
        postId,
        thread.id,
        viewer.row.id,
        text,
        next?.position ?? 1,
        now,
      ),
    db
      .prepare('UPDATE threads SET last_activity_at = ? WHERE id = ?')
      .bind(now, thread.id),
  ])

  await notifyReply(db, env, {
    actorId: viewer.row.id,
    threadId: thread.id,
    threadAuthorId: thread.authorId,
    postId,
    body: text,
  })

  return ok({ ok: true })
}

export function isThreadPrefix(value: string): value is ThreadPrefix {
  return (THREAD_PREFIXES as readonly string[]).includes(value)
}
