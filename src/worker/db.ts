import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type {
  Author,
  BoardDetail,
  BoardIndex,
  BoardStats,
  BoardThread,
  CategoryView,
  ProfileView,
  StaffRole,
  ThreadDetail,
  ThreadPost,
} from '../shared/types'
import {
  extractEmbeds,
  extractEmbedsFromUrls,
  isSeekableEmbed,
  renderMarkdown,
} from './markdown'
import { MIGRATIONS } from './migrations'
import { renderRichHtml } from './richtext'
import { staffProfileFor } from './moderation'
import { canReadRestricted, isStaff } from './roles'
import * as schema from './schema'
import { seedDatabase } from './seed'
import { trustLevelFor } from './trust'

const ready = new WeakMap<D1Database, Promise<void>>()

/** Runs pending migrations once per database instance, then seeds content. */
export function ensureDatabase(db: D1Database): Promise<void> {
  let pending = ready.get(db)
  if (!pending) {
    pending = initialize(db).catch((error) => {
      ready.delete(db)
      throw error
    })
    ready.set(db, pending)
  }
  return pending
}

async function initialize(db: D1Database): Promise<void> {
  await db
    .prepare('CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)')
    .run()
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_meta (
         key TEXT PRIMARY KEY NOT NULL,
         value TEXT NOT NULL
       )`,
    )
    .run()

  const row = await db
    .prepare('SELECT MAX(version) AS version FROM schema_meta')
    .first<{ version: number | null }>()
  const current = row?.version ?? 0

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    await db.batch([
      ...migration.statements.map((sql) => db.prepare(sql)),
      db.prepare('INSERT INTO schema_meta (version) VALUES (?)').bind(migration.version),
    ])
  }

  await seedDatabase(db)

  // One-time staff bootstrap for the deployment owner. Keyed to the auth
  // subject, which a new sign-up cannot claim, and a fresh database simply
  // matches no row. This is a grant, not a general role editor.
  await db
    .prepare(
      "UPDATE users SET staff_role = 'admin' WHERE id = 'XO_K9hgkjIwJekcUXsKwybxk8CzfwvyymFDJizgX2_c' AND staff_role != 'admin'",
    )
    .run()
}

type SubcategoryStatRow = {
  subcategoryId: string
  threadCount: number
  postCount: number
  lastPostAt: number | null
}

type LatestRow = {
  subcategoryId: string
  threadSlug: string
  threadTitle: string
  authorName: string
  at: number
}

const SUBCATEGORY_STATS = `
  SELECT t.subcategory_id AS subcategoryId,
         COUNT(DISTINCT t.id) AS threadCount,
         COUNT(p.id) AS postCount,
         MAX(p.created_at) AS lastPostAt
  FROM threads t
  LEFT JOIN posts p ON p.thread_id = t.id AND p.status = 'published'
  WHERE t.status = 'published'
  GROUP BY t.subcategory_id
`

const LATEST_POSTS = `
  SELECT subcategoryId, threadSlug, threadTitle, authorName, at
  FROM (
    SELECT t.subcategory_id AS subcategoryId,
           t.slug AS threadSlug,
           t.title AS threadTitle,
           u.display_name AS authorName,
           p.created_at AS at,
           ROW_NUMBER() OVER (
             PARTITION BY t.subcategory_id
             ORDER BY p.created_at DESC, p.id DESC
           ) AS position
    FROM posts p
    JOIN threads t ON t.id = p.thread_id
    JOIN users u ON u.id = p.author_id
    WHERE p.status = 'published' AND t.status = 'published'
  )
  WHERE position = 1
`

const TOTALS = `
  SELECT (SELECT COUNT(*) FROM threads WHERE status = 'published') AS threads,
         (SELECT COUNT(*) FROM posts WHERE status = 'published') AS posts,
         (SELECT COUNT(*) FROM users) AS members
`

export async function getBoardIndex(
  db: D1Database,
  viewerRole: StaffRole | null,
): Promise<BoardIndex> {
  const orm = drizzle(db)
  const categoryRows = await orm
    .select()
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))
  const allSubcategories = await orm
    .select()
    .from(schema.subcategories)
    .orderBy(asc(schema.subcategories.sortOrder), asc(schema.subcategories.name))

  const subcategoryRows = allSubcategories.filter(
    (subcategory) =>
      !subcategory.archivedAt &&
      (!subcategory.staffOnly || canReadRestricted(viewerRole)),
  )

  const [statResult, latestResult, totalRow] = await Promise.all([
    db.prepare(SUBCATEGORY_STATS).all<SubcategoryStatRow>(),
    db.prepare(LATEST_POSTS).all<LatestRow>(),
    db.prepare(TOTALS).first<BoardStats>(),
  ])

  const statsBySubcategory = new Map(
    statResult.results.map((row) => [row.subcategoryId, row]),
  )
  const latestBySubcategory = new Map(
    latestResult.results.map((row) => [row.subcategoryId, row]),
  )

  const categories: CategoryView[] = categoryRows
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      subcategories: subcategoryRows
        .filter((subcategory) => subcategory.categoryId === category.id)
        .map((subcategory) => {
          const stats = statsBySubcategory.get(subcategory.id)
          const latest = latestBySubcategory.get(subcategory.id)
          return {
            id: subcategory.id,
            name: subcategory.name,
            description: subcategory.description,
            staffOnly: subcategory.staffOnly,
            threadCount: stats?.threadCount ?? 0,
            postCount: stats?.postCount ?? 0,
            latest: latest
              ? {
                  threadSlug: latest.threadSlug,
                  threadTitle: latest.threadTitle,
                  authorName: latest.authorName,
                  at: latest.at,
                }
              : null,
          }
        }),
    }))
    .filter((category) => category.subcategories.length > 0)

  return {
    categories,
    stats: totalRow ?? { threads: 0, posts: 0, members: 0 },
  }
}

export async function getBoard(
  db: D1Database,
  id: string,
  viewerRole: StaffRole | null,
): Promise<BoardDetail | null> {
  const orm = drizzle(db)
  const rows = await orm
    .select({ board: schema.subcategories, category: schema.categories })
    .from(schema.subcategories)
    .innerJoin(
      schema.categories,
      eq(schema.subcategories.categoryId, schema.categories.id),
    )
    .where(eq(schema.subcategories.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (row.board.staffOnly && !canReadRestricted(viewerRole)) return null

  const result = await db
    .prepare(
      `SELECT t.slug, t.title, t.prefix,
              t.is_pinned AS isPinned, t.is_locked AS isLocked,
              t.last_activity_at AS lastActivityAt,
              u.display_name AS authorName, u.handle AS authorHandle,
              u.avatar_color AS authorColor,
              (SELECT COUNT(*) FROM posts p
                WHERE p.thread_id = t.id AND p.status = 'published') AS postCount
       FROM threads t
       JOIN users u ON u.id = t.author_id
       WHERE t.subcategory_id = ? AND t.status = 'published'
       ORDER BY t.is_pinned DESC, t.last_activity_at DESC
       LIMIT 50`,
    )
    .bind(id)
    .all<{
      slug: string
      title: string
      prefix: string | null
      isPinned: number
      isLocked: number
      lastActivityAt: number
      authorName: string
      authorHandle: string
      authorColor: string
      postCount: number
    }>()

  const threads: BoardThread[] = result.results.map((thread) => ({
    slug: thread.slug,
    title: thread.title,
    prefix: thread.prefix,
    isPinned: Boolean(thread.isPinned),
    isLocked: Boolean(thread.isLocked),
    lastActivityAt: thread.lastActivityAt,
    replyCount: Math.max(0, thread.postCount - 1),
    author: {
      name: thread.authorName,
      handle: thread.authorHandle,
      avatarColor: thread.authorColor,
    },
  }))

  return {
    board: {
      id: row.board.id,
      name: row.board.name,
      description: row.board.description,
      archived: Boolean(row.board.archivedAt),
      imageMediaId: row.board.imageMediaId,
    },
    category: { id: row.category.id, name: row.category.name },
    threads,
  }
}

function mapAuthor(row: schema.UserRow): Author {
  return {
    id: row.id,
    handle: row.handle ?? 'member',
    name: row.displayName,
    roleTag: row.roleTag,
    staffRole: row.staffRole,
    avatarColor: row.avatarColor,
    avatarMediaId: row.avatarMediaId,
    showSupporterBadge: row.showSupporterBadge,
    joinedAt: row.joinedAt,
  }
}

export async function getThread(
  db: D1Database,
  slug: string,
  viewerRole: StaffRole | null,
): Promise<ThreadDetail | null> {
  const orm = drizzle(db)
  const rows = await orm
    .select({
      thread: schema.threads,
      category: schema.categories,
      subcategory: schema.subcategories,
    })
    .from(schema.threads)
    .innerJoin(
      schema.subcategories,
      eq(schema.threads.subcategoryId, schema.subcategories.id),
    )
    .innerJoin(
      schema.categories,
      eq(schema.subcategories.categoryId, schema.categories.id),
    )
    .where(
      and(eq(schema.threads.slug, slug), eq(schema.threads.status, 'published')),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (row.subcategory.staffOnly && !canReadRestricted(viewerRole)) return null

  const [postRows, tagRows, countRow] = await Promise.all([
    orm
      .select({ post: schema.posts, author: schema.users })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(
        and(
          eq(schema.posts.threadId, row.thread.id),
          eq(schema.posts.status, 'published'),
        ),
      )
      .orderBy(asc(schema.posts.position), asc(schema.posts.createdAt))
      .limit(100),
    orm
      .select({ name: schema.tags.name })
      .from(schema.threadTags)
      .innerJoin(schema.tags, eq(schema.threadTags.tagId, schema.tags.id))
      .where(eq(schema.threadTags.threadId, row.thread.id))
      .orderBy(asc(schema.tags.name)),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM posts
         WHERE thread_id = ? AND status = 'published'`,
      )
      .bind(row.thread.id)
      .first<{ count: number }>(),
  ])

  const prepared = postRows.map(({ post, author }) => {
    const embeds =
      post.bodyHtml === null
        ? extractEmbeds(post.body)
        : extractEmbedsFromUrls(renderRichHtml(post.bodyHtml).links)
    return { post, author, embeds }
  })
  const hasSeekableVideo = prepared.some(({ embeds }) =>
    embeds.some(isSeekableEmbed),
  )

  const posts: ThreadPost[] = prepared.map(({ post, author }) => {
    if (post.bodyHtml !== null) {
      const rendered = renderRichHtml(post.bodyHtml, {
        linkTimestamps: hasSeekableVideo,
      })
      return {
        id: post.id,
        body: post.body,
        html: rendered.html,
        embeds: extractEmbedsFromUrls(rendered.links),
        createdAt: post.createdAt,
        author: mapAuthor(author),
      }
    }
    const rendered = renderMarkdown(post.body, {
      linkTimestamps: hasSeekableVideo,
    })
    return {
      id: post.id,
      body: post.body,
      html: rendered.html,
      embeds: rendered.embeds,
      createdAt: post.createdAt,
      author: mapAuthor(author),
    }
  })

  const totalPosts = countRow?.count ?? posts.length

  return {
    thread: {
      id: row.thread.id,
      slug: row.thread.slug,
      title: row.thread.title,
      prefix: row.thread.prefix,
      isPinned: row.thread.isPinned,
      isLocked: row.thread.isLocked,
      createdAt: row.thread.createdAt,
      replyCount: Math.max(0, totalPosts - 1),
      tags: tagRows.map((tag) => tag.name),
    },
    category: { id: row.category.id, name: row.category.name },
    subcategory: {
      id: row.subcategory.id,
      name: row.subcategory.name,
      archived: Boolean(row.subcategory.archivedAt),
    },
    posts,
  }
}

export async function getProfile(
  db: D1Database,
  handle: string,
  viewerRole: StaffRole | null,
): Promise<ProfileView | null> {
  const orm = drizzle(db)
  const [user] = await orm
    .select()
    .from(schema.users)
    .where(eq(schema.users.handle, handle))
    .limit(1)
  if (!user?.handle) return null

  const [postRow, threadRow, recentResult] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM posts
         WHERE author_id = ? AND status = 'published'`,
      )
      .bind(user.id)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM threads
         WHERE author_id = ? AND status = 'published'`,
      )
      .bind(user.id)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT p.id, p.created_at AS at, substr(p.body, 1, 240) AS excerpt,
                t.slug AS threadSlug, t.title AS threadTitle
         FROM posts p
         JOIN threads t ON t.id = p.thread_id
         JOIN subcategories s ON s.id = t.subcategory_id
         WHERE p.author_id = ? AND p.status = 'published' AND t.status = 'published'
           AND (s.staff_only = 0 OR ? = 1)
         ORDER BY p.created_at DESC
         LIMIT 8`,
      )
      .bind(user.id, canReadRestricted(viewerRole) ? 1 : 0)
      .all<{
        id: string
        at: number
        excerpt: string
        threadSlug: string
        threadTitle: string
      }>(),
  ])

  const posts = postRow?.count ?? 0

  return {
    user: {
      id: user.id,
      handle: user.handle,
      name: user.displayName,
      bio: user.bio,
      roleTag: user.roleTag,
      staffRole: user.staffRole,
      avatarColor: user.avatarColor,
      avatarMediaId: user.avatarMediaId,
      showSupporterBadge: user.showSupporterBadge,
      joinedAt: user.joinedAt,
      trustLevel: trustLevelFor(user.joinedAt, posts),
    },
    stats: { threads: threadRow?.count ?? 0, posts },
    recent: recentResult.results,
    staff: isStaff(viewerRole) ? await staffProfileFor(db, user.id) : null,
  }
}
