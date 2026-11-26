import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Drizzle table definitions for PublicLens.
 * The matching DDL lives in migrations.ts; keep the two in step.
 */

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind', {
      enum: ['avatar', 'board_banner', 'post_image'],
    }).notNull(),
    objectKey: text('object_key').notNull().unique(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status', { enum: ['active', 'removed'] })
      .notNull()
      .default('active'),
    staffOnly: integer('staff_only', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('media_owner_created').on(table.ownerId, table.createdAt),
    index('media_owner_hash').on(table.ownerId, table.sha256),
  ],
)

export const users = sqliteTable('users', {
  // The Freebuff auth subject. Seeded staff accounts use a `seed:` prefix.
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  handle: text('handle').unique(),
  bio: text('bio'),
  staffRole: text('staff_role', {
    enum: ['member', 'supporter', 'moderator', 'admin'],
  })
    .notNull()
    .default('member'),
  roleTag: text('role_tag'),
  avatarColor: text('avatar_color').notNull().default('#3B82F6'),
  avatarMediaId: text('avatar_media_id'),
  showSupporterBadge: integer('show_supporter_badge', { mode: 'boolean' })
    .notNull()
    .default(true),
  joinedAt: integer('joined_at').notNull(),
  mutedUntil: integer('muted_until'),
})

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const subcategories = sqliteTable(
  'subcategories',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    staffOnly: integer('staff_only', { mode: 'boolean' })
      .notNull()
      .default(false),
    postMinRole: text('post_min_role', {
      enum: ['member', 'supporter', 'staff'],
    })
      .notNull()
      .default('member'),
    archivedAt: integer('archived_at'),
    imageMediaId: text('image_media_id'),
  },
  (table) => [
    index('subcategories_category_sort').on(table.categoryId, table.sortOrder),
  ],
)

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    subcategoryId: text('subcategory_id')
      .notNull()
      .references(() => subcategories.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    prefix: text('prefix'),
    isPinned: integer('is_pinned', { mode: 'boolean' })
      .notNull()
      .default(false),
    isLocked: integer('is_locked', { mode: 'boolean' })
      .notNull()
      .default(false),
    status: text('status', { enum: ['published', 'held', 'removed'] })
      .notNull()
      .default('published'),
    createdAt: integer('created_at').notNull(),
    lastActivityAt: integer('last_activity_at').notNull(),
  },
  (table) => [
    index('threads_board_activity').on(
      table.subcategoryId,
      table.isPinned,
      table.lastActivityAt,
    ),
    index('threads_status').on(table.status),
  ],
)

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    // Canonical sanitised TipTap HTML. Null means the body is legacy Markdown.
    bodyHtml: text('body_html'),
    status: text('status', { enum: ['published', 'held', 'removed'] })
      .notNull()
      .default('published'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at'),
  },
  (table) => [index('posts_thread_position').on(table.threadId, table.position)],
)

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
})

export const threadTags = sqliteTable(
  'thread_tags',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.tagId] })],
)

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id),
    targetType: text('target_type').notNull().default('post'),
    targetId: text('target_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status', {
      enum: ['open', 'in_review', 'resolved', 'dismissed'],
    })
      .notNull()
      .default('open'),
    resolution: text('resolution'),
    handledBy: text('handled_by').references(() => users.id),
    createdAt: integer('created_at').notNull(),
    handledAt: integer('handled_at'),
  },
  (table) => [
    index('reports_status').on(table.status, table.createdAt),
    index('reports_reporter_target').on(table.reporterId, table.targetId),
  ],
)

export const warnings = sqliteTable(
  'warnings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    moderatorId: text('moderator_id')
      .notNull()
      .references(() => users.id),
    points: integer('points').notNull(),
    reason: text('reason').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    revokedBy: text('revoked_by').references(() => users.id),
    revokeReason: text('revoke_reason'),
  },
  (table) => [index('warnings_user').on(table.userId, table.createdAt)],
)

export const modNotes = sqliteTable(
  'mod_notes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('mod_notes_user').on(table.userId, table.createdAt)],
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('audit_log_created').on(table.createdAt)],
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    type: text('type', {
      enum: ['reply', 'mention', 'warning', 'report', 'supporter'],
    }).notNull(),
    threadId: text('thread_id'),
    postId: text('post_id'),
    snippet: text('snippet').notNull(),
    createdAt: integer('created_at').notNull(),
    readAt: integer('read_at'),
  },
  (table) => [
    index('notifications_user_created').on(table.userId, table.createdAt),
    index('notifications_user_read').on(table.userId, table.readAt),
  ],
)

export const donationSettings = sqliteTable('donation_settings', {
  id: text('id').primaryKey(),
  intro: text('intro').notNull().default(''),
  memoNote: text('memo_note').notNull().default(''),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by'),
})

export const donationMethods = sqliteTable(
  'donation_methods',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    destination: text('destination').notNull(),
    url: text('url'),
    note: text('note'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('donation_methods_sort').on(table.enabled, table.sortOrder),
  ],
)

export type UserRow = typeof users.$inferSelect
