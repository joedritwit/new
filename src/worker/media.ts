import { MEDIA_LIMITS } from '../shared/forum'
import type { MediaKind, MediaView } from '../shared/types'

/**
 * Media is intentionally small: avatars, board banners, and in-post images.
 * Video is never uploaded; threads embed links to a provider instead.
 *
 * Every upload is sniffed by magic bytes, walked with a pure-JS container
 * parser, and rewritten without metadata before it reaches R2. The browser
 * also re-encodes through a canvas, so the server pass is defence in depth
 * for API clients and for anything the canvas does not remove.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export type ParsedImage = {
  mime: ImageMime
  width: number
  height: number
}

type MediaRow = {
  id: string
  ownerId: string
  kind: MediaKind
  objectKey: string
  mime: string
  bytes: number
  width: number
  height: number
  sha256: string
  status: 'active' | 'removed'
  createdAt: number
}

export type MediaResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string }

const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
])

const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'sRGB',
  'cHRM',
  'pHYs',
  'bKGD',
  'sBIT',
  'hIST',
])

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  )
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  )
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1)
    out += String.fromCharCode(bytes[offset + index] ?? 0)
  return out
}

export function sniffImage(bytes: Uint8Array): ParsedImage | null {
  if (bytes.length < 12) return null

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes)
    return size ? { mime: 'image/jpeg', ...size } : null
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    if (bytes.length < 33 || readAscii(bytes, 12, 4) !== 'IHDR') return null
    return {
      mime: 'image/png',
      width: readU32(bytes, 16),
      height: readU32(bytes, 20),
    }
  }

  if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    const size = webpSize(bytes)
    return size ? { mime: 'image/webp', ...size } : null
  }

  return null
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    let marker = bytes[offset + 1]!
    offset += 2
    while (marker === 0xff) {
      marker = bytes[offset]!
      offset += 1
    }
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker >= 0xd0 && marker <= 0xd7) continue
    const length = readU16(bytes, offset)
    if (length < 2 || offset + length > bytes.length) return null
    if (JPEG_SOF.has(marker)) {
      const height = readU16(bytes, offset + 3)
      const width = readU16(bytes, offset + 5)
      return width && height ? { width, height } : null
    }
    offset += length
  }
  return null
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4)
    const size = readU32LE(bytes, offset + 4)
    const data = offset + 8
    if (data + size > bytes.length) return null
    if (type === 'VP8X' && size >= 10) {
      const width = 1 + (bytes[data + 4]! | (bytes[data + 5]! << 8) | (bytes[data + 6]! << 16))
      const height = 1 + (bytes[data + 7]! | (bytes[data + 8]! << 8) | (bytes[data + 9]! << 16))
      return { width, height }
    }
    if (type === 'VP8 ' && size >= 10) {
      if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a)
        return null
      return {
        width: (bytes[data + 6]! | (bytes[data + 7]! << 8)) & 0x3fff,
        height: (bytes[data + 8]! | (bytes[data + 9]! << 8)) & 0x3fff,
      }
    }
    if (type === 'VP8L' && size >= 5) {
      const bits =
        (bytes[data + 1]! |
          (bytes[data + 2]! << 8) |
          (bytes[data + 3]! << 16) |
          (bytes[data + 4]! << 24)) >>>
        0
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      }
    }
    offset = data + size + (size % 2)
  }
  return null
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8]
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]!
    if (marker === 0xd9) {
      out.push(0xff, 0xd9)
      break
    }
    if (marker === 0xda) {
      // Everything from the start of the scan to EOI is image data.
      for (let index = offset; index < bytes.length; index += 1)
        out.push(bytes[index]!)
      break
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(0xff, marker)
      offset += 2
      continue
    }
    const length = readU16(bytes, offset + 2)
    if (length < 2 || offset + 2 + length > bytes.length) break
    const drop =
      marker === 0xe1 || // EXIF / XMP
      marker === 0xe2 || // ICC
      marker === 0xed || // IPTC
      marker === 0xfe // comment
    if (!drop) {
      for (let index = offset; index < offset + 2 + length; index += 1)
        out.push(bytes[index]!)
    }
    offset += 2 + length
  }
  return new Uint8Array(out)
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const out: number[] = Array.from(bytes.slice(0, 8))
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset)
    const type = readAscii(bytes, offset + 4, 4)
    const end = offset + 12 + length
    if (end > bytes.length) break
    if (PNG_KEEP.has(type)) {
      for (let index = offset; index < end; index += 1) out.push(bytes[index]!)
    }
    offset = end
    if (type === 'IEND') break
  }
  return new Uint8Array(out)
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks: { type: string; data: Uint8Array }[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4)
    const size = readU32LE(bytes, offset + 4)
    const dataStart = offset + 8
    if (dataStart + size > bytes.length) break
    const data = bytes.slice(dataStart, dataStart + size)
    if (type !== 'EXIF' && type !== 'XMP ' && type !== 'ICCP') {
      if (type === 'VP8X' && data.length >= 10) {
        // Clear ICC, EXIF and XMP flags so the container matches its chunks.
        data[0] = data[0]! & ~0x2c
      }
      chunks.push({ type, data })
    }
    offset = dataStart + size + (size % 2)
  }

  const payloadSize = chunks.reduce(
    (total, chunk) => total + 8 + chunk.data.length + (chunk.data.length % 2),
    4,
  )
  const out = new Uint8Array(8 + payloadSize)
  out.set([0x52, 0x49, 0x46, 0x46], 0)
  const view = new DataView(out.buffer)
  view.setUint32(4, payloadSize, true)
  out.set([0x57, 0x45, 0x42, 0x50], 8)
  let write = 12
  for (const chunk of chunks) {
    for (let index = 0; index < 4; index += 1)
      out[write + index] = chunk.type.charCodeAt(index)
    view.setUint32(write + 4, chunk.data.length, true)
    out.set(chunk.data, write + 8)
    write += 8 + chunk.data.length
    if (chunk.data.length % 2) {
      out[write] = 0
      write += 1
    }
  }
  return out
}

/** Removes EXIF/XMP/ICC/comments without decoding the pixels. */
export function stripMetadata(bytes: Uint8Array): {
  bytes: Uint8Array
  image: ParsedImage
} | null {
  const image = sniffImage(bytes)
  if (!image) return null
  const stripped =
    image.mime === 'image/jpeg'
      ? stripJpeg(bytes)
      : image.mime === 'image/png'
        ? stripPng(bytes)
        : stripWebp(bytes)
  const verified = sniffImage(stripped)
  if (!verified) return null
  return { bytes: stripped, image: verified }
}

export function mediaUrl(id: string): string {
  return `/api/files/${encodeURIComponent(id)}`
}

function toView(row: MediaRow): MediaView {
  return {
    id: row.id,
    url: mediaUrl(row.id),
    kind: row.kind,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
  }
}

function rowFrom(value: unknown): MediaRow | null {
  return value ? (value as MediaRow) : null
}

export async function saveUpload(
  db: D1Database,
  files: R2Bucket | undefined,
  ownerId: string,
  kind: MediaKind,
  bytes: Uint8Array,
): Promise<MediaResult<MediaView>> {
  if (!files)
    return {
      ok: false,
      status: 503,
      error: 'Image storage is not configured yet.',
    }
  if (bytes.byteLength === 0)
    return { ok: false, status: 400, error: 'Choose an image to upload.' }
  if (bytes.byteLength > MEDIA_LIMITS.uploadBytes)
    return {
      ok: false,
      status: 413,
      error: `Images are limited to ${Math.round(MEDIA_LIMITS.imageBytes / 1_000_000)} MB.`,
    }

  const parsed = stripMetadata(bytes)
  if (!parsed)
    return {
      ok: false,
      status: 415,
      error: 'Only JPEG, PNG, and WebP images are supported.',
    }
  if (
    parsed.image.width < 1 ||
    parsed.image.height < 1 ||
    Math.max(parsed.image.width, parsed.image.height) > 8_000
  )
    return { ok: false, status: 415, error: 'That image has unusable dimensions.' }

  const limit =
    kind === 'avatar' ? MEDIA_LIMITS.avatarBytes : MEDIA_LIMITS.imageBytes
  if (parsed.bytes.byteLength > limit)
    return {
      ok: false,
      status: 413,
      error:
        kind === 'avatar'
          ? 'Avatars are limited to 512 KB after processing.'
          : 'Images are limited to 2 MB after processing.',
    }

  const hourAgo = Date.now() - 3_600_000
  const dayAgo = Date.now() - 86_400_000
  const [hourCount, dayCount, total] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) AS count FROM media WHERE owner_id = ? AND created_at > ?')
      .bind(ownerId, hourAgo)
      .first<{ count: number }>(),
    db
      .prepare('SELECT COUNT(*) AS count FROM media WHERE owner_id = ? AND created_at > ?')
      .bind(ownerId, dayAgo)
      .first<{ count: number }>(),
    db
      .prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM media WHERE status = ?')
      .bind('active')
      .first<{ bytes: number }>(),
  ])
  if ((hourCount?.count ?? 0) >= MEDIA_LIMITS.uploadsPerHour)
    return {
      ok: false,
      status: 429,
      error: 'That is a lot of images. Try again in an hour.',
    }
  if ((dayCount?.count ?? 0) >= MEDIA_LIMITS.uploadsPerDay)
    return { ok: false, status: 429, error: 'Daily upload limit reached.' }
  if (
    (total?.bytes ?? 0) + parsed.bytes.byteLength >
    MEDIA_LIMITS.siteSoftBytes
  )
    return {
      ok: false,
      status: 507,
      error: 'The image library is full. Please try later.',
    }

  const digest = await crypto.subtle.digest('SHA-256', parsed.bytes)
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  const duplicate = rowFrom(
    await db
      .prepare(
        `SELECT id, owner_id AS ownerId, kind, object_key AS objectKey,
                mime, bytes, width, height, sha256, status,
                created_at AS createdAt
         FROM media
         WHERE owner_id = ? AND sha256 = ? AND kind = ? AND status = 'active'
         LIMIT 1`,
      )
      .bind(ownerId, sha256, kind)
      .first(),
  )
  if (duplicate) return { ok: true, value: toView(duplicate) }

  const id = crypto.randomUUID()
  const objectKey = `media/${id}`
  await files.put(objectKey, parsed.bytes, {
    httpMetadata: {
      contentType: parsed.image.mime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })

  const row: MediaRow = {
    id,
    ownerId,
    kind,
    objectKey,
    mime: parsed.image.mime,
    bytes: parsed.bytes.byteLength,
    width: parsed.image.width,
    height: parsed.image.height,
    sha256,
    status: 'active',
    createdAt: Date.now(),
  }
  await db
    .prepare(
      `INSERT INTO media (
         id, owner_id, kind, object_key, mime, bytes, width, height,
         sha256, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
    .bind(
      row.id,
      row.ownerId,
      row.kind,
      row.objectKey,
      row.mime,
      row.bytes,
      row.width,
      row.height,
      row.sha256,
      row.createdAt,
    )
    .run()

  return { ok: true, value: toView(row) }
}

export async function deleteMedia(
  db: D1Database,
  files: R2Bucket | undefined,
  mediaId: string,
): Promise<void> {
  const row = rowFrom(
    await db
      .prepare(
        `SELECT id, owner_id AS ownerId, kind, object_key AS objectKey,
                mime, bytes, width, height, sha256, status,
                created_at AS createdAt
         FROM media WHERE id = ?`,
      )
      .bind(mediaId)
      .first(),
  )
  if (!row) return
  await db.prepare('DELETE FROM media WHERE id = ?').bind(mediaId).run()
  if (files) await files.delete(row.objectKey).catch(() => undefined)
}

export async function setAvatar(
  db: D1Database,
  files: R2Bucket | undefined,
  userId: string,
  mediaId: string | null,
): Promise<MediaResult<null>> {
  const current = await db
    .prepare('SELECT avatar_media_id AS mediaId FROM users WHERE id = ?')
    .bind(userId)
    .first<{ mediaId: string | null }>()
  if (!current) return { ok: false, status: 404, error: 'That account does not exist.' }

  if (mediaId) {
    const media = await db
      .prepare(
        `SELECT id FROM media
         WHERE id = ? AND owner_id = ? AND kind = 'avatar' AND status = 'active'`,
      )
      .bind(mediaId, userId)
      .first()
    if (!media)
      return { ok: false, status: 400, error: 'Upload an avatar before selecting it.' }
  }

  await db
    .prepare('UPDATE users SET avatar_media_id = ? WHERE id = ?')
    .bind(mediaId, userId)
    .run()
  if (current.mediaId && current.mediaId !== mediaId)
    await deleteMedia(db, files, current.mediaId)
  return { ok: true, value: null }
}

export async function setBoardImage(
  db: D1Database,
  files: R2Bucket | undefined,
  boardId: string,
  mediaId: string | null,
): Promise<MediaResult<null>> {
  const board = await db
    .prepare(
      'SELECT image_media_id AS mediaId, staff_only AS staffOnly FROM subcategories WHERE id = ?',
    )
    .bind(boardId)
    .first<{ mediaId: string | null; staffOnly: number }>()
  if (!board) return { ok: false, status: 404, error: 'That board does not exist.' }

  if (mediaId) {
    const media = await db
      .prepare(
        `SELECT id FROM media
         WHERE id = ? AND kind = 'board_banner' AND status = 'active'`,
      )
      .bind(mediaId)
      .first()
    if (!media)
      return { ok: false, status: 400, error: 'Upload a banner before selecting it.' }
  }

  await db
    .prepare('UPDATE subcategories SET image_media_id = ? WHERE id = ?')
    .bind(mediaId, boardId)
    .run()
  if (mediaId) {
    // The banner inherits its board's read permission so a staff-only board's
    // artwork cannot be fetched by UUID from outside.
    await db
      .prepare(
        `UPDATE media SET staff_only = ?
         WHERE id = ? AND kind = 'board_banner'`,
      )
      .bind(board.staffOnly ? 1 : 0, mediaId)
      .run()
  }
  if (board.mediaId && board.mediaId !== mediaId)
    await deleteMedia(db, files, board.mediaId)
  return { ok: true, value: null }
}

export type FileRow = MediaRow & { staffOnly: number }

const MEDIA_REF = /\/api\/files\/([A-Za-z0-9_-]{1,64})/g

/** Media ids referenced as images inside a legacy or rich post body. */
export function mediaIdsIn(body: string): string[] {
  const ids = new Set<string>()
  for (const match of body.matchAll(MEDIA_REF)) {
    if (match[1]) ids.add(match[1])
  }
  return [...ids]
}

/**
 * Raises the restriction flag on an author's post images once they are
 * referenced from a staff-only board. The flag only rises here: an image
 * shared into a public thread as well stays hidden rather than leaking.
 */
export async function restrictReferencedMedia(
  db: D1Database,
  ownerId: string,
  body: string,
): Promise<void> {
  const ids = mediaIdsIn(body)
  if (!ids.length) return
  await db.batch(
    ids.map((id) =>
      db
        .prepare(
          `UPDATE media SET staff_only = 1
           WHERE id = ? AND owner_id = ? AND kind = 'post_image'`,
        )
        .bind(id, ownerId),
    ),
  )
}

/** Marks every post image referenced from a board's posts as staff-only. */
export async function restrictBoardPostMedia(
  db: D1Database,
  boardId: string,
): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT p.body AS body, p.body_html AS bodyHtml, p.author_id AS authorId
       FROM posts p
       JOIN threads t ON t.id = p.thread_id
       WHERE t.subcategory_id = ?`,
    )
    .bind(boardId)
    .all<{ body: string; bodyHtml: string | null; authorId: string }>()

  const statements = rows.results.flatMap((row) =>
    mediaIdsIn(`${row.body}\n${row.bodyHtml ?? ''}`).map((id) =>
      db
        .prepare(
          `UPDATE media SET staff_only = 1
           WHERE id = ? AND owner_id = ? AND kind = 'post_image'`,
        )
        .bind(id, row.authorId),
    ),
  )
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50))
  }
}

export async function mediaForFile(
  db: D1Database,
  mediaId: string,
): Promise<FileRow | null> {
  const row = await db
    .prepare(
      `SELECT m.id, m.owner_id AS ownerId, m.kind, m.object_key AS objectKey,
              m.mime, m.bytes, m.width, m.height, m.sha256, m.status,
              m.created_at AS createdAt,
              CASE WHEN m.staff_only = 1 OR s.staff_only = 1 THEN 1 ELSE 0 END AS staffOnly
       FROM media m
       LEFT JOIN subcategories s ON s.image_media_id = m.id
       WHERE m.id = ?`,
    )
    .bind(mediaId)
    .first()
  return row ? (row as FileRow) : null
}

export function mediaObject(
  files: R2Bucket | undefined,
  row: FileRow,
): Promise<R2ObjectBody | null> {
  if (!files) return Promise.resolve(null)
  return files.get(row.objectKey) as Promise<R2ObjectBody | null>
}
