import { POST_MIN_ROLES, type PostMinRole } from '../shared/forum'
import type { AdminBoard, AdminBoards, AdminCategory } from '../shared/types'
import { logAudit } from './audit'
import { fail, ok, type MutationResult } from './result'
import { cleanName, slugify } from './text'
import type { ViewerProfile } from './users'

type Direction = 'up' | 'down'

function validateName(name: string): string | null {
  if (name.length < 3) return 'Names need at least 3 characters.'
  if (name.length > 60) return 'Names are limited to 60 characters.'
  return null
}

function validateDescription(description: string): string | null {
  return description.length > 200
    ? 'Descriptions are limited to 200 characters.'
    : null
}

function isPostMinRole(value: string): value is PostMinRole {
  return (POST_MIN_ROLES as readonly string[]).includes(value)
}

async function uniqueId(
  db: D1Database,
  table: 'categories' | 'subcategories',
  name: string,
): Promise<string> {
  const base = slugify(name, 40) || 'board'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 5)}`
    const taken = await db
      .prepare(`SELECT 1 AS taken FROM ${table} WHERE id = ?`)
      .bind(candidate)
      .first()
    if (!taken) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 5)}`
}

export async function listAdminBoards(db: D1Database): Promise<AdminBoards> {
  const [categories, boards] = await Promise.all([
    db
      .prepare(
        'SELECT id, name, description, sort_order AS sortOrder FROM categories ORDER BY sort_order, name',
      )
      .all<Omit<AdminCategory, 'boards'>>(),
    db
      .prepare(
        `SELECT s.id, s.category_id AS categoryId, s.name, s.description,
                s.sort_order AS sortOrder, s.staff_only AS staffOnly,
                s.post_min_role AS postMinRole, s.archived_at AS archivedAt,
                s.image_media_id AS imageMediaId,
                (SELECT COUNT(*) FROM threads t
                  WHERE t.subcategory_id = s.id AND t.status = 'published') AS threadCount
         FROM subcategories s
         ORDER BY s.sort_order, s.name`,
      )
      .all<{
        id: string
        categoryId: string
        name: string
        description: string
        sortOrder: number
        staffOnly: boolean
        postMinRole: string
        archivedAt: number | null
        imageMediaId: string | null
        threadCount: number
      }>(),
  ])

  const mapped: AdminBoard[] = boards.results.map((board) => ({
    id: board.id,
    categoryId: board.categoryId,
    name: board.name,
    description: board.description,
    sortOrder: board.sortOrder,
    staffOnly: Boolean(board.staffOnly),
    postMinRole: board.postMinRole,
    archived: Boolean(board.archivedAt),
    imageMediaId: board.imageMediaId,
    threadCount: board.threadCount,
  }))

  return {
    categories: categories.results.map((category) => ({
      ...category,
      boards: mapped.filter((board) => board.categoryId === category.id),
    })),
  }
}

export async function createCategory(
  db: D1Database,
  admin: ViewerProfile,
  input: { name: string; description: string },
): Promise<MutationResult<{ id: string }>> {
  const name = cleanName(input.name)
  const description = cleanName(input.description)
  const invalid = validateName(name) ?? validateDescription(description)
  if (invalid) return fail(400, invalid)

  const id = await uniqueId(db, 'categories', name)
  const order = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories')
    .first<{ next: number }>()

  await db
    .prepare(
      'INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)',
    )
    .bind(id, name, description, order?.next ?? 0)
    .run()

  await logAudit(db, {
    actorId: admin.row.id,
    action: 'category.create',
    targetType: 'category',
    targetId: id,
    reason: name,
  })

  return ok({ id })
}

export async function updateCategory(
  db: D1Database,
  admin: ViewerProfile,
  id: string,
  input: { name?: string; description?: string },
): Promise<MutationResult<{ ok: true }>> {
  const sets: string[] = []
  const binds: (string | number | null)[] = []

  if (input.name !== undefined) {
    const name = cleanName(input.name)
    const invalid = validateName(name)
    if (invalid) return fail(400, invalid)
    sets.push('name = ?')
    binds.push(name)
  }
  if (input.description !== undefined) {
    const description = cleanName(input.description)
    const invalid = validateDescription(description)
    if (invalid) return fail(400, invalid)
    sets.push('description = ?')
    binds.push(description)
  }
  if (!sets.length) return fail(400, 'Nothing to change.')

  const existing = await db
    .prepare('SELECT 1 AS found FROM categories WHERE id = ?')
    .bind(id)
    .first()
  if (!existing) return fail(404, 'That category does not exist.')

  await db
    .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run()

  await logAudit(db, {
    actorId: admin.row.id,
    action: 'category.update',
    targetType: 'category',
    targetId: id,
    reason: null,
    metadata: input,
  })

  return ok({ ok: true })
}

export async function createBoard(
  db: D1Database,
  admin: ViewerProfile,
  input: { categoryId: string; name: string; description: string },
): Promise<MutationResult<{ id: string }>> {
  const name = cleanName(input.name)
  const description = cleanName(input.description)
  const invalid = validateName(name) ?? validateDescription(description)
  if (invalid) return fail(400, invalid)

  const category = await db
    .prepare('SELECT 1 AS found FROM categories WHERE id = ?')
    .bind(input.categoryId)
    .first()
  if (!category) return fail(404, 'That category does not exist.')

  const id = await uniqueId(db, 'subcategories', name)
  const order = await db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM subcategories WHERE category_id = ?',
    )
    .bind(input.categoryId)
    .first<{ next: number }>()

  await db
    .prepare(
      `INSERT INTO subcategories (
         id, category_id, name, description, sort_order, staff_only, post_min_role
       ) VALUES (?, ?, ?, ?, ?, 0, 'member')`,
    )
    .bind(id, input.categoryId, name, description, order?.next ?? 0)
    .run()

  await logAudit(db, {
    actorId: admin.row.id,
    action: 'board.create',
    targetType: 'board',
    targetId: id,
    reason: name,
    metadata: { categoryId: input.categoryId },
  })

  return ok({ id })
}

export async function updateBoard(
  db: D1Database,
  admin: ViewerProfile,
  id: string,
  input: {
    name?: string
    description?: string
    staffOnly?: boolean
    postMinRole?: string
    archived?: boolean
  },
): Promise<MutationResult<{ ok: true }>> {
  const board = await db
    .prepare('SELECT 1 AS found FROM subcategories WHERE id = ?')
    .bind(id)
    .first()
  if (!board) return fail(404, 'That board does not exist.')

  const sets: string[] = []
  const binds: (string | number | null)[] = []

  if (input.name !== undefined) {
    const name = cleanName(input.name)
    const invalid = validateName(name)
    if (invalid) return fail(400, invalid)
    sets.push('name = ?')
    binds.push(name)
  }
  if (input.description !== undefined) {
    const description = cleanName(input.description)
    const invalid = validateDescription(description)
    if (invalid) return fail(400, invalid)
    sets.push('description = ?')
    binds.push(description)
  }
  if (input.staffOnly !== undefined) {
    sets.push('staff_only = ?')
    binds.push(input.staffOnly ? 1 : 0)
  }
  if (input.postMinRole !== undefined) {
    if (!isPostMinRole(input.postMinRole))
      return fail(400, 'That posting restriction is not available.')
    sets.push('post_min_role = ?')
    binds.push(input.postMinRole)
  }
  if (input.archived !== undefined) {
    sets.push('archived_at = ?')
    binds.push(input.archived ? Date.now() : null)
  }
  if (!sets.length) return fail(400, 'Nothing to change.')

  await db
    .prepare(`UPDATE subcategories SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run()

  const action =
    input.archived === true
      ? 'board.archive'
      : input.archived === false
        ? 'board.restore'
        : 'board.update'
  await logAudit(db, {
    actorId: admin.row.id,
    action,
    targetType: 'board',
    targetId: id,
    reason: null,
    metadata: input,
  })

  return ok({ ok: true })
}

async function swapOrder(
  db: D1Database,
  current: { id: string; sortOrder: number },
  neighbour: { id: string; sortOrder: number } | null,
  table: 'categories' | 'subcategories',
): Promise<boolean> {
  if (!neighbour) return false
  await db.batch([
    db
      .prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`)
      .bind(neighbour.sortOrder, current.id),
    db
      .prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`)
      .bind(current.sortOrder, neighbour.id),
  ])
  return true
}

export async function moveCategory(
  db: D1Database,
  admin: ViewerProfile,
  id: string,
  direction: Direction,
): Promise<MutationResult<{ ok: true }>> {
  const current = await db
    .prepare('SELECT id, sort_order AS sortOrder FROM categories WHERE id = ?')
    .bind(id)
    .first<{ id: string; sortOrder: number }>()
  if (!current) return fail(404, 'That category does not exist.')

  const neighbour = await db
    .prepare(
      `SELECT id, sort_order AS sortOrder FROM categories
       WHERE sort_order ${direction === 'up' ? '<' : '>'} ?
       ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'}
       LIMIT 1`,
    )
    .bind(current.sortOrder)
    .first<{ id: string; sortOrder: number }>()

  if (!(await swapOrder(db, current, neighbour, 'categories')))
    return ok({ ok: true })

  await logAudit(db, {
    actorId: admin.row.id,
    action: 'category.move',
    targetType: 'category',
    targetId: id,
    reason: direction,
  })
  return ok({ ok: true })
}

export async function moveBoard(
  db: D1Database,
  admin: ViewerProfile,
  id: string,
  direction: Direction,
): Promise<MutationResult<{ ok: true }>> {
  const current = await db
    .prepare(
      'SELECT id, category_id AS categoryId, sort_order AS sortOrder FROM subcategories WHERE id = ?',
    )
    .bind(id)
    .first<{ id: string; categoryId: string; sortOrder: number }>()
  if (!current) return fail(404, 'That board does not exist.')

  const neighbour = await db
    .prepare(
      `SELECT id, sort_order AS sortOrder FROM subcategories
       WHERE category_id = ? AND sort_order ${direction === 'up' ? '<' : '>'} ?
       ORDER BY sort_order ${direction === 'up' ? 'DESC' : 'ASC'}
       LIMIT 1`,
    )
    .bind(current.categoryId, current.sortOrder)
    .first<{ id: string; sortOrder: number }>()

  if (!(await swapOrder(db, current, neighbour, 'subcategories')))
    return ok({ ok: true })

  await logAudit(db, {
    actorId: admin.row.id,
    action: 'board.move',
    targetType: 'board',
    targetId: id,
    reason: direction,
  })
  return ok({ ok: true })
}
