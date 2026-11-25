import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Miniflare } from 'miniflare'
import type {
  AdminBoards,
  AdminDonations,
  AdminSupporter,
  AuditPage,
  BoardDetail,
  BoardIndex,
  DonationPage,
  ModQueue,
  ProfileView,
  Session,
  ThreadDetail,
} from '../src/shared/types'
import { FOIA_TEMPLATES } from '../src/shared/foia'
import { createApp } from '../src/worker/app'
import { currentUser, type Env } from '../src/worker/auth'
import { renderMarkdown, extractEmbeds } from '../src/worker/markdown'
import { sniffImage, stripMetadata } from '../src/worker/media'

const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: 'test-db',
        compatibilityDate: '2026-11-11',
        manifest: {
          mainModule: 'index.js',
          modules: {
            'index.js': {
              type: 'esm',
              contents:
                'export default { fetch() { return new Response("test") } }',
            },
          },
        },
        env: {
          DB: { type: 'd1', name: 'publiclens-test' },
          FILES: { type: 'r2', name: 'publiclens-test-media' },
        },
      },
    },
  ],
  port: 0,
})
let env: Env
beforeAll(async () => {
  const db = await runtime.getD1Database('DB')
  const files = await runtime.getR2Bucket('FILES')
  env = {
    DB: db as unknown as D1Database,
    FILES: files as unknown as R2Bucket,
    APP_ORIGIN: 'https://app.example.test',
    ASSETS: {
      fetch: async () => new Response('public page'),
    } as unknown as Fetcher,
  }
}, 20_000)
afterAll(() => runtime.dispose())

// This identity seam exists only in the app factory. The Worker entrypoint
// never reads these test headers and always calls the real auth SDK.
const app = createApp(async (request) => {
  const sub = request.headers.get('test-user')
  return sub ? { sub } : null
})

const read = (path: string, user?: string) =>
  app.request(
    `https://app.example.test${path}`,
    { headers: user ? { 'test-user': user } : {} },
    env,
  )

const write = (
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  user: string,
  body: unknown,
  origin: string | null = env.APP_ORIGIN!,
) =>
  app.request(
    `https://app.example.test${path}`,
    {
      method,
      headers: {
        'test-user': user,
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(body),
    },
    env,
  )

test('markdown is sanitised and media links become embed descriptors', () => {
  const { html, embeds } = renderMarkdown(
    [
      '**bold** <script>alert(1)</script>',
      '',
      '[bad](javascript:alert(1))',
      '',
      '<img src=x onerror=alert(1)>',
      '',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ].join('\n'),
  )

  expect(html).toContain('<strong>bold</strong>')
  expect(html).not.toContain('<script')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('onerror')
  expect(html).toContain('rel="nofollow ugc noopener"')
  expect(embeds).toEqual([
    {
      provider: 'youtube',
      id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
  ])
})

test('board index is seeded with the full tree and live activity', async () => {
  const response = await read('/api/boards')
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  const body = (await response.json()) as BoardIndex

  expect(body.categories.map((category) => category.name)).toEqual([
    'Community HQ',
    'Audits & Field Reports',
    'Law, Rights & FOIA',
    'Gear & Production',
    'Off-Topic Lounge',
  ])

  const subcategories = body.categories.flatMap(
    (category) => category.subcategories,
  )
  expect(subcategories).toHaveLength(14)

  const fieldReports = subcategories.find(
    (subcategory) => subcategory.id === 'field-reports',
  )
  expect(fieldReports).toMatchObject({
    threadCount: 1,
    postCount: 4,
    latest: { threadSlug: 'post-office-lobby-asked-to-stop' },
  })

  expect(body.stats.threads).toBeGreaterThanOrEqual(13)
  expect(body.stats.posts).toBeGreaterThanOrEqual(40)
  expect(body.stats.members).toBeGreaterThanOrEqual(6)
})

test('thread view renders sanitised HTML and author handles', async () => {
  const response = await read('/api/threads/foia-template-that-gets-a-response')
  expect(response.status).toBe(200)
  const body = (await response.json()) as ThreadDetail

  expect(body.thread).toMatchObject({
    prefix: 'FOIA WIN',
    isPinned: true,
    replyCount: 2,
  })
  expect(body.category.name).toBe('Law, Rights & FOIA')
  expect(body.posts).toHaveLength(3)
  expect(body.posts[0]!.author).toMatchObject({
    name: 'Lex Patria',
    handle: 'lex-patria',
    staffRole: 'moderator',
  })
  expect(body.posts[0]!.html).toContain('Most requests fail on scope')
  expect(body.posts[0]!.html).toContain('<p>')
  expect(body.posts[0]!.embeds).toEqual([])

  expect((await read('/api/threads/not-a-real-thread')).status).toBe(404)
})

test('session provisions a local account at trust level zero', async () => {
  const session = (await (
    await read('/api/session', 'alice')
  ).json()) as Session

  expect(session.database).toBe(true)
  expect(session.viewer).toMatchObject({ trustLevel: 0, name: 'Member' })
  expect(session.viewer?.handle).toBeTruthy()

  const profile = (await (
    await read(`/api/users/${session.viewer!.handle}`)
  ).json()) as ProfileView
  expect(profile.user).toMatchObject({
    handle: session.viewer!.handle,
    trustLevel: 0,
  })
  expect((await read('/api/users/nobody-here')).status).toBe(404)
})

test('posting requires a session and a same-origin request', async () => {
  const thread = {
    boardId: 'general',
    title: 'Origin check thread',
    body: 'Body',
  }

  const anonymous = await app.request(
    'https://app.example.test/api/threads',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thread),
    },
    env,
  )
  expect(anonymous.status).toBe(401)

  expect(
    (await write('POST', '/api/threads', 'writer', thread, 'https://evil.example'))
      .status,
  ).toBe(403)
  expect(
    (await write('POST', '/api/threads', 'writer', thread, null)).status,
  ).toBe(403)
})

test('a member can start a thread and reply, and it reaches the board', async () => {
  const created = await write('POST', '/api/threads', 'writer', {
    boardId: 'general',
    title: 'What the statute actually says about lobby filming',
    body: 'The short version: **cite the section** and ask for the directive.',
    prefix: 'DISCUSSION',
  })
  expect(created.status).toBe(201)
  const { slug } = (await created.json()) as { slug: string }

  const board = (await (await read('/api/boards/general')).json()) as BoardDetail
  expect(board.threads[0]?.slug).toBe(slug)
  expect(board.threads[0]?.replyCount).toBe(0)

  const replied = await write(
    'POST',
    `/api/threads/${slug}/posts`,
    'writer',
    { body: 'Adding the citation format: `Code § 1234`.' },
  )
  expect(replied.status).toBe(201)

  const thread = (await (
    await read(`/api/threads/${slug}`)
  ).json()) as ThreadDetail
  expect(thread.posts).toHaveLength(2)
  expect(thread.thread.replyCount).toBe(1)
  expect(thread.posts[0]!.html).toContain('<strong>cite the section</strong>')
  expect(thread.posts[1]!.html).toContain('<code>Code § 1234</code>')
  expect(thread.subcategory.id).toBe('general')

  const lockedSlug = slug
  await env.DB!.prepare('UPDATE threads SET is_locked = 1 WHERE slug = ?')
    .bind(lockedSlug)
    .run()
  expect(
    (
      await write('POST', `/api/threads/${lockedSlug}/posts`, 'writer', {
        body: 'Should not land.',
      })
    ).status,
  ).toBe(403)
})

test('new accounts cannot post links until they earn trust', async () => {
  const blocked = await write('POST', '/api/threads', 'trusty', {
    boardId: 'general',
    title: 'A new account posting a link',
    body: 'Source: https://example.com/policy',
  })
  expect(blocked.status).toBe(403)
  expect(((await blocked.json()) as { error: string }).error).toMatch(
    /Links unlock/,
  )

  const created = await write('POST', '/api/threads', 'trusty', {
    boardId: 'general',
    title: 'Three posts, then a source',
    body: 'First post, no links.',
  })
  const { slug } = (await created.json()) as { slug: string }
  expect(
    (await write('POST', `/api/threads/${slug}/posts`, 'trusty', { body: 'Two.' }))
      .status,
  ).toBe(201)
  expect(
    (await write('POST', `/api/threads/${slug}/posts`, 'trusty', { body: 'Three.' }))
      .status,
  ).toBe(201)

  // Earn trust: three published posts and an account older than a day.
  await env.DB!.prepare('UPDATE users SET joined_at = ? WHERE id = ?')
    .bind(Date.now() - 2 * 86_400_000, 'trusty')
    .run()

  const allowed = await write(
    'POST',
    `/api/threads/${slug}/posts`,
    'trusty',
    { body: 'Source: https://example.com/policy' },
  )
  expect(allowed.status).toBe(201)

  const thread = (await (
    await read(`/api/threads/${slug}`)
  ).json()) as ThreadDetail
  expect(thread.posts.at(-1)?.html).toContain('https://example.com/policy')
})

test('profile edits are validated against server-side allowlists', async () => {
  const session = (await (
    await read('/api/session', 'editor')
  ).json()) as Session
  const handle = session.viewer!.handle

  expect(
    (await write('PATCH', '/api/me', 'editor', { roleTag: 'Wizard' })).status,
  ).toBe(400)
  expect(
    (await write('PATCH', '/api/me', 'editor', { avatarColor: '#000000' }))
      .status,
  ).toBe(400)
  expect(
    (await write('PATCH', '/api/me', 'editor', { displayName: 'x' })).status,
  ).toBe(400)

  const saved = await write('PATCH', '/api/me', 'editor', {
    displayName: 'Field Notes',
    bio: 'I film public meetings and read the minutes.',
    roleTag: 'Auditor',
    avatarColor: '#6BA292',
  })
  expect(saved.status).toBe(200)
  expect(((await saved.json()) as { viewer: Session['viewer'] }).viewer).toMatchObject(
    { name: 'Field Notes', avatarColor: '#6BA292' },
  )

  const profile = (await (
    await read(`/api/users/${handle}`)
  ).json()) as ProfileView
  expect(profile.user).toMatchObject({
    name: 'Field Notes',
    bio: 'I film public meetings and read the minutes.',
    roleTag: 'Auditor',
    avatarColor: '#6BA292',
  })
})

test('new accounts are rate limited to three posts an hour', async () => {
  const created = await write('POST', '/api/threads', 'spammer', {
    boardId: 'general',
    title: 'Rate limit check thread',
    body: 'One.',
  })
  const { slug } = (await created.json()) as { slug: string }

  expect(
    (await write('POST', `/api/threads/${slug}/posts`, 'spammer', { body: 'Two.' }))
      .status,
  ).toBe(201)
  expect(
    (await write('POST', `/api/threads/${slug}/posts`, 'spammer', { body: 'Three.' }))
      .status,
  ).toBe(201)

  const limited = await write('POST', `/api/threads/${slug}/posts`, 'spammer', {
    body: 'Four.',
  })
  expect(limited.status).toBe(429)
  expect(((await limited.json()) as { error: string }).error).toMatch(/hour/)
})

test('missing database reports setup instead of an empty board', async () => {
  const noDb = await app.request(
    'https://app.example.test/api/boards',
    {},
    { ...env, DB: undefined },
  )
  expect(noDb.status).toBe(503)
  expect(((await noDb.json()) as { error: string }).error).toMatch(
    /still being set up/,
  )

  expect((await read('/api/health')).status).toBe(200)
  expect(await (await read('/')).text()).toBe('public page')
  expect((await read('/api/nope')).status).toBe(404)

  expect(
    await currentUser(new Request('https://app.example.test/'), {} as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {
      APP_ORIGIN: 'https://app.example.test',
    } as Env),
  ).toBeNull()
  expect(
    await currentUser(new Request('http://localhost:5000/'), {} as Env),
  ).toMatchObject({ sub: 'local-preview' })
})

const promote = (userId: string, role: string) =>
  env.DB!.prepare('UPDATE users SET staff_role = ? WHERE id = ?')
    .bind(role, userId)
    .run()

const threadWithSlug = async (user: string, title: string, body: string) => {
  const response = await write('POST', '/api/threads', user, {
    boardId: 'general',
    title,
    body,
  })
  return {
    status: response.status,
    body: (await response.json()) as { slug: string },
  }
}

test('reports are accepted once per member and never on your own post', async () => {
  const created = await threadWithSlug(
    'author-t1',
    'Thread waiting on the report queue',
    'A body somebody can report.',
  )
  expect(created.status).toBe(201)
  const thread = (await (
    await read(`/api/threads/${created.body.slug}`)
  ).json()) as ThreadDetail
  const postId = thread.posts[0]!.id

  const anonymous = await app.request(
    'https://app.example.test/api/reports',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN! },
      body: JSON.stringify({ postId, reason: 'spam' }),
    },
    env,
  )
  expect(anonymous.status).toBe(401)

  expect(
    (
      await write('POST', '/api/reports', 'author-t1', {
        postId,
        reason: 'spam',
      })
    ).status,
  ).toBe(400)

  expect(
    (
      await write('POST', '/api/reports', 'reporter-t1', {
        postId,
        reason: 'doxxing',
        details: 'The post includes a home address.',
      })
    ).status,
  ).toBe(201)

  expect(
    (
      await write('POST', '/api/reports', 'reporter-t1', {
        postId,
        reason: 'spam',
      })
    ).status,
  ).toBe(409)

  expect(
    (
      await write('POST', '/api/reports', 'reporter-t1', {
        postId,
        reason: 'not-a-reason',
      })
    ).status,
  ).toBe(400)
})

test('the report queue and audit log are role gated', async () => {
  await read('/api/session', 'mod-one')
  expect((await read('/api/mod/reports', 'mod-one')).status).toBe(403)
  expect((await read('/api/admin/audit', 'mod-one')).status).toBe(403)

  await promote('mod-one', 'moderator')

  const queue = (await (
    await read('/api/mod/reports', 'mod-one')
  ).json()) as ModQueue
  expect(queue.counts.open).toBeGreaterThanOrEqual(1)
  expect(
    queue.reports.some((report) => report.post.excerpt.includes('reportable') ||
      report.post.excerpt.includes('body somebody can report')),
  ).toBe(true)

  expect((await read('/api/mod/reports', 'plain-member')).status).toBe(403)
})

test('dismissing a report records who did it and why', async () => {
  await read('/api/session', 'mod-one')
  await promote('mod-one', 'moderator')

  const created = await threadWithSlug(
    'author-t2',
    'Thread that gets dismissed',
    'Nothing wrong with this post.',
  )
  const thread = (await (
    await read(`/api/threads/${created.body.slug}`)
  ).json()) as ThreadDetail
  const postId = thread.posts[0]!.id

  expect(
    (
      await write('POST', '/api/reports', 'reporter-t2', {
        postId,
        reason: 'off_topic',
      })
    ).status,
  ).toBe(201)

  const queue = (await (
    await read('/api/mod/reports', 'mod-one')
  ).json()) as ModQueue
  const report = queue.reports.find((entry) => entry.post.id === postId)!
  expect(report).toBeTruthy()

  expect(
    (
      await write('POST', `/api/mod/reports/${report.id}/action`, 'mod-one', {
        action: 'dismiss',
        note: 'No rule broken.',
      })
    ).status,
  ).toBe(200)

  await read('/api/session', 'admin-one')
  await promote('admin-one', 'admin')

  const audit = (await (
    await read('/api/admin/audit', 'admin-one')
  ).json()) as AuditPage
  expect(
    audit.entries.some(
      (entry) =>
        entry.action === 'report.dismiss' && entry.reason === 'No rule broken.',
    ),
  ).toBe(true)

  const after = (await (
    await read('/api/mod/reports', 'mod-one')
  ).json()) as ModQueue
  expect(after.reports.find((entry) => entry.id === report.id)?.status).toBe(
    'dismissed',
  )
})

test('three warning points mute an account until the warning is revoked', async () => {
  await read('/api/session', 'mod-one')
  await promote('mod-one', 'moderator')

  const created = await threadWithSlug(
    'author-w1',
    'Thread where a warning is issued',
    'Opening post.',
  )
  expect(
    (
      await write('POST', `/api/threads/${created.body.slug}/posts`, 'warned-w1', {
        body: 'A reply that earns a warning.',
      })
    ).status,
  ).toBe(201)

  const thread = (await (
    await read(`/api/threads/${created.body.slug}`)
  ).json()) as ThreadDetail
  const replyPost = thread.posts[1]!

  expect(
    (
      await write('POST', '/api/reports', 'reporter-w1', {
        postId: replyPost.id,
        reason: 'harassment',
      })
    ).status,
  ).toBe(201)

  const warned = await write(
    'POST',
    `/api/mod/users/${replyPost.author.id}/warnings`,
    'mod-one',
    { points: 3, reason: 'Posted a private address.' },
  )
  expect(warned.status).toBe(200)
  const warning = (await warned.json()) as {
    activePoints: number
    mutedUntil: number | null
  }
  expect(warning.activePoints).toBeGreaterThanOrEqual(3)
  expect(warning.mutedUntil).toBeGreaterThan(Date.now())

  const muted = await write(
    'POST',
    `/api/threads/${created.body.slug}/posts`,
    'warned-w1',
    { body: 'Let me post anyway.' },
  )
  expect(muted.status).toBe(403)
  expect(((await muted.json()) as { error: string }).error).toMatch(/muted/i)

  const profile = (await (
    await read(`/api/users/${replyPost.author.handle}`, 'mod-one')
  ).json()) as ProfileView
  expect(profile.staff?.activePoints).toBeGreaterThanOrEqual(3)
  expect(profile.staff?.warnings.length).toBeGreaterThanOrEqual(1)
  expect(profile.staff?.mutedUntil).toBeGreaterThan(Date.now())

  const warningId = profile.staff!.warnings[0]!.id
  expect(
    (
      await write('POST', `/api/mod/warnings/${warningId}/revoke`, 'mod-one', {
        reason: 'Wrong account.',
      })
    ).status,
  ).toBe(200)

  expect(
    (
      await write('POST', `/api/threads/${created.body.slug}/posts`, 'warned-w1', {
        body: 'Back to normal.',
      })
    ).status,
  ).toBe(201)

  const publicProfile = (await (
    await read(`/api/users/${replyPost.author.handle}`)
  ).json()) as ProfileView
  expect(publicProfile.staff).toBeNull()
})

test('removing a reported post hides it from the thread', async () => {
  await read('/api/session', 'mod-one')
  await promote('mod-one', 'moderator')

  const created = await threadWithSlug(
    'author-r1',
    'Thread with a post that gets removed',
    'The opening post stays.',
  )
  const replied = await write(
    'POST',
    `/api/threads/${created.body.slug}/posts`,
    'author-r2',
    { body: 'This reply will be removed.' },
  )
  expect(replied.status).toBe(201)

  const thread = (await (
    await read(`/api/threads/${created.body.slug}`)
  ).json()) as ThreadDetail
  const postId = thread.posts[1]!.id

  expect(
    (
      await write('POST', '/api/reports', 'reporter-r1', {
        postId,
        reason: 'harassment',
        details: 'Threat in the reply.',
      })
    ).status,
  ).toBe(201)

  const queue = (await (
    await read('/api/mod/reports', 'mod-one')
  ).json()) as ModQueue
  const report = queue.reports.find((entry) => entry.post.id === postId)!

  expect(
    (
      await write('POST', `/api/mod/reports/${report.id}/action`, 'mod-one', {
        action: 'remove_post',
        note: 'Threat.',
      })
    ).status,
  ).toBe(200)

  const after = (await (
    await read(`/api/threads/${created.body.slug}`)
  ).json()) as ThreadDetail
  expect(after.posts).toHaveLength(1)
  expect(after.thread.replyCount).toBe(0)
})

test('admins manage boards, permissions, and the audit trail', async () => {
  await read('/api/session', 'admin-two')
  await promote('admin-two', 'admin')

  const categoryResponse = await write(
    'POST',
    '/api/admin/categories',
    'admin-two',
    { name: 'Field Office', description: 'A category created in a test.' },
  )
  expect(categoryResponse.status).toBe(201)
  const category = (await categoryResponse.json()) as { id: string }

  const boardResponse = await write('POST', '/api/admin/boards', 'admin-two', {
    categoryId: category.id,
    name: 'Records Room',
    description: 'A board created in a test.',
  })
  expect(boardResponse.status).toBe(201)
  const board = (await boardResponse.json()) as { id: string }

  expect(
    (
      await write('PATCH', `/api/admin/boards/${board.id}`, 'admin-two', {
        name: 'Records Room Two',
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await write('POST', `/api/admin/boards/${board.id}/move`, 'admin-two', {
        direction: 'up',
      })
    ).status,
  ).toBe(200)

  expect(
    (
      await write('PATCH', `/api/admin/boards/${board.id}`, 'admin-two', {
        staffOnly: true,
        postMinRole: 'staff',
      })
    ).status,
  ).toBe(200)

  const memberView = (await (
    await read('/api/boards', 'plain-member')
  ).json()) as BoardIndex
  expect(memberView.categories.some((entry) => entry.id === category.id)).toBe(
    false,
  )

  await promote('plain-member', 'supporter')
  const supporterView = (await (
    await read('/api/boards', 'plain-member')
  ).json()) as BoardIndex
  expect(
    supporterView.categories.some((entry) => entry.id === category.id),
  ).toBe(true)

  // Supporters can read it, but only staff may post there.
  expect(
    (
      await write('POST', '/api/threads', 'plain-member', {
        boardId: board.id,
        title: 'Supporter tries to post',
        body: 'Should be refused.',
      })
    ).status,
  ).toBe(403)

  expect(
    (
      await write('PATCH', `/api/admin/boards/${board.id}`, 'admin-two', {
        archived: true,
      })
    ).status,
  ).toBe(200)
  const archived = (await (
    await read('/api/boards', 'admin-two')
  ).json()) as BoardIndex
  expect(archived.categories.some((entry) => entry.id === category.id)).toBe(
    false,
  )

  expect(
    (
      await write('PATCH', `/api/admin/boards/${board.id}`, 'admin-two', {
        archived: false,
      })
    ).status,
  ).toBe(200)

  const adminBoards = (await (
    await read('/api/admin/boards', 'admin-two')
  ).json()) as AdminBoards
  const created = adminBoards.categories.find(
    (entry) => entry.id === category.id,
  )
  expect(created?.boards[0]?.name).toBe('Records Room Two')
  expect(created?.boards[0]?.staffOnly).toBe(true)

  const audit = (await (
    await read('/api/admin/audit', 'admin-two')
  ).json()) as AuditPage
  const actions = audit.entries.map((entry) => entry.action)
  expect(actions).toContain('category.create')
  expect(actions).toContain('board.create')
  expect(actions).toContain('board.update')
  expect(actions).toContain('board.archive')
  expect(actions).toContain('board.restore')

  expect((await read('/api/admin/audit', 'mod-one')).status).toBe(403)
  expect((await read('/api/admin/audit', 'plain-member')).status).toBe(403)
})

// ---------------------------------------------------------------------------
// M3: media pipeline, timestamps, FOIA, notifications, realtime
// ---------------------------------------------------------------------------

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==',
    'base64',
  ),
)

function u32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function pngWithText(): Uint8Array {
  const base = PNG_1X1
  const iend = (() => {
    for (let index = 0; index < base.length - 8; index += 1) {
      if (
        base[index] === 0x49 &&
        base[index + 1] === 0x45 &&
        base[index + 2] === 0x4e &&
        base[index + 3] === 0x44
      )
        return index - 4
    }
    return base.length
  })()
  const text = new TextEncoder().encode('Comment\0this should not survive')
  const chunk = Uint8Array.from([
    ...u32(text.length),
    0x74,
    0x45,
    0x58,
    0x74,
    ...text,
    ...u32(0),
  ])
  const out = new Uint8Array(base.length + chunk.length)
  out.set(base.slice(0, iend), 0)
  out.set(chunk, iend)
  out.set(base.slice(iend), iend + chunk.length)
  return out
}

function jpegWithExif(): Uint8Array {
  const exif = new TextEncoder().encode('Exif\0\0GPS 44.9,-93.2 Pixel 9')
  const length = exif.length + 2
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...exif,
    0xff,
    0xc0,
    0,
    17,
    8,
    0,
    1,
    0,
    1,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ])
}

function webpWithExif(): Uint8Array {
  const u32le = (value: number) => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]
  const chunk = (type: string, data: Uint8Array) => {
    const padding = data.length % 2 ? [0] : []
    return Uint8Array.from([
      ...[...type].map((char) => char.charCodeAt(0)),
      ...u32le(data.length),
      ...data,
      ...padding,
    ])
  }
  const vp8x = new Uint8Array(10)
  vp8x[0] = 0x0c // EXIF + XMP flags
  vp8x[4] = 1
  vp8x[7] = 1
  const exif = new TextEncoder().encode('Exif\0\0phone-model')
  const body = Uint8Array.from([
    0x57,
    0x45,
    0x42,
    0x50,
    ...chunk('VP8X', vp8x),
    ...chunk('EXIF', exif),
  ])
  return Uint8Array.from([
    0x52,
    0x49,
    0x46,
    0x46,
    ...u32le(body.length),
    ...body,
  ])
}

const upload = (
  user: string,
  kind: 'avatar' | 'board_banner' | 'post_image',
  bytes: Uint8Array,
  type = 'image/png',
) =>
  app.request(
    `https://app.example.test/api/uploads?kind=${kind}`,
    {
      method: 'POST',
      headers: {
        'test-user': user,
        'Content-Type': type,
        Origin: env.APP_ORIGIN!,
      },
      body: bytes,
    },
    env,
  )

test('metadata is stripped from JPEG, PNG, and WebP containers', () => {
  const jpeg = stripMetadata(jpegWithExif())
  expect(jpeg).not.toBeNull()
  expect(jpeg!.image).toMatchObject({ mime: 'image/jpeg', width: 1, height: 1 })
  expect(Buffer.from(jpeg!.bytes).includes(Buffer.from('Exif'))).toBe(false)
  expect(Buffer.from(jpeg!.bytes).includes(Buffer.from('Pixel 9'))).toBe(false)

  const png = stripMetadata(pngWithText())
  expect(png).not.toBeNull()
  expect(png!.image).toMatchObject({ mime: 'image/png', width: 1, height: 1 })
  expect(Buffer.from(png!.bytes).includes(Buffer.from('tEXt'))).toBe(false)
  expect(Buffer.from(png!.bytes).includes(Buffer.from('should not survive'))).toBe(false)

  const webp = stripMetadata(webpWithExif())
  expect(webp).not.toBeNull()
  expect(webp!.image).toMatchObject({ mime: 'image/webp', width: 2, height: 2 })
  expect(Buffer.from(webp!.bytes).includes(Buffer.from('EXIF'))).toBe(false)
  expect(Buffer.from(webp!.bytes).includes(Buffer.from('phone-model'))).toBe(false)

  expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
})

test('an uploaded image is stripped, stored in R2, and served with immutable cache', async () => {
  const response = await upload('media-user', 'post_image', pngWithText())
  expect(response.status).toBe(201)
  const { media } = (await response.json()) as {
    media: { id: string; url: string; width: number; height: number }
  }
  expect(media.url).toBe(`/api/files/${media.id}`)
  expect(media).toMatchObject({ width: 1, height: 1 })

  const file = await read(media.url)
  expect(file.status).toBe(200)
  expect(file.headers.get('Content-Type')).toBe('image/png')
  expect(file.headers.get('Cache-Control')).toContain('immutable')
  const body = new Uint8Array(await file.arrayBuffer())
  expect(Buffer.from(body).includes(Buffer.from('tEXt'))).toBe(false)

  expect(
    (
      await upload(
        'media-user',
        'post_image',
        new TextEncoder().encode('<svg></svg>'),
        'image/png',
      )
    ).status,
  ).toBe(415)

  const anonymous = await app.request(
    'https://app.example.test/api/uploads?kind=post_image',
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Origin: env.APP_ORIGIN! },
      body: PNG_1X1,
    },
    env,
  )
  expect(anonymous.status).toBe(401)
})

test('avatars belong to their owner and appear on the profile', async () => {
  const uploaded = await upload('avatar-user', 'avatar', PNG_1X1)
  expect(uploaded.status).toBe(201)
  const { media } = (await uploaded.json()) as { media: { id: string } }

  expect(
    (
      await write('PATCH', '/api/me', 'avatar-user', {
        avatarMediaId: media.id,
      })
    ).status,
  ).toBe(200)

  const session = (await (
    await read('/api/session', 'avatar-user')
  ).json()) as Session
  expect(session.viewer?.avatarMediaId).toBe(media.id)
  const profile = (await (
    await read(`/api/users/${session.viewer!.handle}`)
  ).json()) as ProfileView
  expect(profile.user.avatarMediaId).toBe(media.id)

  // Another account cannot select the avatar by id.
  expect(
    (
      await write('PATCH', '/api/me', 'avatar-thief', {
        avatarMediaId: media.id,
      })
    ).status,
  ).toBe(400)
})

test('staff can attach and remove a board banner, members cannot upload one', async () => {
  const denied = await upload('plain-banner-user', 'board_banner', PNG_1X1)
  expect(denied.status).toBe(403)

  await read('/api/session', 'banner-mod')
  await promote('banner-mod', 'moderator')
  const uploaded = await upload('banner-mod', 'board_banner', PNG_1X1)
  expect(uploaded.status).toBe(201)
  const { media } = (await uploaded.json()) as { media: { id: string } }

  expect(
    (
      await write('PATCH', '/api/mod/boards/general/image', 'banner-mod', {
        mediaId: media.id,
      })
    ).status,
  ).toBe(200)

  const staffBoards = (await (
    await read('/api/mod/boards', 'banner-mod')
  ).json()) as { boards: { id: string; imageMediaId: string | null }[] }
  expect(staffBoards.boards.find((board) => board.id === 'general')?.imageMediaId).toBe(
    media.id,
  )

  const board = (await (await read('/api/boards/general')).json()) as BoardDetail
  expect(board.board.imageMediaId).toBe(media.id)

  expect(
    (
      await write('PATCH', '/api/mod/boards/general/image', 'banner-mod', {
        mediaId: null,
      })
    ).status,
  ).toBe(200)
  expect(
    (await (await read('/api/boards/general')).json() as BoardDetail).board.imageMediaId,
  ).toBeNull()
})

test('timestamps become seek links and new providers are extracted', () => {
  const rendered = renderMarkdown('Watch 1:05, then 00:10.', {
    linkTimestamps: true,
  })
  expect(rendered.html).toContain('?t=65')
  expect(rendered.html).toContain('?t=10')
  expect(rendered.html).toContain('class="timestamp"')

  const plain = renderMarkdown('Watch 1:05.', { linkTimestamps: false })
  expect(plain.html).not.toContain('timestamp')

  const ownImage = renderMarkdown(
    '![evidence](/api/files/00000000-0000-0000-0000-000000000000)',
  )
  expect(ownImage.html).toContain('<img')
  expect(ownImage.html).toContain('/api/files/00000000-0000-0000-0000-000000000000')
  const externalImage = renderMarkdown('![tracker](https://evil.example/x.png)')
  expect(externalImage.html).not.toContain('<img')

  const embeds = extractEmbeds(
    [
      'https://vimeo.com/123456789#t=1m5s',
      'https://framatube.org/w/abcdefgh-1234',
      'https://archive.org/details/some-recording?start=30',
    ].join('\n'),
  )
  expect(embeds).toEqual([
    { provider: 'vimeo', id: '123456789', url: 'https://vimeo.com/123456789', start: 65 },
    {
      provider: 'peertube',
      id: 'framatube.org/abcdefgh-1234',
      url: 'https://framatube.org/w/abcdefgh-1234',
    },
    {
      provider: 'archive',
      id: 'some-recording',
      url: 'https://archive.org/details/some-recording',
      start: 30,
    },
  ])
})

test('the FOIA library is complete and downloadable as plain text', () => {
  expect(FOIA_TEMPLATES.length).toBeGreaterThanOrEqual(8)
  expect(new Set(FOIA_TEMPLATES.map((template) => template.id)).size).toBe(
    FOIA_TEMPLATES.length,
  )
  expect(FOIA_TEMPLATES.map((template) => template.jurisdiction)).toEqual(
    expect.arrayContaining(['Federal', 'State', 'Local']),
  )
  for (const template of FOIA_TEMPLATES) {
    expect(template.body).toContain('[YOUR NAME]')
    expect(template.title.length).toBeGreaterThan(4)
  }
})

test('a reply notifies the thread author, and notifications are private', async () => {
  const created = await threadWithSlug(
    'notify-author',
    'Thread that should notify its author',
    'Opening post for the notification test.',
  )
  expect(created.status).toBe(201)
  expect(
    (
      await write(
        'POST',
        `/api/threads/${created.body.slug}/posts`,
        'notify-replier',
        { body: 'Replying so the author hears about it.' },
      )
    ).status,
  ).toBe(201)

  const page = (await (
    await read('/api/notifications', 'notify-author')
  ).json()) as {
    unread: number
    notifications: { type: string; thread: { slug: string } | null }[]
  }
  expect(page.unread).toBeGreaterThanOrEqual(1)
  expect(
    page.notifications.some(
      (item) =>
        item.type === 'reply' && item.thread?.slug === created.body.slug,
    ),
  ).toBe(true)

  const other = (await (
    await read('/api/notifications', 'notify-bystander')
  ).json()) as { unread: number; notifications: unknown[] }
  expect(other.notifications).toHaveLength(0)

  const marked = await write(
    'POST',
    '/api/notifications/read',
    'notify-author',
    {},
  )
  expect(((await marked.json()) as { unread: number }).unread).toBe(0)
})

test('mentions and warnings create notifications for the right account', async () => {
  const session = (await (
    await read('/api/session', 'mention-target')
  ).json()) as Session
  const handle = session.viewer!.handle

  const created = await threadWithSlug(
    'mention-author',
    'Thread used to test mentions',
    'A place to mention someone.',
  )
  expect(
    (
      await write(
        'POST',
        `/api/threads/${created.body.slug}/posts`,
        'mentioner',
        { body: `Looping in @${handle} on this one.` },
      )
    ).status,
  ).toBe(201)

  const mentioned = (await (
    await read('/api/notifications', 'mention-target')
  ).json()) as { notifications: { type: string }[] }
  expect(mentioned.notifications.some((item) => item.type === 'mention')).toBe(
    true,
  )

  await read('/api/session', 'warning-mod')
  await promote('warning-mod', 'moderator')
  expect(
    (
      await write(
        'POST',
        `/api/mod/users/${session.viewer!.id}/warnings`,
        'warning-mod',
        { points: 1, reason: 'A one-point test warning.' },
      )
    ).status,
  ).toBe(200)

  const warned = (await (
    await read('/api/notifications', 'mention-target')
  ).json()) as { notifications: { type: string }[] }
  expect(warned.notifications.some((item) => item.type === 'warning')).toBe(true)
})

test('admins configure donation settings and public payment methods', async () => {
  const initial = (await (await read('/api/donations')).json()) as DonationPage
  expect(initial.methods).toHaveLength(0)
  expect(initial.settings.intro).toContain('reader-supported')

  const member = await read('/api/session', 'donation-member')
  expect(member.status).toBe(200)
  expect(
    (
      await write('POST', '/api/admin/donations/methods', 'donation-member', {
        kind: 'paypal',
        label: 'PayPal',
        destination: '@donation-member',
      })
    ).status,
  ).toBe(403)

  await read('/api/session', 'm4-admin')
  await promote('m4-admin', 'admin')

  const created = await write(
    'POST',
    '/api/admin/donations/methods',
    'm4-admin',
    {
      kind: 'paypal',
      label: 'PayPal',
      destination: '@publiclens',
      url: 'https://paypal.me/publiclens',
      note: 'One-time or monthly.',
      enabled: true,
    },
  )
  expect(created.status).toBe(201)
  const createdBody = (await created.json()) as { method: { id: string } }
  const paypalId = createdBody.method.id

  const unsafe = await write(
    'POST',
    '/api/admin/donations/methods',
    'm4-admin',
    {
      kind: 'other',
      label: 'Unsafe',
      destination: 'nope',
      url: 'javascript:alert(1)',
    },
  )
  expect(unsafe.status).toBe(400)

  const zelle = await write(
    'POST',
    '/api/admin/donations/methods',
    'm4-admin',
    {
      kind: 'zelle',
      label: 'Zelle',
      destination: 'donate@example.test',
      note: 'Use the memo field.',
    },
  )
  expect(zelle.status).toBe(201)
  const zelleId = ((await zelle.json()) as { method: { id: string } }).method.id

  const publicPage = (await (
    await read('/api/donations')
  ).json()) as DonationPage
  expect(publicPage.methods).toHaveLength(2)
  expect(publicPage.methods[0]).toMatchObject({
    label: 'PayPal',
    url: 'https://paypal.me/publiclens',
  })

  expect(
    (
      await write('PATCH', `/api/admin/donations/methods/${paypalId}`, 'm4-admin', {
        enabled: false,
      })
    ).status,
  ).toBe(200)
  const hidden = (await (await read('/api/donations')).json()) as DonationPage
  expect(hidden.methods.map((method) => method.label)).toEqual(['Zelle'])

  expect(
    (
      await write('PATCH', `/api/admin/donations/methods/${zelleId}`, 'm4-admin', {
        url: 'http://insecure.example.test',
      })
    ).status,
  ).toBe(400)

  expect(
    (
      await write(
        'POST',
        `/api/admin/donations/methods/${zelleId}/move`,
        'm4-admin',
        { direction: 'up' },
      )
    ).status,
  ).toBe(200)

  expect(
    (
      await write('PATCH', '/api/admin/donations/settings', 'm4-admin', {
        intro: 'Keep the records room open.',
        memoNote: 'Put your handle in the memo.',
      })
    ).status,
  ).toBe(200)
  const edited = (await (await read('/api/donations')).json()) as DonationPage
  expect(edited.settings).toEqual({
    intro: 'Keep the records room open.',
    memoNote: 'Put your handle in the memo.',
  })

  const adminView = (await (
    await read('/api/admin/donations', 'm4-admin')
  ).json()) as AdminDonations
  expect(adminView.methods).toHaveLength(2)
  expect(adminView.methods[0]?.label).toBe('Zelle')

  expect(
    (
      await write(
        'DELETE',
        `/api/admin/donations/methods/${paypalId}`,
        'm4-admin',
        {},
      )
    ).status,
  ).toBe(200)
  expect(
    (await read('/api/admin/donations', 'm4-admin')).status,
  ).toBe(200)

  const audit = (await (
    await read('/api/admin/audit', 'm4-admin')
  ).json()) as AuditPage
  const actions = audit.entries.map((entry) => entry.action)
  expect(actions).toContain('donation.method.create')
  expect(actions).toContain('donation.method.update')
  expect(actions).toContain('donation.method.move')
  expect(actions).toContain('donation.method.delete')
  expect(actions).toContain('donation.settings.update')
})

test('admins grant and revoke Supporters, and donors can hide the badge', async () => {
  const donorSession = (await (
    await read('/api/session', 'donor-one')
  ).json()) as Session
  const donorHandle = donorSession.viewer!.handle
  const donorId = donorSession.viewer!.id

  await read('/api/session', 'm4-admin')
  await promote('m4-admin', 'admin')

  expect(
    (
      await write('POST', '/api/admin/supporters', 'donor-one', {
        handle: donorHandle,
        action: 'grant',
      })
    ).status,
  ).toBe(403)

  const granted = await write('POST', '/api/admin/supporters', 'm4-admin', {
    handle: `@${donorHandle}`,
    action: 'grant',
    note: 'Donation confirmed in PayPal.',
  })
  expect(granted.status).toBe(200)
  const grantedBody = (await granted.json()) as { supporter: AdminSupporter }
  expect(grantedBody.supporter).toMatchObject({
    handle: donorHandle,
    showSupporterBadge: true,
  })

  const afterGrant = (await (
    await read('/api/session', 'donor-one')
  ).json()) as Session
  expect(afterGrant.viewer).toMatchObject({
    id: donorId,
    staffRole: 'supporter',
    showSupporterBadge: true,
  })

  const profile = (await (
    await read(`/api/users/${donorHandle}`, 'donor-one')
  ).json()) as ProfileView
  expect(profile.user.staffRole).toBe('supporter')
  expect(profile.user.showSupporterBadge).toBe(true)

  const notification = (await (
    await read('/api/notifications', 'donor-one')
  ).json()) as { notifications: { type: string; snippet: string }[] }
  expect(
    notification.notifications.some(
      (item) =>
        item.type === 'supporter' && item.snippet.includes('now a Supporter'),
    ),
  ).toBe(true)

  // Granting again is harmless and does not duplicate the audit trail.
  expect(
    (
      await write('POST', '/api/admin/supporters', 'm4-admin', {
        handle: donorHandle,
        action: 'grant',
      })
    ).status,
  ).toBe(200)

  await read('/api/session', 'm4-moderator')
  await promote('m4-moderator', 'moderator')
  const moderator = (await (
    await read('/api/session', 'm4-moderator')
  ).json()) as Session
  expect(
    (
      await write('POST', '/api/admin/supporters', 'm4-admin', {
        handle: moderator.viewer!.handle,
        action: 'grant',
      })
    ).status,
  ).toBe(409)

  expect(
    (
      await write('PATCH', '/api/me', 'donor-one', {
        showSupporterBadge: false,
      })
    ).status,
  ).toBe(200)
  const hidden = (await (
    await read('/api/session', 'donor-one')
  ).json()) as Session
  expect(hidden.viewer!.showSupporterBadge).toBe(false)

  const revoked = await write('POST', '/api/admin/supporters', 'm4-admin', {
    handle: donorHandle,
    action: 'revoke',
    note: 'Test cleanup.',
  })
  expect(revoked.status).toBe(200)
  const afterRevoke = (await (
    await read('/api/session', 'donor-one')
  ).json()) as Session
  expect(afterRevoke.viewer!.staffRole).toBe('member')
  expect(
    (
      await write('PATCH', '/api/me', 'donor-one', {
        showSupporterBadge: true,
      })
    ).status,
  ).toBe(400)

  const supporters = (await (
    await read('/api/admin/supporters', 'm4-admin')
  ).json()) as { supporters: AdminSupporter[] }
  expect(supporters.supporters.some((item) => item.id === donorId)).toBe(false)

  const audit = (await (
    await read('/api/admin/audit', 'm4-admin')
  ).json()) as AuditPage
  const actions = audit.entries.map((entry) => entry.action)
  expect(actions).toContain('supporter.grant')
  expect(actions).toContain('supporter.revoke')
})

test('the realtime ticket is scoped to the signed-in user room', async () => {
  const session = (await (
    await read('/api/session', 'realtime-user')
  ).json()) as Session

  const wrongRoom = await write(
    'POST',
    '/api/realtime/ticket',
    'realtime-user',
    { room: 'user:somebody-else' },
  )
  expect(wrongRoom.status).toBe(403)

  const ownRoom = await write(
    'POST',
    '/api/realtime/ticket',
    'realtime-user',
    { room: `user:${session.viewer!.id}` },
  )
  expect(ownRoom.status).toBe(200)
  expect(((await ownRoom.json()) as { enabled: boolean }).enabled).toBe(false)

  const anonymous = await app.request(
    'https://app.example.test/api/realtime/ticket',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN! },
      body: JSON.stringify({ room: 'user:x' }),
    },
    env,
  )
  expect(anonymous.status).toBe(401)
})
