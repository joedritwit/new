/** Turns a title or name into a URL-safe slug. */
export function slugify(input: string, max = 60): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

/** Strips control characters and collapses whitespace in user-supplied names. */
export function cleanName(input: string | null | undefined): string {
  return (input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
