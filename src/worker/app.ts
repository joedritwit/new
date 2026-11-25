import { isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffUser } from '@freebuff/auth'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  AVATAR_COLORS,
  IMAGE_MIME_TYPES,
  LIMITS,
  MEDIA_LIMITS,
  REPORT_LIMITS,
  REPORT_REASONS,
  ROLE_TAGS,
} from '../shared/forum'
import type { MediaKind, StaffRole, Viewer } from '../shared/types'
import { appOrigin, currentUser, isLocalPreview, type Env } from './auth'
import { listAudit, logAudit } from './audit'
import {
  createBoard,
  createCategory,
  listAdminBoards,
  moveBoard,
  moveCategory,
  updateBoard,
  updateCategory,
} from './boards-admin'
import { ensureDatabase, getBoard, getBoardIndex, getProfile, getThread } from './db'
import {
  createDonationMethod,
  deleteDonationMethod,
  getDonationPage,
  listDonationMethods,
  moveDonationMethod,
  saveDonationSettings,
  updateDonationMethod,
  getDonationSettings,
} from './donations'
import { listSupporters, setSupporter } from './supporters'
import {
  mediaForFile,
  mediaObject,
  saveUpload,
  setAvatar,
  setBoardImage,
} from './media'
import {
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from './notifications'
import {
  createNotificationTicket,
  notificationRoom,
} from './realtime'
import {
  applyReportAction,
  createReport,
  listReports,
  issueWarning,
  revokeWarning,
  addModNote,
  type ReportAction,
} from './moderation'
import { createReply, createThread, isThreadPrefix } from './mutations'
import { atLeast, canReadRestricted, isStaff } from './roles'
import { updateProfile, viewerDto, viewerFor, type ViewerProfile } from './users'

type AppContext = { Bindings: Env }
type Authenticate = (request: Request, env: Env) => Promise<FreebuffUser | null>
type Guard = { profile: ViewerProfile; user: FreebuffUser }

const SETUP_PENDING = {
  error: 'This board is still being set up. Please try again shortly.',
}

const DIRECTION = new Set(['up', 'down'])
const REPORT_ACTIONS = new Set<ReportAction>([
  'claim',
  'dismiss',
  'remove_post',
  'lock_thread',
  'warn_user',
])

function readObject(
  value: unknown,
  allowed: string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowed.includes(key))) return null
  return record
}

/** Tests inject identities; production always uses the Freebuff SDK. */
export function createApp(authenticate: Authenticate = currentUser) {
  const app = new Hono<AppContext>()

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.use('/api/*', async (c, next) => {
    // Media responses carry their own immutable caching headers.
    if (!c.req.path.startsWith('/api/files/'))
      c.header('Cache-Control', 'private, no-store')
    await next()
  })
  const jsonLimit = bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => c.json({ error: 'Request is too large.' }, 413),
  })
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/uploads') return next()
    return jsonLimit(c, next)
  })

  const demoAdmin = (c: Context<AppContext>) =>
    isLocalPreview(c.req.raw, c.env)

  async function readViewer(
    c: Context<AppContext>,
  ): Promise<ViewerProfile | null> {
    const user = await authenticate(c.req.raw, c.env)
    if (!user || !c.env.DB) return null
    await ensureDatabase(c.env.DB)
    return viewerFor(c.env.DB, user, { promoteToAdmin: demoAdmin(c) })
  }

  async function authorise(
    c: Context<AppContext>,
    minimum?: StaffRole,
  ): Promise<Guard | Response> {
    const user = await authenticate(c.req.raw, c.env)
    if (!user) return c.json({ error: 'Sign in to continue.' }, 401)
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    // Browsers do not send Origin on same-origin GETs, so only guard writes.
    // The demo preview has no auth boundary and its proxy rewrites the host, so
    // the origin header cannot be matched there; that environment is trusted.
    if (
      !isLocalPreview(c.req.raw, c.env) &&
      c.req.method !== 'GET' &&
      c.req.method !== 'HEAD'
    ) {
      const origin = appOrigin(c.req.raw, c.env)
      if (!origin || !isSameOriginRequest(c.req.raw, origin))
        return c.json({ error: 'Cross-origin request refused.' }, 403)
    }
    await ensureDatabase(c.env.DB)
    const profile = await viewerFor(c.env.DB, user, {
      promoteToAdmin: demoAdmin(c),
    })
    if (minimum && !atLeast(profile.row.staffRole, minimum))
      return c.json({ error: 'Staff only.' }, 403)
    return { profile, user }
  }

  app.get('/api/session', async (c) => {
    const auth = await authenticate(c.req.raw, c.env)
    let viewer: Viewer | null = null
    if (auth && c.env.DB) {
      await ensureDatabase(c.env.DB)
      const profile = await viewerFor(c.env.DB, auth, {
        promoteToAdmin: demoAdmin(c),
      })
      const dto = viewerDto(profile)
      dto.unreadNotifications = await unreadNotificationCount(
        c.env.DB,
        profile.row.id,
      )
      if (isStaff(profile.row.staffRole)) {
        const row = await c.env.DB.prepare(
          "SELECT COUNT(*) AS count FROM reports WHERE status = 'open'",
        ).first<{ count: number }>()
        dto.openReports = row?.count ?? 0
      }
      viewer = dto
    }
    return c.json({
      user: auth,
      viewer,
      mode: isLocalPreview(c.req.raw, c.env)
        ? 'local'
        : c.env.FREEBUFF_CLIENT_ID && c.env.APP_ORIGIN
          ? 'freebuff'
          : 'setup',
      database: Boolean(c.env.DB),
    })
  })

  const MEDIA_KINDS = new Set<MediaKind>([
    'avatar',
    'board_banner',
    'post_image',
  ])

  app.post(
    '/api/uploads',
    bodyLimit({
      maxSize: MEDIA_LIMITS.uploadBytes,
      onError: (c) => c.json({ error: 'That image is too large.' }, 413),
    }),
    async (c) => {
      const guard = await authorise(c)
      if (guard instanceof Response) return guard

      const kind = c.req.query('kind') as MediaKind
      if (!MEDIA_KINDS.has(kind))
        return c.json({ error: 'That upload type is not available.' }, 400)
      if (kind === 'board_banner' && !isStaff(guard.profile.row.staffRole))
        return c.json({ error: 'Staff only.' }, 403)

      const declared = c.req
        .header('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase()
      if (
        declared &&
        !(IMAGE_MIME_TYPES as readonly string[]).includes(declared)
      )
        return c.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, 415)

      const bytes = new Uint8Array(await c.req.arrayBuffer())
      const saved = await saveUpload(
        c.env.DB!,
        c.env.FILES,
        guard.profile.row.id,
        kind,
        bytes,
      )
      if (!saved.ok) return c.json({ error: saved.error }, saved.status as 400)
      return c.json({ media: saved.value }, 201)
    },
  )

  app.get('/api/files/:id', async (c) => {
    if (!c.env.DB || !c.env.FILES) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    const row = await mediaForFile(c.env.DB, c.req.param('id'))
    if (!row || row.status !== 'active')
      return c.json({ error: 'That image does not exist.' }, 404)

    const role = (await readViewer(c))?.row.staffRole ?? null
    if (row.staffOnly && !canReadRestricted(role))
      return c.json({ error: 'That image does not exist.' }, 404)

    const etag = `"${row.id}"`
    if (c.req.header('if-none-match') === etag)
      return new Response(null, { status: 304, headers: { ETag: etag } })

    const object = await mediaObject(c.env.FILES, row)
    if (!object) return c.json({ error: 'That image does not exist.' }, 404)
    // Images are capped at 2 MB; buffering keeps the response simple and
    // avoids holding an R2 stream open longer than the request.
    const body = await object.arrayBuffer()

    const extension =
      row.mime === 'image/png' ? 'png' : row.mime === 'image/webp' ? 'webp' : 'jpg'
    return new Response(body, {
      headers: {
        'Content-Type': row.mime,
        'Content-Length': String(row.bytes),
        'Content-Disposition': `inline; filename="publiclens-${row.id}.${extension}"`,
        'Cache-Control': row.staffOnly
          ? 'private, max-age=300'
          : 'public, max-age=31536000, immutable',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  // Public reading, filtered by the viewer's role where boards are restricted.
  app.get('/api/donations', async (c) => {
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    return c.json(await getDonationPage(c.env.DB))
  })

  app.get('/api/boards', async (c) => {
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    const profile = await readViewer(c)
    return c.json(
      await getBoardIndex(c.env.DB, profile?.row.staffRole ?? null),
    )
  })

  app.get('/api/boards/:id', async (c) => {
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    const profile = await readViewer(c)
    const board = await getBoard(
      c.env.DB,
      c.req.param('id'),
      profile?.row.staffRole ?? null,
    )
    return board
      ? c.json(board)
      : c.json({ error: 'That board does not exist.' }, 404)
  })

  app.get('/api/threads/:slug', async (c) => {
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    const profile = await readViewer(c)
    const thread = await getThread(
      c.env.DB,
      c.req.param('slug'),
      profile?.row.staffRole ?? null,
    )
    return thread
      ? c.json(thread)
      : c.json({ error: 'That thread does not exist.' }, 404)
  })

  app.get('/api/users/:handle', async (c) => {
    if (!c.env.DB) return c.json(SETUP_PENDING, 503)
    await ensureDatabase(c.env.DB)
    const profile = await readViewer(c)
    const view = await getProfile(
      c.env.DB,
      c.req.param('handle'),
      profile?.row.staffRole ?? null,
    )
    return view
      ? c.json(view)
      : c.json({ error: 'That member does not exist.' }, 404)
  })

  app.post('/api/threads', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'boardId',
      'title',
      'body',
      'prefix',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    if (
      typeof body.boardId !== 'string' ||
      typeof body.title !== 'string' ||
      typeof body.body !== 'string'
    )
      return c.json({ error: 'A board, title, and body are required.' }, 400)
    if (
      body.prefix !== null &&
      body.prefix !== undefined &&
      (typeof body.prefix !== 'string' || !isThreadPrefix(body.prefix))
    )
      return c.json({ error: 'That prefix is not available.' }, 400)

    const result = await createThread(c.env.DB!, guard.profile, {
      boardId: body.boardId,
      title: body.title,
      body: body.body,
      prefix: typeof body.prefix === 'string' ? body.prefix : null,
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ slug: result.value.slug }, 201)
  })

  app.post('/api/threads/:slug/posts', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['body'])
    if (!body || typeof body.body !== 'string')
      return c.json({ error: 'Write something before posting.' }, 400)

    const result = await createReply(
      c.env.DB!,
      guard.profile,
      c.req.param('slug'),
      body.body,
      c.env,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true }, 201)
  })

  app.patch('/api/me', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'displayName',
      'bio',
      'roleTag',
      'avatarColor',
      'avatarMediaId',
      'showSupporterBadge',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)

    const patch: {
      displayName: string
      bio: string | null
      roleTag: string | null
      avatarColor: string
      showSupporterBadge?: boolean
    } = {
      displayName: guard.profile.row.displayName,
      bio: guard.profile.row.bio,
      roleTag: guard.profile.row.roleTag,
      avatarColor: guard.profile.row.avatarColor,
    }

    if ('displayName' in body) {
      if (typeof body.displayName !== 'string')
        return c.json({ error: 'That display name is not valid.' }, 400)
      const name = body.displayName.replace(/\s+/g, ' ').trim()
      if (name.length < LIMITS.displayNameMin || name.length > LIMITS.displayNameMax)
        return c.json(
          {
            error: `Display names are ${LIMITS.displayNameMin}–${LIMITS.displayNameMax} characters.`,
          },
          400,
        )
      patch.displayName = name
    }

    if ('bio' in body) {
      if (body.bio !== null && typeof body.bio !== 'string')
        return c.json({ error: 'That bio is not valid.' }, 400)
      const bio = typeof body.bio === 'string' ? body.bio.trim() : null
      if (bio && bio.length > LIMITS.bioMax)
        return c.json({ error: `Bios are limited to ${LIMITS.bioMax} characters.` }, 400)
      patch.bio = bio || null
    }

    if ('roleTag' in body) {
      if (body.roleTag !== null && typeof body.roleTag !== 'string')
        return c.json({ error: 'That role tag is not valid.' }, 400)
      if (
        typeof body.roleTag === 'string' &&
        !(ROLE_TAGS as readonly string[]).includes(body.roleTag)
      )
        return c.json({ error: 'That role tag is not available.' }, 400)
      patch.roleTag = body.roleTag as string | null
    }

    if ('avatarColor' in body) {
      if (
        typeof body.avatarColor !== 'string' ||
        !(AVATAR_COLORS as readonly string[]).includes(body.avatarColor)
      )
        return c.json({ error: 'Pick one of the available avatar colours.' }, 400)
      patch.avatarColor = body.avatarColor
    }

    if ('avatarMediaId' in body) {
      if (
        body.avatarMediaId !== null &&
        (typeof body.avatarMediaId !== 'string' ||
          body.avatarMediaId.length > 64)
      )
        return c.json({ error: 'That avatar is not valid.' }, 400)
      const avatar = await setAvatar(
        c.env.DB!,
        c.env.FILES,
        guard.profile.row.id,
        body.avatarMediaId as string | null,
      )
      if (!avatar.ok) return c.json({ error: avatar.error }, avatar.status as 400)
    }

    if ('showSupporterBadge' in body) {
      if (typeof body.showSupporterBadge !== 'boolean')
        return c.json({ error: 'That badge preference is not valid.' }, 400)
      if (guard.profile.row.staffRole !== 'supporter')
        return c.json(
          { error: 'Only Supporters can change the Supporter badge.' },
          400,
        )
      patch.showSupporterBadge = body.showSupporterBadge
    }

    await updateProfile(c.env.DB!, guard.user.sub, patch)
    const refreshed = await viewerFor(c.env.DB!, guard.user)
    return c.json({ viewer: viewerDto(refreshed) })
  })

  app.post('/api/reports', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'postId',
      'reason',
      'details',
    ])
    if (!body || typeof body.postId !== 'string' || typeof body.reason !== 'string')
      return c.json({ error: 'A post and a reason are required.' }, 400)
    if (!REPORT_REASONS.some((reason) => reason.value === body.reason))
      return c.json({ error: 'That reason is not available.' }, 400)
    if (body.details !== undefined && body.details !== null && typeof body.details !== 'string')
      return c.json({ error: 'That detail is not valid.' }, 400)

    const details =
      typeof body.details === 'string' ? body.details.trim() : null
    if (details && details.length > REPORT_LIMITS.detailsMax)
      return c.json(
        { error: `Reports are limited to ${REPORT_LIMITS.detailsMax} characters.` },
        400,
      )

    const result = await createReport(c.env.DB!, guard.profile, {
      postId: body.postId,
      reason: body.reason,
      details: details || null,
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true }, 201)
  })

  app.get('/api/notifications', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard
    return c.json(await listNotifications(c.env.DB!, guard.profile.row.id))
  })

  app.post('/api/notifications/read', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['ids'])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    if (
      body.ids !== undefined &&
      (!Array.isArray(body.ids) ||
        body.ids.some((id) => typeof id !== 'string' || id.length > 64))
    )
      return c.json({ error: 'Invalid notification selection.' }, 400)

    const unread = await markNotificationsRead(
      c.env.DB!,
      guard.profile.row.id,
      body.ids as string[] | undefined,
    )
    return c.json({ unread })
  })

  app.post('/api/realtime/ticket', async (c) => {
    const guard = await authorise(c)
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['room'])
    if (!body || typeof body.room !== 'string')
      return c.json({ error: 'A room is required.' }, 400)

    const room = notificationRoom(guard.profile.row.id)
    if (body.room !== room)
      return c.json({ error: 'That room is not available.' }, 403)
    if (!c.env.REALTIME) return c.json({ enabled: false })

    const origin = appOrigin(c.req.raw, c.env)
    if (!origin) return c.json({ enabled: false })
    const ticket = await createNotificationTicket(c.env, {
      room,
      userId: guard.user.sub,
      origin,
    })
    if (!ticket) return c.json({ enabled: false })
    return c.json({ enabled: true, websocketUrl: ticket.websocketUrl })
  })

  app.get('/api/mod/reports', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard
    return c.json(await listReports(c.env.DB!))
  })

  app.post('/api/mod/reports/:id/action', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'action',
      'note',
      'points',
    ])
    if (!body || typeof body.action !== 'string' || !REPORT_ACTIONS.has(body.action as ReportAction))
      return c.json({ error: 'That action is not available.' }, 400)
    if (body.note !== undefined && typeof body.note !== 'string')
      return c.json({ error: 'That note is not valid.' }, 400)
    if (body.points !== undefined && typeof body.points !== 'number')
      return c.json({ error: 'Points must be a number.' }, 400)

    const result = await applyReportAction(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.action as ReportAction,
      typeof body.note === 'string' ? body.note.trim() : '',
      typeof body.points === 'number' ? body.points : 1,
      c.env,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.post('/api/mod/users/:id/warnings', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'points',
      'reason',
    ])
    if (!body || typeof body.points !== 'number' || typeof body.reason !== 'string')
      return c.json({ error: 'Points and a reason are required.' }, 400)

    const result = await issueWarning(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.points,
      body.reason,
      c.env,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json(result.value)
  })

  app.post('/api/mod/warnings/:id/revoke', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['reason'])
    if (!body || typeof body.reason !== 'string')
      return c.json({ error: 'A reason is required.' }, 400)

    const result = await revokeWarning(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.reason,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json(result.value)
  })

  app.post('/api/mod/users/:id/notes', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['body'])
    if (!body || typeof body.body !== 'string')
      return c.json({ error: 'Write a note first.' }, 400)

    const result = await addModNote(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.body,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.get('/api/mod/boards', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard
    const rows = await c.env.DB!.prepare(
      `SELECT id, name, staff_only AS staffOnly,
              image_media_id AS imageMediaId
       FROM subcategories
       ORDER BY sort_order, name`,
    ).all<{
      id: string
      name: string
      staffOnly: boolean
      imageMediaId: string | null
    }>()
    return c.json({
      boards: rows.results.map((row) => ({
        ...row,
        staffOnly: Boolean(row.staffOnly),
      })),
    })
  })

  app.patch('/api/mod/boards/:id/image', async (c) => {
    const guard = await authorise(c, 'moderator')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['mediaId'])
    if (
      !body ||
      (body.mediaId !== null && typeof body.mediaId !== 'string')
    )
      return c.json({ error: 'Choose a banner or remove it.' }, 400)

    const result = await setBoardImage(
      c.env.DB!,
      c.env.FILES,
      c.req.param('id'),
      body.mediaId as string | null,
    )
    if (!result.ok) return c.json({ error: result.error }, result.status as 400)

    await logAudit(c.env.DB!, {
      actorId: guard.profile.row.id,
      action: body.mediaId ? 'board.image' : 'board.image.remove',
      targetType: 'board',
      targetId: c.req.param('id'),
      metadata: { mediaId: body.mediaId },
    })
    return c.json({ ok: true })
  })

  app.get('/api/admin/boards', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    return c.json(await listAdminBoards(c.env.DB!))
  })

  app.get('/api/admin/audit', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    return c.json({ entries: await listAudit(c.env.DB!) })
  })

  app.post('/api/admin/categories', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'name',
      'description',
    ])
    if (!body || typeof body.name !== 'string' || typeof body.description !== 'string')
      return c.json({ error: 'A name and description are required.' }, 400)

    const result = await createCategory(c.env.DB!, guard.profile, {
      name: body.name,
      description: body.description,
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json(result.value, 201)
  })

  app.patch('/api/admin/categories/:id', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'name',
      'description',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    if (typeof body.name !== 'string' && typeof body.description !== 'string')
      return c.json({ error: 'Nothing to change.' }, 400)

    const result = await updateCategory(c.env.DB!, guard.profile, c.req.param('id'), {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string'
        ? { description: body.description }
        : {}),
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.post('/api/admin/categories/:id/move', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['direction'])
    if (!body || typeof body.direction !== 'string' || !DIRECTION.has(body.direction))
      return c.json({ error: 'Direction must be up or down.' }, 400)

    const result = await moveCategory(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.direction as 'up' | 'down',
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.post('/api/admin/boards', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'categoryId',
      'name',
      'description',
    ])
    if (
      !body ||
      typeof body.categoryId !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.description !== 'string'
    )
      return c.json({ error: 'A category, name, and description are required.' }, 400)

    const result = await createBoard(c.env.DB!, guard.profile, {
      categoryId: body.categoryId,
      name: body.name,
      description: body.description,
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json(result.value, 201)
  })

  app.patch('/api/admin/boards/:id', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), [
      'name',
      'description',
      'staffOnly',
      'postMinRole',
      'archived',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    if (typeof body.name !== 'string' &&
      typeof body.description !== 'string' &&
      typeof body.staffOnly !== 'boolean' &&
      typeof body.postMinRole !== 'string' &&
      typeof body.archived !== 'boolean')
      return c.json({ error: 'Nothing to change.' }, 400)
    if (body.staffOnly !== undefined && typeof body.staffOnly !== 'boolean')
      return c.json({ error: 'That read permission is not valid.' }, 400)
    if (body.archived !== undefined && typeof body.archived !== 'boolean')
      return c.json({ error: 'That archive flag is not valid.' }, 400)

    const result = await updateBoard(c.env.DB!, guard.profile, c.req.param('id'), {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string'
        ? { description: body.description }
        : {}),
      ...(typeof body.staffOnly === 'boolean' ? { staffOnly: body.staffOnly } : {}),
      ...(typeof body.postMinRole === 'string'
        ? { postMinRole: body.postMinRole }
        : {}),
      ...(typeof body.archived === 'boolean' ? { archived: body.archived } : {}),
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.post('/api/admin/boards/:id/move', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard

    const body = readObject(await c.req.json().catch(() => null), ['direction'])
    if (!body || typeof body.direction !== 'string' || !DIRECTION.has(body.direction))
      return c.json({ error: 'Direction must be up or down.' }, 400)

    const result = await moveBoard(
      c.env.DB!,
      guard.profile,
      c.req.param('id'),
      body.direction as 'up' | 'down',
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.get('/api/admin/donations', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const [settings, methods] = await Promise.all([
      getDonationSettings(c.env.DB!),
      listDonationMethods(c.env.DB!),
    ])
    return c.json({ settings, methods })
  })

  app.patch('/api/admin/donations/settings', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const body = readObject(await c.req.json().catch(() => null), [
      'intro',
      'memoNote',
    ])
    if (!body)
      return c.json({ error: 'Invalid request.' }, 400)
    const result = await saveDonationSettings(c.env.DB!, guard.profile.row.id, {
      intro: body.intro,
      memoNote: body.memoNote,
    })
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ settings: result.value })
  })

  app.post('/api/admin/donations/methods', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const body = readObject(await c.req.json().catch(() => null), [
      'kind',
      'label',
      'destination',
      'url',
      'note',
      'enabled',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    const result = await createDonationMethod(
      c.env.DB!,
      guard.profile.row.id,
      {
        kind: body.kind,
        label: body.label,
        destination: body.destination,
        url: body.url,
        note: body.note,
        enabled: body.enabled,
      },
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ method: result.value }, 201)
  })

  app.patch('/api/admin/donations/methods/:id', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const body = readObject(await c.req.json().catch(() => null), [
      'kind',
      'label',
      'destination',
      'url',
      'note',
      'enabled',
    ])
    if (!body) return c.json({ error: 'Invalid request.' }, 400)
    const result = await updateDonationMethod(
      c.env.DB!,
      guard.profile.row.id,
      c.req.param('id'),
      {
        kind: body.kind,
        label: body.label,
        destination: body.destination,
        url: body.url,
        note: body.note,
        enabled: body.enabled,
      },
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ method: result.value })
  })

  app.delete('/api/admin/donations/methods/:id', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const result = await deleteDonationMethod(
      c.env.DB!,
      guard.profile.row.id,
      c.req.param('id'),
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ ok: true })
  })

  app.post('/api/admin/donations/methods/:id/move', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const body = readObject(await c.req.json().catch(() => null), ['direction'])
    if (!body || typeof body.direction !== 'string' || !DIRECTION.has(body.direction))
      return c.json({ error: 'Direction must be up or down.' }, 400)
    const result = await moveDonationMethod(
      c.env.DB!,
      guard.profile.row.id,
      c.req.param('id'),
      body.direction as 'up' | 'down',
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ methods: result.value })
  })

  app.get('/api/admin/supporters', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    return c.json({ supporters: await listSupporters(c.env.DB!) })
  })

  app.post('/api/admin/supporters', async (c) => {
    const guard = await authorise(c, 'admin')
    if (guard instanceof Response) return guard
    const body = readObject(await c.req.json().catch(() => null), [
      'handle',
      'action',
      'note',
    ])
    if (!body || typeof body.handle !== 'string')
      return c.json({ error: 'Enter the member handle.' }, 400)
    if (body.action !== 'grant' && body.action !== 'revoke')
      return c.json({ error: 'Choose grant or revoke.' }, 400)
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string')
      return c.json({ error: 'That note is not valid.' }, 400)
    const result = await setSupporter(
      c.env.DB!,
      c.env,
      guard.profile.row.id,
      {
        handle: body.handle,
        action: body.action,
        note: typeof body.note === 'string' ? body.note : null,
      },
    )
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json({ supporter: result.value })
  })

  app.notFound((c) =>
    c.req.path === '/api' || c.req.path.startsWith('/api/')
      ? c.json({ error: 'Endpoint not found.' }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: 'Something went wrong. Please try again.' }, 500)
  })

  return app
}
