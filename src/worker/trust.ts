export const LINK_MIN_TRUST = 1

/** Derived, never stored: account age plus published posts. */
export function trustLevelFor(
  joinedAt: number,
  publishedPosts: number,
  now = Date.now(),
): number {
  const ageHours = (now - joinedAt) / 3_600_000
  if (publishedPosts >= 25 && ageHours >= 24 * 7) return 2
  if (publishedPosts >= 3 && ageHours >= 24) return 1
  return 0
}

export function canPostLinks(level: number): boolean {
  return level >= LINK_MIN_TRUST
}

/** Posts per hour. New accounts are throttled until they earn trust. */
export function postLimitFor(level: number): number {
  if (level >= 2) return 60
  if (level >= 1) return 20
  return 3
}

