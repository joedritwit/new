import { useRef, useState } from 'react'
import { IMAGE_MIME_TYPES, MEDIA_LIMITS } from '../shared/forum'
import type { MediaKind, MediaView } from '../shared/types'

/**
 * The browser does the expensive part before the file leaves the device:
 * decode, apply EXIF orientation, resize, and re-encode to WebP. That strips
 * metadata and keeps avatars and post images small. The Worker re-checks and
 * strips again before writing to R2.
 */
export async function prepareImage(
  file: File,
  kind: MediaKind,
): Promise<Blob> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP image.')

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot process images.')

    if (kind === 'avatar') {
      const side = Math.min(bitmap.width, bitmap.height)
      canvas.width = MEDIA_LIMITS.avatarDimension
      canvas.height = MEDIA_LIMITS.avatarDimension
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      )
    } else {
      const ratio = Math.min(
        1,
        MEDIA_LIMITS.maxDimension / Math.max(bitmap.width, bitmap.height),
      )
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82),
    )
    if (!blob) throw new Error('Could not process that image.')
    if (blob.size > MEDIA_LIMITS.imageBytes)
      throw new Error('That image is still too large. Try a smaller one.')
    return blob
  } finally {
    bitmap.close()
  }
}

export async function uploadImage(
  file: File,
  kind: MediaKind,
): Promise<MediaView> {
  const blob = await prepareImage(file, kind)
  const response = await fetch(`/api/uploads?kind=${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  })
  const payload = (await response.json().catch(() => null)) as
    | { media?: MediaView; error?: string }
    | null
  if (!response.ok || !payload?.media)
    throw new Error(payload?.error || 'Could not upload that image.')
  return payload.media
}

export function ImagePicker({
  label,
  kind,
  onUploaded,
  disabled,
}: {
  label: string
  kind: MediaKind
  onUploaded: (media: MediaView) => void | Promise<void>
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function choose(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const media = await uploadImage(file, kind)
      await onUploaded(media)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <span className="image-picker">
      <input
        ref={input}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        className="sr-only"
        onChange={(event) => void choose(event.target.files?.[0])}
        disabled={disabled || busy}
        aria-label={label}
      />
      <button
        type="button"
        className="button ghost small"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Processing…' : label}
      </button>
      {error && (
        <span className="form-error inline" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}

