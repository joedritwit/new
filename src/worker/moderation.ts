import { REPORT_LIMITS } from '../shared/forum'
import type {
  ModQueue,
  ReportStatus,
  ReportView,
  StaffProfile,
  StaffRole,
  WarningView,
} from '../shared/types'
import type { Env } from './auth'
import { logAudit } from './audit'
import { notifyReportClosed, notifyWarning } from './notifications'
import { fail, ok, type MutationResult } from './result'
import { atLeast, isStaff } from './roles'
import { cleanName } from './text'
import type { ViewerProfile } from './users'

const DAY = 86_400_000
const WARNING_LIFETIME = 90 * DAY
const MUTE_POINTS = 3
const MUTE_DURATION = DAY

export type ReportAction =
  | 'claim'
  | 'dismiss'
  | 'remove_post'
  | 'lock_thread'
  | 'warn_user'

export async function createReport(
  db: D1Database,
  viewer: ViewerProfile,
  input: { postId: string; reason: string; details: string | null },
): Promise<MutationResult<{ ok: true }>> {
  const post = await db
    .prepare(
      `SELECT p.id, p.author_id AS authorId FROM posts p
       WHERE p.id = ? AND p.status = 'published'`,
    )
    .bind(input.postId)
    .first<{ id: string; authorId: string }>()
  if (!post) return fail(404, 'That post does not exist.')
  if (post.authorId === viewer.row.id)
    return fail(400, 'You cannot report your own post.')

  const existing = await db
    .prepare('SELECT 1 AS found FROM reports WHERE reporter_id = ? AND target_id = ?')
    .bind(viewer.row.id, post.id)
    .first()
  if (existing) return fail(409, 'You already reported this post.')

  await db
    .prepare(
      `INSERT INTO reports (
         id, reporter_id, target_type, target_id, reason, details, status, created_at
       ) VALUES (?, ?, 'post', ?, ?, ?, 'open', ?)`,
    )
    .bind(
      crypto.randomUUID(),
      viewer.row.id,
      post.id,
      input.reason,
      input.details,
      Date.now(),
    )
    .run()

  return ok({ ok: true })
}

type ReportRow = {
  id: string
  status: ReportStatus
  reason: string
  details: string | null
  resolution: string | null
  createdAt: number
  handledAt: number | null
  reporterName: string
  reporterHandle: string
  authorId: string
  authorName: string
  authorHandle: string
  authorColor: string
  postId: string
  postStatus: string
  excerpt: string
  threadSlug: string
  threadTitle: string
  boardId: string
  boardName: string
}

const REPORT_QUERY = `
  SELECT r.id, r.status, r.reason, r.details, r.resolution,
         r.created_at AS createdAt, r.handled_at AS handledAt,
         reporter.display_name AS reporterName,
         reporter.handle AS reporterHandle,
         author.id AS authorId,
         author.display_name AS authorName,
         author.handle AS authorHandle,
         author.avatar_color AS authorColor,
         p.id AS postId, p.status AS postStatus,
         substr(p.body, 1, 400) AS excerpt,
         t.slug AS threadSlug, t.title AS threadTitle,
         s.id AS boardId, s.name AS boardName
  FROM reports r
  JOIN posts p ON p.id = r.target_id
  JOIN threads t ON t.id = p.thread_id
  JOIN subcategories s ON s.id = t.subcategory_id
  JOIN users author ON author.id = p.author_id
  JOIN users reporter ON reporter.id = r.reporter_id
  ORDER BY r.created_at DESC
  LIMIT 100
`

export async function listReports(db: D1Database): Promise<ModQueue> {
  const [rows, counts] = await Promise.all([
    db.prepare(REPORT_QUERY).all<ReportRow>(),
    db
      .prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status')
      .all<{ status: ReportStatus; count: number }>(),
  ])

  const countFor = (status: ReportStatus) =>
    counts.results.find((row) => row.status === status)?.count ?? 0

  const excerptOf = (body: string) =>
    body.length >= 400 ? `${body.trimEnd()}…` : body

  const reports: ReportView[] = rows.results.map((row) => ({
    id: row.id,
    status: row.status,
    reason: row.reason,
    details: row.details,
    resolution: row.resolution,
    createdAt: row.createdAt,
    handledAt: row.handledAt,
    reporter: { name: row.reporterName, handle: row.reporterHandle },
    author: {
      id: row.authorId,
      name: row.authorName,
      handle: row.authorHandle,
      avatarColor: row.authorColor,
    },
    post: {
      id: row.postId,
      excerpt: excerptOf(row.excerpt),
      status: row.postStatus,
    },
    thread: { slug: row.threadSlug, title: row.threadTitle },
    board: { id: row.boardId, name: row.boardName },
  }))

  return { reports, counts: { open: countFor('open'), inReview: countFor('in_review') } }
}

async function closeReport(
  db: D1Database,
  reportId: string,
  status: 'resolved' | 'dismissed',
  resolution: string,
  moderatorId: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE reports SET status = ?, resolution = ?, handled_by = ?, handled_at = ?
       WHERE id = ?`,
    )
    .bind(status, resolution, moderatorId, now, reportId)
    .run()
}

type ActionTarget = {
  reportId: string
  reportStatus: ReportStatus
  postId: string
  postAuthorId: string
  postAuthorRole: StaffRole
  reporterId: string
  threadId: string
  threadSlug: string
  threadAuthorRole: StaffRole
}

export async function applyReportAction(
  db: D1Database,
  moderator: ViewerProfile,
  reportId: string,
  action: ReportAction,
  note: string,
  points: number,
  env?: Env,
): Promise<MutationResult<{ ok: true }>> {
  const target = await db
    .prepare(
      `SELECT r.id AS reportId, r.status AS reportStatus,
              r.reporter_id AS reporterId,
              p.id AS postId, p.author_id AS postAuthorId,
              post_author.staff_role AS postAuthorRole,
              t.id AS threadId, t.slug AS threadSlug,
              thread_author.staff_role AS threadAuthorRole
       FROM reports r
       JOIN posts p ON p.id = r.target_id
       JOIN threads t ON t.id = p.thread_id
       JOIN users post_author ON post_author.id = p.author_id
       JOIN users thread_author ON thread_author.id = t.author_id
       WHERE r.id = ?`,
    )
    .bind(reportId)
    .first<ActionTarget>()
  if (!target) return fail(404, 'That report does not exist.')
  if (target.reportStatus === 'resolved' || target.reportStatus === 'dismissed')
    return fail(409, 'That report is already closed.')

  const now = Date.now()
  const moderatorId = moderator.row.id
  const reason = note || null

  // Staff boundaries are checked here as well as inside each mutation so no
  // action slips through: nobody moderates their own report, and only admins
  // act on content written by staff.
  if (target.reporterId === moderatorId)
    return fail(403, 'You cannot handle a report you filed yourself.')
  if (target.postAuthorId === moderatorId)
    return fail(403, 'You cannot act on a report about your own post.')
  if (
    !atLeast(moderator.row.staffRole, 'admin') &&
    ((action === 'remove_post' && isStaff(target.postAuthorRole)) ||
      (action === 'lock_thread' && isStaff(target.threadAuthorRole)))
  )
    return fail(403, 'Only an admin can act on staff content.')

  if (action === 'warn_user') {
    if (!reason) return fail(400, 'A warning needs a reason.')
    const warning = await issueWarning(
      db,
      moderator,
      target.postAuthorId,
      points,
      reason,
      env,
    )
    if (!warning.ok) return warning
    await closeReport(db, reportId, 'resolved', 'Warning issued', moderatorId, now)
    await logAudit(db, {
      actorId: moderatorId,
      action: 'report.warn_user',
      targetType: 'report',
      targetId: reportId,
      reason,
      metadata: { points, activePoints: warning.value.activePoints },
    })
    await notifyReportClosed(db, env, {
      reporterId: target.reporterId,
      moderatorId,
      status: 'resolved',
      resolution: 'Warning issued',
      threadId: target.threadId,
      postId: target.postId,
    })
    return ok({ ok: true })
  }

  if (action === 'dismiss') {
    await closeReport(
      db,
      reportId,
      'dismissed',
      reason || 'Dismissed',
      moderatorId,
      now,
    )
    await logAudit(db, {
      actorId: moderatorId,
      action: 'report.dismiss',
      targetType: 'report',
      targetId: reportId,
      reason,
    })
    await notifyReportClosed(db, env, {
      reporterId: target.reporterId,
      moderatorId,
      status: 'dismissed',
      resolution: reason || 'Dismissed',
      threadId: target.threadId,
      postId: target.postId,
    })
    return ok({ ok: true })
  }

  if (action === 'remove_post') {
    await db
      .prepare("UPDATE posts SET status = 'removed' WHERE id = ?")
      .bind(target.postId)
      .run()
    await closeReport(db, reportId, 'resolved', 'Post removed', moderatorId, now)
    await logAudit(db, {
      actorId: moderatorId,
      action: 'post.remove',
      targetType: 'post',
      targetId: target.postId,
      reason,
      metadata: { reportId, threadSlug: target.threadSlug },
    })
    await notifyReportClosed(db, env, {
      reporterId: target.reporterId,
      moderatorId,
      status: 'resolved',
      resolution: 'Post removed',
      threadId: target.threadId,
      postId: target.postId,
    })
    return ok({ ok: true })
  }

  if (action === 'lock_thread') {
    await db
      .prepare('UPDATE threads SET is_locked = 1 WHERE id = ?')
      .bind(target.threadId)
      .run()
    await closeReport(db, reportId, 'resolved', 'Thread locked', moderatorId, now)
    await logAudit(db, {
      actorId: moderatorId,
      action: 'thread.lock',
      targetType: 'thread',
      targetId: target.threadId,
      reason,
      metadata: { reportId },
    })
    await notifyReportClosed(db, env, {
      reporterId: target.reporterId,
      moderatorId,
      status: 'resolved',
      resolution: 'Thread locked',
      threadId: target.threadId,
      postId: target.postId,
    })
    return ok({ ok: true })
  }

  // claim
  await db
    .prepare(
      `UPDATE reports SET status = 'in_review', handled_by = ?, handled_at = ?
       WHERE id = ?`,
    )
    .bind(moderatorId, now, reportId)
    .run()
  await logAudit(db, {
    actorId: moderatorId,
    action: 'report.claim',
    targetType: 'report',
    targetId: reportId,
    reason,
  })
  return ok({ ok: true })
}

export async function issueWarning(
  db: D1Database,
  moderator: ViewerProfile,
  userId: string,
  points: number,
  reason: string,
  env?: Env,
): Promise<MutationResult<{ activePoints: number; mutedUntil: number | null }>> {
  if (!Number.isInteger(points) || points < 1 || points > 3)
    return fail(400, 'Warnings are worth 1 to 3 points.')
  const cleanReason = cleanName(reason).slice(0, REPORT_LIMITS.noteMax)
  if (!cleanReason) return fail(400, 'A warning needs a reason.')

  const target = await db
    .prepare(
      `SELECT id, display_name AS name, staff_role AS staffRole,
              muted_until AS mutedUntil
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      id: string
      name: string
      staffRole: StaffRole
      mutedUntil: number | null
    }>()
  if (!target) return fail(404, 'That member does not exist.')
  if (target.id === moderator.row.id)
    return fail(403, 'You cannot warn yourself.')
  if (isStaff(target.staffRole) && !atLeast(moderator.row.staffRole, 'admin'))
    return fail(403, 'Only an admin can warn a staff account.')

  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO warnings (
         id, user_id, moderator_id, points, reason, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      moderator.row.id,
      points,
      cleanReason,
      now,
      now + WARNING_LIFETIME,
    )
    .run()

  const active = await activePoints(db, userId)
  let mutedUntil = target.mutedUntil
  if (active >= MUTE_POINTS) {
    mutedUntil = Math.max(target.mutedUntil ?? 0, now + MUTE_DURATION)
    await db
      .prepare('UPDATE users SET muted_until = ? WHERE id = ?')
      .bind(mutedUntil, userId)
      .run()
    await logAudit(db, {
      actorId: moderator.row.id,
      action: 'user.mute',
      targetType: 'user',
      targetId: userId,
      reason: `${active} active warning points`,
      metadata: { mutedUntil },
    })
  }

  await logAudit(db, {
    actorId: moderator.row.id,
    action: 'warning.issue',
    targetType: 'user',
    targetId: userId,
    reason: cleanReason,
    metadata: { points, activePoints: active, mutedUntil },
  })

  await notifyWarning(db, env, {
    userId,
    moderatorId: moderator.row.id,
    points,
    reason: cleanReason,
  })

  return ok({ activePoints: active, mutedUntil })
}

async function activePoints(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(points), 0) AS points FROM warnings
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .bind(userId, Date.now())
    .first<{ points: number }>()
  return row?.points ?? 0
}

export async function revokeWarning(
  db: D1Database,
  moderator: ViewerProfile,
  warningId: string,
  reason: string,
): Promise<MutationResult<{ activePoints: number; mutedUntil: number | null }>> {
  const warning = await db
    .prepare(
      `SELECT w.id, w.user_id AS userId, u.staff_role AS staffRole
       FROM warnings w
       JOIN users u ON u.id = w.user_id
       WHERE w.id = ?`,
    )
    .bind(warningId)
    .first<{ id: string; userId: string; staffRole: StaffRole }>()
  if (!warning) return fail(404, 'That warning does not exist.')
  if (warning.userId === moderator.row.id)
    return fail(403, 'You cannot revoke your own warning.')
  if (isStaff(warning.staffRole) && !atLeast(moderator.row.staffRole, 'admin'))
    return fail(403, 'Only an admin can revoke a warning on a staff account.')

  const cleanReason = cleanName(reason).slice(0, REPORT_LIMITS.noteMax)
  if (!cleanReason) return fail(400, 'Say why the warning is being revoked.')

  await db
    .prepare(
      `UPDATE warnings SET revoked_at = ?, revoked_by = ?, revoke_reason = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .bind(Date.now(), moderator.row.id, cleanReason, warningId)
    .run()

  const active = await activePoints(db, warning.userId)
  let mutedUntil: number | null = null
  if (active < MUTE_POINTS) {
    await db
      .prepare('UPDATE users SET muted_until = NULL WHERE id = ?')
      .bind(warning.userId)
      .run()
  } else {
    const row = await db
      .prepare('SELECT muted_until AS mutedUntil FROM users WHERE id = ?')
      .bind(warning.userId)
      .first<{ mutedUntil: number | null }>()
    mutedUntil = row?.mutedUntil ?? null
  }

  await logAudit(db, {
    actorId: moderator.row.id,
    action: 'warning.revoke',
    targetType: 'user',
    targetId: warning.userId,
    reason: cleanReason,
    metadata: { warningId, activePoints: active },
  })

  return ok({ activePoints: active, mutedUntil })
}

export async function addModNote(
  db: D1Database,
  moderator: ViewerProfile,
  userId: string,
  body: string,
): Promise<MutationResult<{ ok: true }>> {
  const text = cleanName(body).slice(0, REPORT_LIMITS.modNoteMax)
  if (!text) return fail(400, 'Write a note first.')
  const target = await db
    .prepare('SELECT 1 AS found FROM users WHERE id = ?')
    .bind(userId)
    .first()
  if (!target) return fail(404, 'That member does not exist.')

  await db
    .prepare(
      `INSERT INTO mod_notes (id, user_id, author_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, moderator.row.id, text, Date.now())
    .run()

  await logAudit(db, {
    actorId: moderator.row.id,
    action: 'mod_note.create',
    targetType: 'user',
    targetId: userId,
    reason: text.slice(0, 120),
  })

  return ok({ ok: true })
}

export async function staffProfileFor(
  db: D1Database,
  userId: string,
): Promise<StaffProfile> {
  const [warnings, notes, active, user] = await Promise.all([
    db
      .prepare(
        `SELECT w.id, w.points, w.reason, w.created_at AS createdAt,
                w.expires_at AS expiresAt, w.revoked_at AS revokedAt,
                m.display_name AS moderator
         FROM warnings w
         JOIN users m ON m.id = w.moderator_id
         WHERE w.user_id = ?
         ORDER BY w.created_at DESC
         LIMIT 50`,
      )
      .bind(userId)
      .all<WarningView>(),
    db
      .prepare(
        `SELECT n.id, n.body, n.created_at AS createdAt, a.display_name AS author
         FROM mod_notes n
         JOIN users a ON a.id = n.author_id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC
         LIMIT 50`,
      )
      .bind(userId)
      .all<{ id: string; body: string; createdAt: number; author: string }>(),
    activePoints(db, userId),
    db
      .prepare('SELECT muted_until AS mutedUntil FROM users WHERE id = ?')
      .bind(userId)
      .first<{ mutedUntil: number | null }>(),
  ])

  return {
    warnings: warnings.results,
    activePoints: active,
    mutedUntil: user?.mutedUntil ?? null,
    notes: notes.results,
  }
}
