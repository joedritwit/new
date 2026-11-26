/** Formatting values shared by the editor toolbar and the Worker sanitizer. */

export const TEXT_COLORS = [
  { value: 'red', label: 'Red', className: 'tone-red' },
  { value: 'blue', label: 'Blue', className: 'tone-blue' },
  { value: 'green', label: 'Green', className: 'tone-green' },
  { value: 'amber', label: 'Amber', className: 'tone-amber' },
  { value: 'violet', label: 'Violet', className: 'tone-violet' },
  { value: 'muted', label: 'Grey', className: 'tone-muted' },
] as const

export const TEXT_SIZES = [
  { value: 'sm', label: 'Small', className: 'size-sm' },
  { value: 'lg', label: 'Large', className: 'size-lg' },
  { value: 'xl', label: 'Extra large', className: 'size-xl' },
] as const

export const TEXT_FONTS = [
  { value: 'serif', label: 'Serif', className: 'face-serif' },
  { value: 'mono', label: 'Monospace', className: 'face-mono' },
] as const

export const FORMAT_KINDS = ['color', 'size', 'font'] as const
export type FormatKind = (typeof FORMAT_KINDS)[number]

const ENTRIES: Record<
  FormatKind,
  readonly { value: string; className: string }[]
> = {
  color: TEXT_COLORS,
  size: TEXT_SIZES,
  font: TEXT_FONTS,
}

export const FORMAT_CLASSES: readonly string[] = Object.values(ENTRIES).flatMap(
  (entries) => entries.map((entry) => entry.className),
)

export function isFormatKind(value: string): value is FormatKind {
  return (FORMAT_KINDS as readonly string[]).includes(value)
}

export function formatClass(kind: FormatKind, value: string): string | null {
  return ENTRIES[kind].find((entry) => entry.value === value)?.className ?? null
}

/** The inline syntax the toolbar inserts and the renderer understands. */
export function formatMarkup(
  kind: FormatKind,
  value: string,
): { open: string; close: string } | null {
  if (!formatClass(kind, value)) return null
  return { open: `[${kind}=${value}]`, close: `[/${kind}]` }
}
