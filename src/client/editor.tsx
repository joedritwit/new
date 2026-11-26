import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { LIMITS } from '../shared/forum'
import {
  RICH_ALIGNMENTS,
  RICH_COLORS,
  RICH_SIZES,
  isRichHref,
  richColorFor,
  richSizeFor,
  type RichAlignment,
} from '../shared/richtext'
import { ImagePicker } from './media'
import { richExtensions } from './rich-extensions'
import { sanitizeRichHtml } from './rich-sanitize'

type Panel = 'format' | 'align' | 'insert' | 'emoji'
type FormatView = 'main' | 'sizes' | 'colors'
type InsertView = 'menu' | 'image' | 'link' | 'embed'
type MarkName = 'bold' | 'italic' | 'underline' | 'strike'

type ToolbarState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  blockquote: boolean
  bulletList: boolean
  orderedList: boolean
  codeBlock: boolean
  align: RichAlignment
  color: string | null
  fontSize: number | null
  characters: number
  canUndo: boolean
}

const EMPTY_TOOLBAR: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  codeBlock: false,
  align: 'left',
  color: null,
  fontSize: null,
  characters: 0,
  canUndo: false,
}

const EMOJI = [
  '😀',
  '😂',
  '😅',
  '😊',
  '😍',
  '🤔',
  '😎',
  '😢',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '🔥',
  '✅',
  '❌',
  '⚠️',
  '📌',
  '🎥',
  '📷',
  '⚖️',
  '🇺🇸',
  '🚨',
]

/** Builds an editable quote from a post's plain text. */
export function quoteContent(text: string): JSONContent {
  const paragraphs = text
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    }))

  return {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content:
          paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }],
      },
      { type: 'paragraph' },
    ],
  }
}

export function PostEditor({
  header,
  submitLabel = 'POST',
  placeholder,
  initialContent,
  meta,
  headAction,
  hint,
  canSubmit = true,
  resetOnSuccess = false,
  onSubmit,
}: {
  header: string
  submitLabel?: string
  placeholder: string
  initialContent?: JSONContent | string
  meta?: ReactNode
  headAction?: ReactNode
  hint?: string
  canSubmit?: boolean
  resetOnSuccess?: boolean
  onSubmit: (html: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [formatView, setFormatView] = useState<FormatView>('main')
  const [insertView, setInsertView] = useState<InsertView>('menu')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const barRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: richExtensions(placeholder),
    content: initialContent ?? '',
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'wysiwyg-prosemirror',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Post body',
        spellcheck: 'true',
      },
      transformPastedHTML: (html) => sanitizeRichHtml(html),
    },
    onCreate: ({ editor: created }) => setText(created.getText()),
    onUpdate: ({ editor: updated }) => setText(updated.getText()),
  })

  const toolbar =
    useEditorState({
      editor,
      selector: ({ editor: current }): ToolbarState => {
        if (!current) return EMPTY_TOOLBAR
        const rawColor = current.getAttributes('textStyle').color
        const rawSize = current.getAttributes('textStyle').fontSize
        return {
          bold: current.isActive('bold'),
          italic: current.isActive('italic'),
          underline: current.isActive('underline'),
          strike: current.isActive('strike'),
          blockquote: current.isActive('blockquote'),
          bulletList: current.isActive('bulletList'),
          orderedList: current.isActive('orderedList'),
          codeBlock: current.isActive('codeBlock'),
          align: current.isActive({ textAlign: 'center' })
            ? 'center'
            : current.isActive({ textAlign: 'right' })
              ? 'right'
              : 'left',
          color: typeof rawColor === 'string' ? rawColor : null,
          fontSize:
            typeof rawSize === 'string' ? richSizeFor(rawSize) : null,
          characters: current.storage.characterCount.characters() as number,
          canUndo: current.can().chain().undo().run(),
        }
      },
    }) ?? EMPTY_TOOLBAR

  const hasFormat =
    toolbar.bold ||
    toolbar.italic ||
    toolbar.underline ||
    toolbar.strike ||
    toolbar.blockquote ||
    toolbar.color !== null ||
    toolbar.fontSize !== null
  const hasAlignment =
    toolbar.align !== 'left' || toolbar.bulletList || toolbar.orderedList
  const activeColor = toolbar.color ? richColorFor(toolbar.color) : null

  function closePanel(): void {
    setPanel(null)
    setLinkError('')
  }

  function togglePanel(next: Panel, event: MouseEvent<HTMLButtonElement>) {
    setAnchor(event.currentTarget)
    setPanel((current) => (current === next ? null : next))
    setLinkError('')
    if (next === 'format') setFormatView('main')
    if (next === 'insert') {
      setInsertView('menu')
      setLinkUrl('')
    }
  }

  useLayoutEffect(() => {
    if (!editor) return
    editor.setEditable(!busy)
  }, [busy, editor])

  useLayoutEffect(() => {
    if (!panel) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-wysiwyg-trigger]'))
        return
      closePanel()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [panel])

  function applyMark(mark: MarkName): void {
    if (!editor) return
    const chain = editor.chain().focus()
    if (mark === 'bold') chain.toggleBold().run()
    else if (mark === 'italic') chain.toggleItalic().run()
    else if (mark === 'underline') chain.toggleUnderline().run()
    else chain.toggleStrike().run()
  }

  function applyBlockquote(): void {
    editor?.chain().focus().toggleBlockquote().run()
  }

  function applyClear(): void {
    editor?.chain().focus().unsetAllMarks().unsetTextAlign().run()
  }

  function applyColor(hex: string | null): void {
    if (!editor) return
    if (hex) editor.chain().focus().setColor(hex).run()
    else editor.chain().focus().unsetColor().run()
  }

  function applySize(size: number | null): void {
    if (!editor) return
    if (size === null) editor.chain().focus().unsetFontSize().run()
    else editor.chain().focus().setFontSize(`${size}px`).run()
  }

  function applyAlignment(alignment: RichAlignment): void {
    editor?.chain().focus().setTextAlign(alignment).run()
  }

  function applyList(kind: 'bullet' | 'ordered'): void {
    if (!editor) return
    if (kind === 'bullet') editor.chain().focus().toggleBulletList().run()
    else editor.chain().focus().toggleOrderedList().run()
  }

  function applyCode(): void {
    editor?.chain().focus().toggleCodeBlock().run()
  }

  function normalizeLink(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const href = /^(?:https?:\/\/|mailto:|\/|\?|#)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    return isRichHref(href) ? href : null
  }

  function insertLink(kind: 'link' | 'embed'): void {
    if (!editor) return
    const href = normalizeLink(linkUrl)
    if (!href) {
      setLinkError('Enter an http(s) link.')
      return
    }

    if (kind === 'link' && !editor.state.selection.empty) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: href,
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run()
    }

    setLinkUrl('')
    setLinkError('')
    setInsertView('menu')
    closePanel()
  }

  function insertEmoji(emoji: string): void {
    editor?.chain().focus().insertContent(emoji).run()
    closePanel()
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editor || busy || !canSubmit) return
    const plain = editor.getText().trim()
    if (!plain) {
      setError('Write something before posting.')
      return
    }
    if (plain.length > LIMITS.bodyMax) {
      setError(`Posts are limited to ${LIMITS.bodyMax} characters.`)
      return
    }

    setBusy(true)
    setError('')
    setPanel(null)
    try {
      await onSubmit(sanitizeRichHtml(editor.getHTML()))
      if (resetOnSuccess) {
        editor.commands.clearContent(true)
        setText('')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post.')
    } finally {
      setBusy(false)
    }
  }

  const popoverLabel =
    panel === 'format'
      ? 'Text formatting'
      : panel === 'align'
        ? 'Alignment and lists'
        : panel === 'insert'
          ? 'Insert'
          : 'Emoji'

  return (
    <form className="wysiwyg-panel" onSubmit={submit}>
      <header className="wysiwyg-head">
        <h2>{header}</h2>
        {headAction}
      </header>
      {meta}
      <div
        className="wysiwyg-canvas"
        onPointerDown={() => setPanel(null)}
        onFocusCapture={() => setPanel(null)}
      >
        <EditorContent editor={editor} />
      </div>
      {hint && <p className="hint wysiwyg-hint">{hint}</p>}
      {error && (
        <p className="form-error wysiwyg-error" role="alert">
          {error}
        </p>
      )}

      <div className="wysiwyg-bar" ref={barRef}>
        <button
          className="wysiwyg-post"
          disabled={busy || !text.trim() || !canSubmit}
          type="submit"
        >
          {busy ? 'POSTING…' : submitLabel}
        </button>
        <span className="wysiwyg-count" aria-label="Character count">
          {toolbar.characters}/{LIMITS.bodyMax}
        </span>
        <div className="wysiwyg-tools">
          <button
            type="button"
            className="wysiwyg-tool"
            title="Undo"
            aria-label="Undo"
            disabled={!toolbar.canUndo || busy}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <span aria-hidden="true">↺</span>
          </button>
          <button
            type="button"
            className={`wysiwyg-tool${hasFormat || panel === 'format' ? ' is-active' : ''}`}
            title="Text formatting"
            aria-label="Text formatting"
            aria-expanded={panel === 'format'}
            data-wysiwyg-trigger
            onClick={(event) => togglePanel('format', event)}
          >
            <span className="tool-glyph" aria-hidden="true">
              T
            </span>
          </button>
          <button
            type="button"
            className={`wysiwyg-tool${hasAlignment || panel === 'align' ? ' is-active' : ''}`}
            title="Alignment and lists"
            aria-label="Alignment and lists"
            aria-expanded={panel === 'align'}
            data-wysiwyg-trigger
            onClick={(event) => togglePanel('align', event)}
          >
            <AlignIcon align={toolbar.align} />
          </button>
          <button
            type="button"
            className={`wysiwyg-tool${panel === 'insert' ? ' is-active' : ''}`}
            title="Insert"
            aria-label="Insert"
            aria-expanded={panel === 'insert'}
            data-wysiwyg-trigger
            onClick={(event) => togglePanel('insert', event)}
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className={`wysiwyg-tool${panel === 'emoji' ? ' is-active' : ''}`}
            title="Emoji"
            aria-label="Emoji"
            aria-expanded={panel === 'emoji'}
            data-wysiwyg-trigger
            onClick={(event) => togglePanel('emoji', event)}
          >
            <span aria-hidden="true">☺</span>
          </button>
          <button
            type="button"
            className={`wysiwyg-tool${toolbar.codeBlock ? ' is-active' : ''}`}
            title="Code block"
            aria-label="Code block"
            aria-pressed={toolbar.codeBlock}
            onClick={applyCode}
          >
            <span className="tool-code" aria-hidden="true">
              {'{}'}
            </span>
          </button>
        </div>

        {panel && anchor && (
          <Popover
            anchor={anchor}
            bar={barRef}
            panelRef={popoverRef}
            label={popoverLabel}
          >
            {panel === 'format' && (
              <FormatPanel
                view={formatView}
                setView={setFormatView}
                toolbar={toolbar}
                activeColor={activeColor}
                onMark={applyMark}
                onBlockquote={applyBlockquote}
                onClear={applyClear}
                onColor={applyColor}
                onSize={applySize}
              />
            )}
            {panel === 'align' && (
              <AlignmentPanel
                toolbar={toolbar}
                onAlignment={applyAlignment}
                onList={applyList}
              />
            )}
            {panel === 'insert' && (
              <InsertPanel
                view={insertView}
                setView={setInsertView}
                linkUrl={linkUrl}
                setLinkUrl={setLinkUrl}
                error={linkError}
                onLink={insertLink}
                onImage={() => setInsertView('image')}
                editor={editor}
                onImageInserted={closePanel}
              />
            )}
            {panel === 'emoji' && (
              <EmojiPanel onEmoji={insertEmoji} />
            )}
          </Popover>
        )}
      </div>
    </form>
  )
}

function FormatPanel({
  view,
  setView,
  toolbar,
  activeColor,
  onMark,
  onBlockquote,
  onClear,
  onColor,
  onSize,
}: {
  view: FormatView
  setView: (view: FormatView) => void
  toolbar: ToolbarState
  activeColor: ReturnType<typeof richColorFor>
  onMark: (mark: MarkName) => void
  onBlockquote: () => void
  onClear: () => void
  onColor: (hex: string | null) => void
  onSize: (size: number | null) => void
}) {
  if (view === 'sizes') {
    return (
      <>
        <PopoverHead title="Text size" onBack={() => setView('main')} />
        <div className="size-grid" role="group" aria-label="Text sizes">
          {RICH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`size-chip fs-${size}${toolbar.fontSize === size ? ' is-active' : ''}`}
              aria-label={`${size} pixels`}
              aria-pressed={toolbar.fontSize === size}
              onClick={() => onSize(size)}
            >
              {size}
            </button>
          ))}
          <button
            type="button"
            className={`size-chip size-default${toolbar.fontSize === null ? ' is-active' : ''}`}
            aria-pressed={toolbar.fontSize === null}
            onClick={() => onSize(null)}
          >
            Default
          </button>
        </div>
      </>
    )
  }

  if (view === 'colors') {
    return (
      <>
        <PopoverHead title="Text colour" onBack={() => setView('main')} />
        <div className="color-grid" role="group" aria-label="Text colours">
          {RICH_COLORS.map((color) => {
            const active = activeColor?.value === color.value
            return (
              <button
                key={color.value}
                type="button"
                className={`color-swatch${active ? ' is-active' : ''}`}
                style={{ '--swatch': color.hex } as CSSProperties}
                aria-label={color.label}
                aria-pressed={active}
                title={color.label}
                onClick={() => onColor(color.hex)}
              />
            )
          })}
        </div>
        <button
          type="button"
          className="fmt-wide color-reset"
          onClick={() => onColor(null)}
        >
          <span className="color-reset-mark" aria-hidden="true" />
          Default colour
        </button>
      </>
    )
  }

  return (
    <>
      <PopoverHead title="Formatting" />
      <div className="fmt-grid" role="group" aria-label="Text formatting">
        <button
          type="button"
          className={`fmt-tool fmt-bold${toolbar.bold ? ' is-active' : ''}`}
          aria-label="Bold"
          aria-pressed={toolbar.bold}
          title="Bold"
          onClick={() => onMark('bold')}
        >
          B
        </button>
        <button
          type="button"
          className={`fmt-tool fmt-italic${toolbar.italic ? ' is-active' : ''}`}
          aria-label="Italic"
          aria-pressed={toolbar.italic}
          title="Italic"
          onClick={() => onMark('italic')}
        >
          I
        </button>
        <button
          type="button"
          className={`fmt-tool fmt-underline${toolbar.underline ? ' is-active' : ''}`}
          aria-label="Underline"
          aria-pressed={toolbar.underline}
          title="Underline"
          onClick={() => onMark('underline')}
        >
          U
        </button>
        <button
          type="button"
          className={`fmt-tool fmt-strike${toolbar.strike ? ' is-active' : ''}`}
          aria-label="Strikethrough"
          aria-pressed={toolbar.strike}
          title="Strikethrough"
          onClick={() => onMark('strike')}
        >
          S
        </button>
        <button
          type="button"
          className={`fmt-tool${toolbar.fontSize !== null ? ' is-active' : ''}`}
          aria-label="Text size"
          aria-haspopup="true"
          onClick={() => setView('sizes')}
        >
          Aa
        </button>
        <button
          type="button"
          className={`fmt-tool${activeColor ? ' is-active' : ''}`}
          aria-label="Text colour"
          aria-haspopup="true"
          onClick={() => setView('colors')}
        >
          <span
            className="color-dot"
            style={
              {
                '--swatch': activeColor?.hex ?? '#8e96a3',
              } as CSSProperties
            }
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className={`fmt-tool fmt-quote${toolbar.blockquote ? ' is-active' : ''}`}
          aria-label="Blockquote"
          aria-pressed={toolbar.blockquote}
          title="Blockquote"
          onClick={onBlockquote}
        >
          “
        </button>
        <button
          type="button"
          className="fmt-tool fmt-clear"
          aria-label="Clear formatting"
          title="Clear formatting"
          onClick={onClear}
        >
          Tx
        </button>
      </div>
      <p className="popover-hint">
        Applies to selected text, or to what you type next.
      </p>
    </>
  )
}

function AlignmentPanel({
  toolbar,
  onAlignment,
  onList,
}: {
  toolbar: ToolbarState
  onAlignment: (alignment: RichAlignment) => void
  onList: (kind: 'bullet' | 'ordered') => void
}) {
  return (
    <>
      <PopoverHead title="Alignment & lists" />
      <div className="align-grid" role="group" aria-label="Alignment">
        {RICH_ALIGNMENTS.map((alignment) => (
          <button
            key={alignment}
            type="button"
            className={`fmt-tool${toolbar.align === alignment ? ' is-active' : ''}`}
            aria-label={`Align ${alignment}`}
            aria-pressed={toolbar.align === alignment}
            title={`Align ${alignment}`}
            onClick={() => onAlignment(alignment)}
          >
            <AlignIcon align={alignment} />
          </button>
        ))}
      </div>
      <div className="list-grid">
        <button
          type="button"
          className={`fmt-wide${toolbar.bulletList ? ' is-active' : ''}`}
          aria-pressed={toolbar.bulletList}
          onClick={() => onList('bullet')}
        >
          <span aria-hidden="true">•</span> Bulleted list
        </button>
        <button
          type="button"
          className={`fmt-wide${toolbar.orderedList ? ' is-active' : ''}`}
          aria-pressed={toolbar.orderedList}
          onClick={() => onList('ordered')}
        >
          <span aria-hidden="true">1.</span> Numbered list
        </button>
      </div>
    </>
  )
}

function InsertPanel({
  view,
  setView,
  linkUrl,
  setLinkUrl,
  error,
  onLink,
  onImage,
  editor,
  onImageInserted,
}: {
  view: InsertView
  setView: (view: InsertView) => void
  linkUrl: string
  setLinkUrl: (value: string) => void
  error: string
  onLink: (kind: 'link' | 'embed') => void
  onImage: () => void
  editor: ReturnType<typeof useEditor>
  onImageInserted: () => void
}) {
  if (view === 'image') {
    return (
      <>
        <PopoverHead title="Insert image" onBack={() => setView('menu')} />
        <ImagePicker
          label="Choose image"
          kind="post_image"
          onUploaded={(media) => {
            editor?.chain().focus().setImage({ src: media.url, alt: '' }).run()
            onImageInserted()
          }}
        />
        <p className="popover-hint">JPEG, PNG, or WebP, up to 2 MB.</p>
      </>
    )
  }

  if (view === 'link' || view === 'embed') {
    const isEmbed = view === 'embed'
    return (
      <>
        <PopoverHead
          title={isEmbed ? 'Poll / embed link' : 'Insert hyperlink'}
          onBack={() => setView('menu')}
        />
        <div className="wysiwyg-inline-form">
          <input
            className="input"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onLink(isEmbed ? 'embed' : 'link')
              }
            }}
            placeholder="https://example.com"
            aria-label={isEmbed ? 'Poll or embed URL' : 'Link URL'}
            inputMode="url"
          />
          <button
            type="button"
            className="wysiwyg-action"
            onClick={() => onLink(isEmbed ? 'embed' : 'link')}
            disabled={!linkUrl.trim()}
          >
            Insert
          </button>
        </div>
        {error && (
          <p className="form-error inline" role="alert">
            {error}
          </p>
        )}
        <p className="popover-hint">
          {isEmbed
            ? 'Known video and poll links render as an embed above the post.'
            : 'Select text first to turn it into a link.'}
        </p>
      </>
    )
  }

  return (
    <>
      <PopoverHead title="Insert" />
      <div className="insert-grid">
        <button type="button" className="insert-tool" onClick={onImage}>
          <span className="insert-mark" aria-hidden="true">
            ▧
          </span>
          <span>Image</span>
        </button>
        <button
          type="button"
          className="insert-tool"
          onClick={() => setView('link')}
        >
          <span className="insert-mark" aria-hidden="true">
            ↗
          </span>
          <span>Hyperlink</span>
        </button>
        <button
          type="button"
          className="insert-tool"
          onClick={() => setView('embed')}
        >
          <span className="insert-mark" aria-hidden="true">
            ▶
          </span>
          <span>Poll / Embed</span>
        </button>
      </div>
    </>
  )
}

function EmojiPanel({ onEmoji }: { onEmoji: (emoji: string) => void }) {
  return (
    <>
      <PopoverHead title="Emoji" />
      <div className="emoji-grid" role="group" aria-label="Emoji">
        {EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-button"
            aria-label={`Insert ${emoji}`}
            onClick={() => onEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  )
}

function PopoverHead({
  title,
  onBack,
}: {
  title: string
  onBack?: () => void
}) {
  return (
    <div className="popover-head">
      {onBack ? (
        <button
          type="button"
          className="popover-back"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>
      ) : (
        <span className="popover-mark" aria-hidden="true">
          T
        </span>
      )}
      <span>{title}</span>
    </div>
  )
}

function AlignIcon({ align }: { align: RichAlignment }) {
  const x =
    align === 'center'
      ? [3, 7, 3, 5]
      : align === 'right'
        ? [3, 9, 5, 7]
        : [3, 5, 3, 7]
  const width =
    align === 'center'
      ? [12, 6, 10, 8]
      : align === 'right'
        ? [10, 4, 8, 6]
        : [12, 6, 10, 8]

  return (
    <svg
      viewBox="0 0 18 18"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      {[3, 7, 11, 15].map((y, index) => (
        <line
          key={y}
          x1={x[index]}
          x2={x[index]! + width[index]!}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function Popover({
  anchor,
  bar,
  panelRef,
  label,
  children,
}: {
  anchor: HTMLElement
  bar: RefObject<HTMLDivElement | null>
  panelRef: RefObject<HTMLDivElement | null>
  label: string
  children: ReactNode
}) {
  const [left, setLeft] = useState(8)
  const [width, setWidth] = useState(286)
  const [arrow, setArrow] = useState(20)

  useLayoutEffect(() => {
    const barElement = bar.current
    if (!barElement) return
    const update = () => {
      const barRect = barElement.getBoundingClientRect()
      const triggerRect = anchor.getBoundingClientRect()
      if (!barRect.width) return
      const nextWidth = Math.max(
        190,
        Math.min(286, Math.round(barRect.width - 16)),
      )
      const center = triggerRect.left - barRect.left + triggerRect.width / 2
      const nextLeft = Math.max(
        8,
        Math.min(center - nextWidth / 2, barRect.width - nextWidth - 8),
      )
      setWidth(nextWidth)
      setLeft(nextLeft)
      setArrow(Math.max(14, Math.min(center - nextLeft, nextWidth - 14)))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [anchor, bar])

  return (
    <div
      className="wysiwyg-popover-wrap"
      ref={panelRef}
      style={
        {
          left,
          width,
          '--arrow-left': `${arrow}px`,
        } as CSSProperties
      }
    >
      <div className="wysiwyg-popover" role="dialog" aria-label={label}>
        {children}
      </div>
      <span className="wysiwyg-popover-arrow" aria-hidden="true" />
    </div>
  )
}
