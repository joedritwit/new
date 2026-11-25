import type { AdminSupporter } from '../shared/types'
import { logAudit } from './audit'
import type { Env } from './auth'
import { createNotification } from './notifications'
import { fail, ok, type MutationResult } from './result'

type SupporterRow = {
  id: string
  handle: string
  displayName: string
  avatarColor: string
  avatarMediaId: string | null
  showSupporterBadge: number
  joinedAt: number
  staffRole: string
}

function mapSupporter(row: SupporterRow): AdminSupporter {
  return {
    id: row.id,
    handle: row.handle,
    name: row.displayName,
    avatarColor: row.avatarColor,
    avatarMediaId: row.avatarMediaId,
    showSupporterBadge: Boolean(row.showSupporterBadge),
    joinedAt: row.joinedAt,
  }
}

export async function listSupporters(db: D1Database): Promise<AdminSupporter[]> {
  const result = await db
    .prepare(
      `SELECT id, handle, display_name AS displayName,
              avatar_color AS avatarColor, avatar_media_id AS avatarMediaId,
              show_supporter_badge AS showSupporterBadge, joined_at AS joinedAt,
              staff_role AS staffRole
       FROM users
       WHERE staff_role = 'supporter' AND handle IS NOT NULL
       ORDER BY display_name COLLATE NOCASE ASC`,
    )
    .all<SupporterRow>()
  return result.results.map(mapSupporter)
}

export async function setSupporter(
  db: D1Database,
  env: Env | undefined,
  adminId: string,
  input: { handle: string; action: 'grant' | 'revoke'; note?: string | null },
): Promise<MutationResult<AdminSupporter>> {
  const handle = input.handle
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
  if (!handle) return fail(400, 'Enter the member handle.')

  const note = input.note?.trim() || null
  if (note && note.length > 200)
    return fail(400, 'The supporter note is too long.')

  const row = await db
    .prepare(
      `SELECT id, handle, display_name AS displayName,
              avatar_color AS avatarColor, avatar_media_id AS avatarMediaId,
              show_supporter_badge AS showSupporterBadge, joined_at AS joinedAt,
              staff_role AS staffRole
       FROM users WHERE handle = ?`,
    )
    .bind(handle)
    .first<SupporterRow>()
  if (!row) return fail(404, 'No member has that handle.')

  if (input.action === 'grant') {
    if (row.staffRole === 'supporter') return ok(mapSupporter(row))
    if (row.staffRole !== 'member')
      return fail(
        409,
        'Staff accounts already have supporter-level access and cannot be changed here.',
      )

    await db
      .prepare(
        "UPDATE users SET staff_role = 'supporter', show_supporter_badge = 1 WHERE id = ?",
      )
      .bind(row.id)
      .run()

    await logAudit(db, {
      actorId: adminId,
      action: 'supporter.grant',
      targetType: 'user',
      targetId: row.id,
      reason: note,
    })
    await createNotification(db, env, {
      userId: row.id,
      actorId: adminId,
      type: 'supporter',
      snippet:
        'You are now a Supporter. Thank you for supporting PublicLens.',
    })

    return ok(
      mapSupporter({
        ...row,
        staffRole: 'supporter',
        showSupporterBadge: 1,
      }),
    )
  }

  if (row.staffRole === 'member')
    return fail(409, 'That member is not a Supporter.')
  if (row.staffRole !== 'supporter')
    return fail(
      409,
      'Staff accounts cannot have their Supporter status revoked here.',
    )

  await db
    .prepare("UPDATE users SET staff_role = 'member' WHERE id = ?")
    .bind(row.id)
    .run()

  await logAudit(db, {
    actorId: adminId,
    action: 'supporter.revoke',
    targetType: 'user',
    targetId: row.id,
    reason: note,
  })
  await createNotification(db, env, {
    userId: row.id,
    actorId: adminId,
    type: 'supporter',
    snippet: 'Your Supporter status was removed.',
  })

  return ok(
    mapSupporter({
      ...row,
      staffRole: 'member',
    }),
  )
}
