import type { Extensions } from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { LIMITS } from '../shared/forum'
import { isRichHref } from '../shared/richtext'

export function richExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isRichHref(url),
        HTMLAttributes: {
          rel: 'nofollow ugc noopener',
          target: '_blank',
        },
      },
    }),
    TextStyle,
    Color.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    TextAlign.configure({
      types: ['paragraph', 'blockquote'],
      alignments: ['left', 'center', 'right'],
    }),
    Image.configure({ allowBase64: false, inline: false }),
    Placeholder.configure({ placeholder }),
    CharacterCount.configure({ limit: LIMITS.bodyMax }),
  ]
}
