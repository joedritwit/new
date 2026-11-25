import type { FreebuffUser } from '@freebuff/auth'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Viewer } from '../shared/types'
import * as schema from './schema'
import type { UserRow } from './schema'
import { cleanName, slugify } from './text'
import { trustLevelFor } from './trust'

export type ViewerProfile = {
  row: UserRow & { handle: string }
  trustLevel: number
}

const FALLBACK_COLOR = '#3B82F6'

async function uniqueHandle(db: D1Database, base: string): Promise<string> {
  const root = slugify(base, 24) || 'member'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate =
      attempt === 0
        ? root
        : `${root}-${Math.random().toString(36).slice(2, 6)}`
    const taken = await db
      .prepare('SELECT 1 AS taken FROM users WHERE handle = ?')
      .bind(candidate)
      .first()
    if (!taken) return candidate
  }
  return `member-${crypto.randomUUID().slice(0, 8)}`
}

function displayNameFor(user: FreebuffUser): string {
  const name = cleanName(user.name) || cleanName(user.email?.split('@')[0])
  return name.slice(0, 40) || 'Member'
}

/** Lazily provisions a local row for a signed-in Freebuff account. */
async function ensureUser(
  db: D1Database,
  user: FreebuffUser,
): Promise<UserRow & { handle: string }> {
  const [existing] = await drizzle(db)
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.sub))
    .limit(1)

  if (existing?.handle) return existing as UserRow & { handle: string }

  if (existing) {
    const handle = await uniqueHandle(db, existing.displayName)
    await db
      .prepare('UPDATE users SET handle = ? WHERE id = ?')
      .bind(handle, user.sub)
      .run()
    return { ...existing, handle }
  }

  const row: UserRow & { handle: string } = {
    id: user.sub,
    displayName: displayNameFor(user),
    handle: await uniqueHandle(db, user.name ?? user.email ?? 'member'),
    bio: null,
    staffRole: 'member',
    roleTag: null,
    avatarColor: FALLBACK_COLOR,
    avatarMediaId: null,
    showSupporterBadge: true,
    joinedAt: Date.now(),
    mutedUntil: null,
  }

  await db
    .prepare(
      `INSERT INTO users (
         id, display_name, handle, bio, staff_role, role_tag, avatar_color, joined_at
       ) VALUES (?, ?, ?, NULL, 'member', NULL, ?, ?)`,
    )
    .bind(row.id, row.displayName, row.handle, row.avatarColor, row.joinedAt)
    .run()

  return row
}

async function publishedPostCount(db: D1Database, userId: string) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM posts
       WHERE author_id = ? AND status = 'published'`,
    )
    .bind(userId)
    .first<{ count: number }>()
  return row?.count ?? 0
}

export async function viewerFor(
  db: D1Database,
  user: FreebuffUser,
  options: { promoteToAdmin?: boolean } = {},
): Promise<ViewerProfile> {
  let row = await ensureUser(db, user)

  // Local/demo preview only: there is no way to sign in as a different account
  // there, so the single preview identity needs staff access to show /mod and
  // /admin. `isLocalPreview` is false whenever hosted auth is configured.
  if (options.promoteToAdmin && row.staffRole !== 'admin') {
    await db
      .prepare("UPDATE users SET staff_role = 'admin' WHERE id = ?")
      .bind(row.id)
      .run()
    row = { ...row, staffRole: 'admin' }
  }

  const posts = await publishedPostCount(db, row.id)
  return { row, trustLevel: trustLevelFor(row.joinedAt, posts) }
}

export function viewerDto(profile: ViewerProfile): Viewer {
  const { row } = profile
  return {
    id: row.id,
    handle: row.handle,
    name: row.displayName,
    staffRole: row.staffRole,
    roleTag: row.roleTag,
    avatarColor: row.avatarColor,
    avatarMediaId: row.avatarMediaId,
    showSupporterBadge: row.showSupporterBadge,
    trustLevel: profile.trustLevel,
    mutedUntil: row.mutedUntil,
  }
}

export async function updateProfile(
  db: D1Database,
  userId: string,
  patch: {
    displayName: string
    bio: string | null
    roleTag: string | null
    avatarColor: string
    showSupporterBadge?: boolean
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE users
       SET display_name = ?, bio = ?, role_tag = ?, avatar_color = ?
       WHERE id = ?`,
    )
    .bind(
      patch.displayName,
      patch.bio,
      patch.roleTag,
      patch.avatarColor,
      userId,
    )
    .run()

  if (patch.showSupporterBadge !== undefined) {
    await db
      .prepare('UPDATE users SET show_supporter_badge = ? WHERE id = ?')
      .bind(patch.showSupporterBadge ? 1 : 0, userId)
      .run()
  }
}
