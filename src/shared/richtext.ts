/** Values shared by the rich-text editor, browser sanitiser, and Worker. */

export const RICH_COLORS = [
  { value: 'rose', label: 'Rose', hex: '#F7A1A1' },
  { value: 'coral', label: 'Coral', hex: '#F08A70' },
  { value: 'amber', label: 'Amber', hex: '#E8C06A' },
  { value: 'lime', label: 'Lime', hex: '#B5D98A' },
  { value: 'mint', label: 'Mint', hex: '#8FD6B4' },
  { value: 'sky', label: 'Sky', hex: '#8FC7F5' },
  { value: 'lilac', label: 'Lilac', hex: '#B9A8E8' },
  { value: 'pink', label: 'Pink', hex: '#E8A3D0' },
  { value: 'crimson', label: 'Crimson', hex: '#E0616B' },
  { value: 'orange', label: 'Orange', hex: '#D98243' },
  { value: 'gold', label: 'Gold', hex: '#C5A13A' },
  { value: 'green', label: 'Green', hex: '#65B98B' },
  { value: 'teal', label: 'Teal', hex: '#4FB3C4' },
  { value: 'blue', label: 'Blue', hex: '#6E9EF0' },
  { value: 'violet', label: 'Violet', hex: '#9A87D6' },
  { value: 'slate', label: 'Slate', hex: '#B3BAC5' },
] as const

export type RichColor = (typeof RICH_COLORS)[number]

export const RICH_SIZES = [10, 12, 16, 18, 24, 32, 48] as const
export const RICH_ALIGNMENTS = ['left', 'center', 'right'] as const
export type RichAlignment = (typeof RICH_ALIGNMENTS)[number]

export const RICH_COLOR_CLASSES = RICH_COLORS.map(
  (color) => `tx-${color.value}`,
)
export const RICH_SIZE_CLASSES = RICH_SIZES.map((size) => `fs-${size}`)
export const RICH_ALIGN_CLASSES = RICH_ALIGNMENTS.map(
  (alignment) => `align-${alignment}`,
)
export const RICH_ALLOWED_CLASSES: readonly string[] = [
  ...RICH_COLOR_CLASSES,
  ...RICH_SIZE_CLASSES,
  ...RICH_ALIGN_CLASSES,
  'timestamp',
]

const RICH_COLOR_BY_HEX = new Map<string, RichColor>(
  RICH_COLORS.map((color) => [color.hex.toLowerCase(), color] as const),
)
const RICH_SIZE_SET = new Set<number>(RICH_SIZES)
const RICH_ALIGN_SET = new Set<string>(RICH_ALIGNMENTS)

/** Tags allowed in stored rich HTML and after rendering it again. */
export const RICH_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'code',
  'pre',
  'span',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  // Legacy Markdown posts can contain GFM tables; the render pass keeps them.
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
] as const

/** Attributes kept by DOMPurify on the client. */
export const RICH_ATTRIBUTES = [
  'href',
  'src',
  'alt',
  'title',
  'class',
  'style',
  'target',
  'rel',
  'data-seconds',
  'align',
] as const

function rgbChannel(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1))
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
    return Math.round((percent / 100) * 255)
  }
  const channel = Number(trimmed)
  return Number.isInteger(channel) && channel >= 0 && channel <= 255
    ? channel
    : null
}

function isOpaqueAlpha(value: string): boolean {
  const trimmed = value.trim()
  const alpha = trimmed.endsWith('%')
    ? Number(trimmed.slice(0, -1)) / 100
    : Number(trimmed)
  return Number.isFinite(alpha) && alpha === 1
}

function normalizeRgbColor(value: string): string | null {
  const match = /^rgba?\((.*)\)$/.exec(value)
  if (!match) return null
  const parts = match[1]!
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
  if (parts.length !== 3 && parts.length !== 4) return null
  const [red, green, blue, alpha] = parts
  if (!red || !green || !blue) return null
  if (alpha !== undefined && !isOpaqueAlpha(alpha)) return null
  const channels = [red, green, blue].map(rgbChannel)
  if (channels.some((channel) => channel === null)) return null
  return `#${channels
    .map((channel) => channel!.toString(16).padStart(2, '0'))
    .join('')}`
}

export function normalizeRichColor(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split('')
      .map((part) => part + part)
      .join('')}`
  }
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  return normalizeRgbColor(normalized)
}

export function richColorFor(value: string): RichColor | null {
  const normalized = normalizeRichColor(value)
  return normalized ? (RICH_COLOR_BY_HEX.get(normalized) ?? null) : null
}

/** Accepts the `16px` strings TipTap's FontSize extension emits. */
export function richSizeFor(value: string): number | null {
  const match = /^(\d{1,2})px$/i.exec(value.trim())
  if (!match) return null
  const size = Number(match[1])
  return RICH_SIZE_SET.has(size) ? size : null
}

export function richAlignmentFor(value: string): RichAlignment | null {
  const normalized = value.trim().toLowerCase()
  return RICH_ALIGN_SET.has(normalized) ? (normalized as RichAlignment) : null
}

/** Keeps editor styles only for values the renderer knows how to map. */
export function filterRichStyles(value: string): string {
  const declarations: string[] = []
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 1) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const raw = declaration.slice(separator + 1).trim()

    if (property === 'color') {
      const color = richColorFor(raw)
      if (color) declarations.push(`color: ${color.hex}`)
    } else if (property === 'font-size') {
      const size = richSizeFor(raw)
      if (size) declarations.push(`font-size: ${size}px`)
    } else if (property === 'text-align') {
      const alignment = richAlignmentFor(raw)
      if (alignment) declarations.push(`text-align: ${alignment}`)
    }
  }
  return declarations.join('; ')
}

/**
 * Links may point at http(s), mailto, a same-origin path, or the `?t=`/`#post`
 * forms the thread view uses. Protocol-relative and script URLs are refused.
 */
export function isRichHref(value: string): boolean {
  const href = value.trim()
  if (!href || /[\u0000-\u001f]/.test(href)) return false
  if (href.startsWith('//')) return false
  if (href.startsWith('/') || href.startsWith('?') || href.startsWith('#'))
    return true
  return /^(?:https?:\/\/|mailto:)/i.test(href)
}

/** In-post images may only point at our own stripped media. */
export function isRichMediaSrc(value: string): boolean {
  return /^\/api\/files\/[0-9a-f-]{36}$/i.test(value.trim())
}
