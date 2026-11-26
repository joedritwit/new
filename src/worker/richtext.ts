import type { Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeSchema,
} from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import {
  RICH_ALIGN_CLASSES,
  RICH_COLOR_CLASSES,
  RICH_SIZE_CLASSES,
  RICH_TAGS,
  isRichHref,
  isRichMediaSrc,
  richAlignmentFor,
  richColorFor,
  richSizeFor,
} from '../shared/richtext'
import { linkTimestamps, type HastNode } from './markdown'

/**
 * Rich posts are produced by TipTap in the browser and sanitised again here.
 * The browser keeps editor styles for the toolbar's colours and sizes; this
 * pass maps those styles to the same allowlisted classes the renderer uses, so
 * the canonical stored HTML never contains CSS.
 */

const ALIGNED_TAGS = new Set(['p', 'blockquote', 'li', 'h1', 'h2', 'h3'])

function addClass(properties: Record<string, unknown>, name: string): void {
  const current = properties.className
  const names = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === 'string')
    : typeof current === 'string'
      ? current.split(/\s+/)
      : []
  if (!names.includes(name)) names.push(name)
  properties.className = names
}

function convertEditorStyles() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === 'element' && node.properties) {
        const style = node.properties.style
        if (typeof style === 'string') {
          for (const declaration of style.split(';')) {
            const separator = declaration.indexOf(':')
            if (separator < 1) continue
            const property = declaration.slice(0, separator).trim().toLowerCase()
            const value = declaration.slice(separator + 1).trim()

            if (property === 'color' && node.tagName === 'span') {
              const color = richColorFor(value)
              if (color) addClass(node.properties, `tx-${color.value}`)
            } else if (property === 'font-size' && node.tagName === 'span') {
              const size = richSizeFor(value)
              if (size) addClass(node.properties, `fs-${size}`)
            } else if (
              property === 'text-align' &&
              node.tagName &&
              ALIGNED_TAGS.has(node.tagName)
            ) {
              const alignment = richAlignmentFor(value)
              if (alignment) addClass(node.properties, `align-${alignment}`)
            }
          }
        }
        delete node.properties.style
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...RICH_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    p: [['className', ...RICH_ALIGN_CLASSES]],
    blockquote: [['className', ...RICH_ALIGN_CLASSES]],
    li: [['className', ...RICH_ALIGN_CLASSES]],
    h1: [['className', ...RICH_ALIGN_CLASSES]],
    h2: [['className', ...RICH_ALIGN_CLASSES]],
    h3: [['className', ...RICH_ALIGN_CLASSES]],
    span: [['className', ...RICH_COLOR_CLASSES, ...RICH_SIZE_CLASSES]],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

function hardenLinks() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (node.type === 'element' && node.tagName === 'a' && node.properties) {
        const href = node.properties.href
        if (typeof href !== 'string' || !isRichHref(href)) {
          delete node.properties.href
        } else {
          node.properties.rel = ['nofollow', 'ugc', 'noopener']
          node.properties.target = '_blank'
        }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}

function restrictImages() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return
      for (const child of node.children) {
        if (child.type === 'element' && child.tagName === 'img') {
          const src = child.properties?.src
          if (typeof src !== 'string' || !isRichMediaSrc(src)) {
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

function textContent(tree: HastNode): string {
  const block = new Set([
    'p',
    'blockquote',
    'pre',
    'li',
    'ul',
    'ol',
    'h1',
    'h2',
    'h3',
    'hr',
  ])

  const walk = (node: HastNode): string => {
    if (node.type === 'text') return node.value ?? ''
    if (node.type === 'element' && node.tagName === 'br') return '\n'
    let text = (node.children ?? []).map(walk).join('')
    if (node.type === 'element' && node.tagName && block.has(node.tagName))
      text = `\n${text}\n`
    return text
  }

  return walk(tree)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function linksIn(tree: HastNode): string[] {
  const links: string[] = []
  const seen = new Set<string>()
  const walk = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href
      if (typeof href === 'string' && !seen.has(href)) {
        seen.add(href)
        links.push(href)
      }
    }
    node.children?.forEach(walk)
  }
  walk(tree)
  return links
}

function transformTree(html: string, timestamps: boolean): HastNode {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(convertEditorStyles)
    .use(rehypeSanitize, sanitizeSchema)
    .use(hardenLinks)
    .use(restrictImages)
  if (timestamps) processor.use(linkTimestamps)
  const parsed = processor.parse(html) as unknown as Root
  return processor.runSync(parsed) as unknown as HastNode
}

const stringify = unified().use(rehypeStringify)

function toHtml(tree: HastNode): string {
  return stringify.stringify(tree as unknown as Root)
}

export type RichHtml = {
  html: string
  text: string
  links: string[]
}

export function sanitizeRichHtml(html: string): RichHtml {
  const tree = transformTree(html, false)
  return {
    html: toHtml(tree),
    text: textContent(tree),
    links: linksIn(tree),
  }
}

export function renderRichHtml(
  html: string,
  options: { linkTimestamps?: boolean } = {},
): RichHtml {
  try {
    const tree = transformTree(html, Boolean(options.linkTimestamps))
    return {
      html: toHtml(tree),
      text: textContent(tree),
      links: linksIn(tree),
    }
  } catch {
    return { html: '', text: '', links: [] }
  }
}
