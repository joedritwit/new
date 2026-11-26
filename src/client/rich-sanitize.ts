import DOMPurify, { type UponSanitizeAttributeHookEvent } from 'dompurify'
import { FORMAT_CLASSES } from '../shared/format'
import {
  RICH_ATTRIBUTES,
  RICH_ALLOWED_CLASSES,
  RICH_TAGS,
  filterRichStyles,
  isRichHref,
  isRichMediaSrc,
} from '../shared/richtext'

/**
 * The browser pass is the first of two. It keeps the editor's inline colour
 * and size styles for the Worker to convert into classes, while keeping links,
 * classes, and image sources on the same allowlist the Worker enforces.
 */

// Legacy Markdown posts still use the tone/size/face classes, so the render
// pass must keep them as well as the newer rich classes.
const POST_CLASSES = new Set([...RICH_ALLOWED_CLASSES, ...FORMAT_CLASSES])

function filterAttribute(
  _node: Element,
  data: UponSanitizeAttributeHookEvent,
): void {
  if (data.attrName === 'class') {
    data.attrValue = data.attrValue
      .split(/\s+/)
      .filter((name) => POST_CLASSES.has(name))
      .join(' ')
  } else if (data.attrName === 'style') {
    data.attrValue = filterRichStyles(data.attrValue)
  } else if (data.attrName === 'href' && !isRichHref(data.attrValue)) {
    data.keepAttr = false
  } else if (data.attrName === 'src' && !isRichMediaSrc(data.attrValue)) {
    data.keepAttr = false
  } else if (
    data.attrName === 'align' &&
    !/^(?:left|center|right)$/i.test(data.attrValue)
  ) {
    data.keepAttr = false
  }
}

let hooked = false
if (!hooked) {
  DOMPurify.addHook('uponSanitizeAttribute', filterAttribute)
  hooked = true
}

const config = {
  ALLOWED_TAGS: [...RICH_TAGS],
  ALLOWED_ATTR: [...RICH_ATTRIBUTES],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/)|[?#])/i,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['data-seconds'],
  FORBID_TAGS: [
    'style',
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'svg',
    'math',
  ],
}

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, config) as string
}
