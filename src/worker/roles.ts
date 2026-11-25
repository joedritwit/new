import type { PostMinRole } from '../shared/forum'
import type { StaffRole } from '../shared/types'

const RANK: Record<StaffRole, number> = {
  member: 0,
  supporter: 1,
  moderator: 2,
  admin: 3,
}

export function atLeast(
  role: StaffRole | null | undefined,
  minimum: StaffRole,
): boolean {
  return RANK[role ?? 'member'] >= RANK[minimum]
}

/** Moderators and admins: everything under /mod. */
export function isStaff(role: StaffRole | null | undefined): boolean {
  return atLeast(role, 'moderator')
}

/** Supporters and staff can read staff-only boards. */
export function canReadRestricted(role: StaffRole | null | undefined): boolean {
  return atLeast(role, 'supporter')
}

export function canPostIn(
  role: StaffRole | null | undefined,
  minimum: PostMinRole,
): boolean {
  if (minimum === 'staff') return atLeast(role, 'moderator')
  if (minimum === 'supporter') return atLeast(role, 'supporter')
  return Boolean(role)
}
