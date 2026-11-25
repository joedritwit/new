/**
 * Ordered D1 migrations. Each entry is applied once and recorded in
 * `schema_meta`, so a deployed database upgrades in place.
 *
 * Column names and defaults must match `schema.ts`. Never edit an applied
 * migration; append a new one instead.
 */

export type Migration = { version: number; statements: string[] }

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        staff_role TEXT NOT NULL DEFAULT 'member',
        role_tag TEXT,
        avatar_color TEXT NOT NULL DEFAULT '#3B82F6',
        joined_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS subcategories (
        id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        staff_only INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY NOT NULL,
        subcategory_id TEXT NOT NULL REFERENCES subcategories(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id),
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        prefix TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_locked INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'published',
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY NOT NULL,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        edited_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS thread_tags (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (thread_id, tag_id)
      )`,
      `CREATE INDEX IF NOT EXISTS subcategories_category_sort
         ON subcategories (category_id, sort_order)`,
      `CREATE INDEX IF NOT EXISTS threads_board_activity
         ON threads (subcategory_id, is_pinned, last_activity_at)`,
      `CREATE INDEX IF NOT EXISTS threads_status ON threads (status)`,
      `CREATE INDEX IF NOT EXISTS posts_thread_position
         ON posts (thread_id, position)`,
    ],
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE users ADD COLUMN handle TEXT`,
      `ALTER TABLE users ADD COLUMN bio TEXT`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (handle)`,
      `UPDATE users SET handle = 'redline',
         bio = 'Started auditing county offices in 2019. Writes the rules here so nobody has to guess them.'
       WHERE id = 'seed:redline'`,
      `UPDATE users SET handle = 'lex-patria',
         bio = 'Reads statutes for fun and filings for a living. Citations or it did not happen.'
       WHERE id = 'seed:lex'`,
      `UPDATE users SET handle = 'margin-call',
         bio = 'Minneapolis. County board meetings, public works yards, and the occasional post office mistake.'
       WHERE id = 'seed:margin'`,
      `UPDATE users SET handle = 'ferrite',
         bio = 'Audio and power. If your recording dies at hour six, that is a design choice.'
       WHERE id = 'seed:ferrite'`,
      `UPDATE users SET handle = 'onlooker',
         bio = 'Viewer first. Interested in where documentation stops and harassment starts.'
       WHERE id = 'seed:onlooker'`,
      `UPDATE users SET handle = 'quietcarry',
         bio = 'Small setup, long battery. Mostly here to read the FOIA threads.'
       WHERE id = 'seed:quietcarry'`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY NOT NULL,
        reporter_id TEXT NOT NULL REFERENCES users(id),
        target_type TEXT NOT NULL DEFAULT 'post',
        target_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        resolution TEXT,
        handled_by TEXT REFERENCES users(id),
        created_at INTEGER NOT NULL,
        handled_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at)`,
      `CREATE INDEX IF NOT EXISTS reports_reporter_target
         ON reports (reporter_id, target_id)`,
      `CREATE TABLE IF NOT EXISTS warnings (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        moderator_id TEXT NOT NULL REFERENCES users(id),
        points INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        revoked_by TEXT REFERENCES users(id),
        revoke_reason TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS warnings_user ON warnings (user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS mod_notes (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        author_id TEXT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS mod_notes_user ON mod_notes (user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_at DESC)`,
      `ALTER TABLE users ADD COLUMN muted_until INTEGER`,
      `ALTER TABLE subcategories ADD COLUMN post_min_role TEXT NOT NULL DEFAULT 'member'`,
      `ALTER TABLE subcategories ADD COLUMN archived_at INTEGER`,
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS media_owner_created
         ON media (owner_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS media_owner_hash
         ON media (owner_id, sha256)`,
      `ALTER TABLE users ADD COLUMN avatar_media_id TEXT`,
      `ALTER TABLE subcategories ADD COLUMN image_media_id TEXT`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        thread_id TEXT,
        post_id TEXT,
        snippet TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS notifications_user_created
         ON notifications (user_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS notifications_user_read
         ON notifications (user_id, read_at)`,
    ],
  },
  {
    version: 5,
    statements: [
      `ALTER TABLE users ADD COLUMN show_supporter_badge INTEGER NOT NULL DEFAULT 1`,
      `CREATE TABLE IF NOT EXISTS donation_settings (
        id TEXT PRIMARY KEY NOT NULL,
        intro TEXT NOT NULL DEFAULT '',
        memo_note TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        updated_by TEXT
      )`,
      `INSERT OR IGNORE INTO donation_settings (id, intro, memo_note, updated_at)
       VALUES (
         'default',
         'PublicLens is independent and reader-supported. Donations cover hosting, storage, and the time that goes into keeping the boards useful.',
         'Include your @handle in the payment note so I can match the payment to your account.',
         strftime('%s', 'now') * 1000
       )`,
      `CREATE TABLE IF NOT EXISTS donation_methods (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        destination TEXT NOT NULL,
        url TEXT,
        note TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS donation_methods_sort
         ON donation_methods (enabled, sort_order)`,
    ],
  },
]
