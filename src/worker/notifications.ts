import type { NotificationPage, NotificationView } from '../shared/types'
import type { Env } from './auth'
import { publishNotification } from './realtime'
import { cleanName } from './text'

export type NotificationType =
  | 'reply'
  | 'mention'
  | 'warning'
  | 'report'
  | 'supporter'

type CreateInput = {
  userId: string
  actorId: string
  type: NotificationType
  threadId?: string | null
  postId?: string | null
  snippet: string
}

function snippetOf(body: string): string {
  return cleanName(body).slice(0, 160)
}

export async function createNotification(
  db: D1Database,
  env: Env | undefined,
  input: CreateInput,
): Promise<string | null> {
  if (input.userId === input.actorId) return null
  const exists = await db
    .prepare('SELECT 1 AS found FROM users WHERE id = ?')
    .bind(input.userId)
    .first()
  if (!exists) return null

  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO notifications (
         id, user_id, actor_id, type, thread_id, post_id, snippet, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.userId,
      input.actorId,
      input.type,
      input.threadId ?? null,
      input.postId ?? null,
      snippetOf(input.snippet) || 'New activity',
      Date.now(),
    )
    .run()
  await publishNotification(env, input.userId, id)
  return id
}

const MENTION = /(?:^|[^\w@])@([a-z0-9][a-z0-9-]{1,23})/gi

export async function notifyReply(
  db: D1Database,
  env: Env | undefined,
  input: {
    actorId: string
    threadId: string
    threadAuthorId: string
    postId: string
    body: string
  },
): Promise<void> {
  await createNotification(db, env, {
    userId: input.threadAuthorId,
    actorId: input.actorId,
    type: 'reply',
    threadId: input.threadId,
    postId: input.postId,
    snippet: input.body,
  })

  const handles = new Set<string>()
  for (const match of input.body.matchAll(MENTION)) {
    const handle = match[1]?.toLowerCase()
    if (handle) handles.add(handle)
  }
  if (!handles.size) return

  const placeholders = handles.size
  const rows = await db
    .prepare(
      `SELECT id, handle FROM users WHERE lower(handle) IN (${Array.from(
        { length: placeholders },
        () => '?',
      ).join(', ')})`,
    )
    .bind(...handles)
    .all<{ id: string; handle: string }>()

  for (const row of rows.results) {
    if (row.id === input.threadAuthorId && row.id !== input.actorId) continue
    await createNotification(db, env, {
      userId: row.id,
      actorId: input.actorId,
      type: 'mention',
      threadId: input.threadId,
      postId: input.postId,
      snippet: input.body,
    })
  }
}

export async function notifyWarning(
  db: D1Database,
  env: Env | undefined,
  input: {
    userId: string
    moderatorId: string
    points: number
    reason: string
  },
): Promise<void> {
  await createNotification(db, env, {
    userId: input.userId,
    actorId: input.moderatorId,
    type: 'warning',
    snippet: `${input.points}-point warning: ${input.reason}`,
  })
}

export async function notifyReportClosed(
  db: D1Database,
  env: Env | undefined,
  input: {
    reporterId: string
    moderatorId: string
    status: string
    resolution: string
    threadId: string
    postId: string
  },
): Promise<void> {
  await createNotification(db, env, {
    userId: input.reporterId,
    actorId: input.moderatorId,
    type: 'report',
    threadId: input.threadId,
    postId: input.postId,
    snippet: `Your report was ${input.status}: ${input.resolution}`,
  })
}

type NotificationRow = {
  id: string
  type: NotificationView['type']
  snippet: string
  createdAt: number
  readAt: number | null
  postId: string | null
  threadSlug: string | null
  threadTitle: string | null
  actorName: string
  actorHandle: string
  actorColor: string
}

export async function unreadNotificationCount(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL',
    )
    .bind(userId)
    .first<{ count: number }>()
  return row?.count ?? 0
}

export async function listNotifications(
  db: D1Database,
  userId: string,
): Promise<NotificationPage> {
  const [rows, unread] = await Promise.all([
    db
      .prepare(
        `SELECT n.id, n.type, n.snippet, n.created_at AS createdAt,
                n.read_at AS readAt, n.post_id AS postId,
                t.slug AS threadSlug, t.title AS threadTitle,
                a.display_name AS actorName, a.handle AS actorHandle,
                a.avatar_color AS actorColor
         FROM notifications n
         JOIN users a ON a.id = n.actor_id
         LEFT JOIN threads t ON t.id = n.thread_id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC
         LIMIT 30`,
      )
      .bind(userId)
      .all<NotificationRow>(),
    unreadNotificationCount(db, userId),
  ])

  return {
    unread,
    notifications: rows.results.map((row) => ({
      id: row.id,
      type: row.type,
      snippet: row.snippet,
      createdAt: row.createdAt,
      readAt: row.readAt,
      postId: row.postId,
      thread:
        row.threadSlug && row.threadTitle
          ? { slug: row.threadSlug, title: row.threadTitle }
          : null,
      actor: {
        name: row.actorName,
        handle: row.actorHandle,
        avatarColor: row.actorColor,
      },
    })),
  }
}

export async function markNotificationsRead(
  db: D1Database,
  userId: string,
  ids?: string[],
): Promise<number> {
  const now = Date.now()
  if (ids?.length) {
    const clean = [...new Set(ids.filter((id) => typeof id === 'string'))].slice(0, 100)
    if (!clean.length) return unreadNotificationCount(db, userId)
    await db
      .prepare(
        `UPDATE notifications SET read_at = ?
         WHERE user_id = ? AND read_at IS NULL
           AND id IN (${clean.map(() => '?').join(', ')})`,
      )
      .bind(now, userId, ...clean)
      .run()
  } else {
    await db
      .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
      .bind(now, userId)
      .run()
  }
  return unreadNotificationCount(db, userId)
}
