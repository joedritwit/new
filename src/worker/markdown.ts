import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import {
  FORMAT_CLASSES,
  formatClass,
  isFormatKind,
} from '../shared/format'
import { PEERTUBE_HOSTS } from '../shared/forum'
import type { Embed } from '../shared/types'

/**
 * Markdown is parsed and re-stringified, never echoed. Raw HTML in the source
 * is dropped by remark-rehype, and rehype-sanitize applies GitHub's allowlist
 * on top. Links are hardened after sanitising so the attributes survive.
 */

export type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  value?: string
  children?: HastNode[]
}

type FormatOpen = {
  node: HastNode
  name: string
  openText: string
}

/**
 * Editor-only inline syntax. The toolbar inserts it, and this transform runs
 * before sanitising so only values in `src/shared/format.ts` become elements.
 * Malformed tags stay literal text.
 */
function parseFormatOpen(
  name: string,
  value: string | undefined,
): { tagName: string; className?: string } | null {
  if (name === 'u') return value === undefined ? { tagName: 'u' } : null
  if (value === undefined || !isFormatKind(name)) return null
  const className = formatClass(name, value)
  return className ? { tagName: 'span', className } : null
}

function mergeText(nodes: HastNode[]): HastNode[] {
  const merged: HastNode[] = []
  for (const node of nodes) {
    const previous = merged[merged.length - 1]
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value = `${previous.value ?? ''}${node.value ?? ''}`
      continue
    }
    merged.push(node)
  }
  return merged
}

function processFormatChildren(parent: HastNode): void {
  if (!parent.children) return
  const nodes = mergeText(parent.children)
  const output: HastNode[] = []
  const open: FormatOpen[] = []

  const emit = (node: HastNode) => {
    const current = open[open.length - 1]
    if (current) current.node.children!.push(node)
    else output.push(node)
  }

  for (const child of nodes) {
    if (child.type === 'element') {
      // Code samples stay literal, including any bracket tags.
      if (child.tagName !== 'code' && child.tagName !== 'pre')
        processFormatChildren(child)
      emit(child)
      continue
    }
    if (child.type !== 'text' || !child.value) {
      emit(child)
      continue
    }

    let last = 0
    for (const match of child.value.matchAll(
      /\[(\/?)(u|color|size|font)(?:=([a-z]+))?\]/gi,
    )) {
      const index = match.index ?? 0
      if (index > last)
        emit({ type: 'text', value: child.value.slice(last, index) })

      const closing = match[1] === '/'
      const name = match[2]!.toLowerCase()
      const value = match[3]?.toLowerCase()

      if (closing) {
        const current = open[open.length - 1]
        if (current?.name === name && value === undefined) {
          open.pop()
          emit(current.node)
        } else {
          emit({ type: 'text', value: match[0] })
        }
      } else {
        const parsed = parseFormatOpen(name, value)
        if (!parsed) {
          emit({ type: 'text', value: match[0] })
        } else {
          open.push({
            node: {
              type: 'element',
              tagName: parsed.tagName,
              properties: parsed.className
                ? { className: [parsed.className] }
                : {},
              children: [],
            },
            name,
            openText: match[0],
          })
        }
      }
      last = index + match[0].length
    }
    if (last < child.value.length)
      emit({ type: 'text', value: child.value.slice(last) })
  }

  // Unclosed tags are shown as typed rather than swallowing the text.
  while (open.length) {
    const format = open.pop()!
    emit({ type: 'text', value: format.openText })
    for (const child of format.node.children ?? []) emit(child)
  }

  parent.children = output
}

function formatSpans() {
  return (tree: HastNode) => {
    processFormatChildren(tree)
  }
}

const spanClassName: [string, ...string[]] = [
  'className',
  ...FORMAT_CLASSES,
]

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'span'],
  attributes: {
    ...defaultSchema.attributes,
    span: [spanClassName],
  },
}

function hardenLinks() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === 'element' && node.tagName === 'a') {
        node.properties = {
          ...node.properties,
          rel: ['nofollow', 'ugc', 'noopener'],
          target: '_blank',
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

/** In-post images may only point at our own stripped media. */
function restrictImages() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return
      for (const child of node.children) {
        if (child.type === 'element' && child.tagName === 'img') {
          const src = child.properties?.src
          if (
            typeof src !== 'string' ||
            !/^\/api\/files\/[0-9a-f-]{36}$/i.test(src)
          ) {
            child.type = 'text'
            child.tagName = undefined
            child.properties = undefined
            child.value = ''
            child.children = undefined
          }
        } else {
          walk(child)
        }
      }
    }
    walk(tree)
  }
}

function secondsOfStamp(value: string): number | null {
  const parts = value.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return seconds! < 60 ? minutes! * 60 + seconds! : null
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return minutes! < 60 && seconds! < 60
      ? hours! * 3600 + minutes! * 60 + seconds!
      : null
  }
  return null
}

const STAMP = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g

/** Turns timestamps in prose into links that seek the thread's video. */
export function linkTimestamps() {
  return (tree: HastNode) => {
    const split = (value: string): HastNode[] => {
      const nodes: HastNode[] = []
      let last = 0
      for (const match of value.matchAll(STAMP)) {
        const seconds = secondsOfStamp(match[1]!)
        if (seconds === null) continue
        if (match.index! > last)
          nodes.push({ type: 'text', value: value.slice(last, match.index) })
        nodes.push({
          type: 'element',
          tagName: 'a',
          properties: {
            className: ['timestamp'],
            href: `?t=${seconds}`,
            dataSeconds: String(seconds),
            title: `Play from ${match[1]}`,
          },
          children: [{ type: 'text', value: match[1]! }],
        })
        last = match.index! + match[0].length
      }
      if (last === 0) return [{ type: 'text', value }]
      if (last < value.length)
        nodes.push({ type: 'text', value: value.slice(last) })
      return nodes
    }

    const walk = (node: HastNode) => {
      if (!node.children) return
      const next: HastNode[] = []
      for (const child of node.children) {
        if (
          child.type === 'element' &&
          (child.tagName === 'a' || child.tagName === 'code' || child.tagName === 'pre')
        ) {
          next.push(child)
          continue
        }
        if (child.type === 'text' && child.value) next.push(...split(child.value))
        else {
          walk(child)
          next.push(child)
        }
      }
      node.children = next
    }
    walk(tree)
  }
}

const processors = {
  plain: unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(formatSpans)
    .use(rehypeSanitize, sanitizeSchema)
    .use(restrictImages)
    .use(hardenLinks)
    .use(rehypeStringify),
  timestamps: unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(formatSpans)
    .use(rehypeSanitize, sanitizeSchema)
    .use(restrictImages)
    .use(hardenLinks)
    .use(linkTimestamps)
    .use(rehypeStringify),
}

type Provider = {
  provider: Embed['provider']
  pattern: RegExp
  pageUrl: (id: string) => string
  seekable: boolean
}

const MEDIA_PATTERNS: Provider[] = [
  {
    provider: 'youtube',
    pattern:
      /^https?:\/\/(?:www\.)?(?:m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{6,20})/i,
    pageUrl: (id) => `https://www.youtube.com/watch?v=${id}`,
    seekable: true,
  },
  {
    provider: 'rumble',
    pattern: /^https?:\/\/(?:www\.)?rumble\.com\/(v[\w-]+)/i,
    pageUrl: (id) => `https://rumble.com/${id}`,
    seekable: false,
  },
  {
    provider: 'vimeo',
    pattern: /^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i,
    pageUrl: (id) => `https://vimeo.com/${id}`,
    seekable: true,
  },
  {
    provider: 'peertube',
    pattern: /^https?:\/\/([\w.-]+)\/(?:w|videos\/watch)\/([\w-]{8,40})/i,
    pageUrl: (id) => {
      const [host, uuid] = id.split('/')
      return `https://${host}/w/${uuid}`
    },
    seekable: true,
  },
  {
    provider: 'archive',
    pattern: /^https?:\/\/(?:www\.)?archive\.org\/details\/([\w.-]{2,80})/i,
    pageUrl: (id) => `https://archive.org/details/${id}`,
    seekable: true,
  },
  {
    provider: 'x',
    pattern:
      /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{5,25})/i,
    pageUrl: (id) => `https://x.com/${id}`,
    seekable: false,
  },
]

function parseDuration(raw: string): number | undefined {
  const direct = Number(raw)
  if (Number.isFinite(direct) && direct >= 0) return Math.floor(direct)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(raw)
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  )
}

function parseStart(url: string): number | undefined {
  try {
    const parsed = new URL(url)
    const raw =
      parsed.searchParams.get('start') ??
      parsed.searchParams.get('startTime') ??
      parsed.searchParams.get('t')
    if (raw) {
      const start = parseDuration(raw) ?? secondsOfStamp(raw) ?? undefined
      if (start !== undefined) return start
    }
    const hash = parsed.hash.replace(/^#/, '')
    const match = /^(?:t|start)=(.+)$/.exec(hash)
    if (match) {
      return parseDuration(match[1]!) ?? secondsOfStamp(match[1]!) ?? undefined
    }
  } catch {
    return undefined
  }
  return undefined
}

export function extractEmbeds(source: string, limit = 3): Embed[] {
  const found: Embed[] = []
  const seen = new Set<string>()

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (!/^https?:\/\//i.test(line)) continue
    for (const media of MEDIA_PATTERNS) {
      const match = media.pattern.exec(line)
      if (!match) continue
      let id =
        media.provider === 'x'
          ? `${match[1]}/${match[2]}`
          : media.provider === 'peertube'
            ? `${match[1]}/${match[2]}`
            : (match[1] ?? '')
      if (!id) continue
      if (media.provider === 'peertube') {
        const host = match[1]?.toLowerCase()
        if (!host || !(PEERTUBE_HOSTS as readonly string[]).includes(host)) continue
      }
      if (media.provider === 'x') id = `${match[1]}/${match[2]}`
      const key = `${media.provider}:${id}`
      if (seen.has(key)) continue
      seen.add(key)
      const start = media.seekable ? parseStart(line) : undefined
      found.push({
        provider: media.provider,
        id,
        url: media.pageUrl(id),
        ...(start !== undefined ? { start } : {}),
      })
      break
    }
    if (found.length >= limit) break
  }

  return found
}

export function extractEmbedsFromUrls(urls: string[], limit = 3): Embed[] {
  return extractEmbeds(urls.join('\n'), limit)
}

export function isSeekableEmbed(embed: Embed): boolean {
  return MEDIA_PATTERNS.some(
    (media) => media.provider === embed.provider && media.seekable,
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMarkdown(
  source: string,
  options: { linkTimestamps?: boolean } = {},
): {
  html: string
  embeds: Embed[]
} {
  let html: string
  try {
    html = processors[options.linkTimestamps ? 'timestamps' : 'plain']
      .processSync(source)
      .toString()
  } catch {
    html = `<p>${escapeHtml(source)}</p>`
  }
  return { html, embeds: extractEmbeds(source) }
}
