import {
  DONATION_LIMITS,
  isDonationKind,
} from '../shared/donations'
import type {
  DonationMethod,
  DonationPage,
  DonationSettings,
} from '../shared/types'
import { logAudit } from './audit'
import { fail, ok, type MutationResult } from './result'

const SETTINGS_ID = 'default'

const DEFAULT_SETTINGS: DonationSettings = {
  intro:
    'PublicLens is independent and reader-supported. Donations cover hosting, storage, and the time that goes into keeping the boards useful.',
  memoNote:
    'Include your @handle in the payment note so I can match the payment to your account.',
}

type SettingsRow = {
  intro: string
  memoNote: string
}

type MethodRow = {
  id: string
  kind: string
  label: string
  destination: string
  url: string | null
  note: string | null
  enabled: number
  sortOrder: number
}

function mapMethod(row: MethodRow): DonationMethod {
  return {
    id: row.id,
    kind: isDonationKind(row.kind) ? row.kind : 'other',
    label: row.label,
    destination: row.destination,
    url: row.url,
    note: row.note,
    enabled: Boolean(row.enabled),
    sortOrder: row.sortOrder,
  }
}

export async function getDonationSettings(
  db: D1Database,
): Promise<DonationSettings> {
  const row = await db
    .prepare(
      'SELECT intro, memo_note AS memoNote FROM donation_settings WHERE id = ?',
    )
    .bind(SETTINGS_ID)
    .first<SettingsRow>()
  return row ?? DEFAULT_SETTINGS
}

export async function listDonationMethods(
  db: D1Database,
  options: { enabledOnly?: boolean } = {},
): Promise<DonationMethod[]> {
  const where = options.enabledOnly ? 'WHERE enabled = 1' : ''
  const result = await db
    .prepare(
      `SELECT id, kind, label, destination, url, note, enabled,
              sort_order AS sortOrder
       FROM donation_methods
       ${where}
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all<MethodRow>()
  return result.results.map(mapMethod)
}

export async function getDonationPage(db: D1Database): Promise<DonationPage> {
  const [settings, methods] = await Promise.all([
    getDonationSettings(db),
    listDonationMethods(db, { enabledOnly: true }),
  ])
  return { settings, methods }
}

export async function saveDonationSettings(
  db: D1Database,
  adminId: string,
  input: { intro: unknown; memoNote: unknown },
): Promise<MutationResult<DonationSettings>> {
  if (typeof input.intro !== 'string' || typeof input.memoNote !== 'string')
    return fail(400, 'Intro and payment note must be text.')
  const intro = input.intro.trim()
  const memoNote = input.memoNote.trim()
  if (!intro) return fail(400, 'The donation intro cannot be empty.')
  if (intro.length > DONATION_LIMITS.introMax)
    return fail(400, 'The donation intro is too long.')
  if (memoNote.length > DONATION_LIMITS.memoMax)
    return fail(400, 'The payment note is too long.')

  await db
    .prepare(
      `INSERT INTO donation_settings (id, intro, memo_note, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         intro = excluded.intro,
         memo_note = excluded.memo_note,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(SETTINGS_ID, intro, memoNote, Date.now(), adminId)
    .run()

  await logAudit(db, {
    actorId: adminId,
    action: 'donation.settings.update',
    targetType: 'donation_settings',
    targetId: SETTINGS_ID,
  })

  return ok({ intro, memoNote })
}

type MethodInput = {
  kind: unknown
  label: unknown
  destination: unknown
  url: unknown
  note: unknown
  enabled: unknown
}

type ParsedMethod = {
  kind: DonationMethod['kind']
  label: string
  destination: string
  url: string | null
  note: string | null
  enabled: boolean
}

function parseMethod(
  input: MethodInput,
  existing?: DonationMethod,
): MutationResult<ParsedMethod> {
  const rawKind = input.kind ?? existing?.kind
  if (typeof rawKind !== 'string' || !isDonationKind(rawKind))
    return fail(400, 'Choose a valid payment method type.')

  const rawLabel = input.label ?? existing?.label
  if (typeof rawLabel !== 'string' || !rawLabel.trim())
    return fail(400, 'Give the payment method a label.')
  const label = rawLabel.trim()
  if (label.length > DONATION_LIMITS.labelMax)
    return fail(400, 'The payment method label is too long.')

  const rawDestination = input.destination ?? existing?.destination
  if (typeof rawDestination !== 'string' || !rawDestination.trim())
    return fail(400, 'Add the public handle or address for this method.')
  const destination = rawDestination.trim()
  if (destination.length > DONATION_LIMITS.destinationMax)
    return fail(400, 'The payment handle or address is too long.')

  let url: string | null = existing?.url ?? null
  if (input.url !== undefined) {
    if (input.url === null || input.url === '') url = null
    else if (typeof input.url !== 'string')
      return fail(400, 'The payment link must be text.')
    else url = input.url.trim() || null
  }
  if (url) {
    if (url.length > DONATION_LIMITS.urlMax)
      return fail(400, 'The payment link is too long.')
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:')
        return fail(400, 'Payment links must start with https://.')
    } catch {
      return fail(400, 'That payment link is not a valid URL.')
    }
  }

  let note: string | null = existing?.note ?? null
  if (input.note !== undefined) {
    if (input.note === null || input.note === '') note = null
    else if (typeof input.note !== 'string')
      return fail(400, 'The payment note must be text.')
    else note = input.note.trim() || null
  }
  if (note && note.length > DONATION_LIMITS.noteMax)
    return fail(400, 'The payment method note is too long.')

  let enabled = existing?.enabled ?? true
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean')
      return fail(400, 'Enabled must be true or false.')
    enabled = input.enabled
  }

  return ok({ kind: rawKind, label, destination, url, note, enabled })
}

export async function createDonationMethod(
  db: D1Database,
  adminId: string,
  input: MethodInput,
): Promise<MutationResult<DonationMethod>> {
  const count = await db
    .prepare('SELECT COUNT(*) AS count FROM donation_methods')
    .first<{ count: number }>()
  if ((count?.count ?? 0) >= DONATION_LIMITS.methodsMax)
    return fail(400, 'There are already too many payment methods.')

  const parsed = parseMethod(input)
  if (!parsed.ok) return parsed

  const max = await db
    .prepare('SELECT MAX(sort_order) AS max FROM donation_methods')
    .first<{ max: number | null }>()
  const now = Date.now()
  const method: DonationMethod = {
    id: crypto.randomUUID(),
    ...parsed.value,
    sortOrder: (max?.max ?? -1) + 1,
  }

  await db
    .prepare(
      `INSERT INTO donation_methods (
         id, kind, label, destination, url, note, enabled, sort_order,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      method.id,
      method.kind,
      method.label,
      method.destination,
      method.url,
      method.note,
      method.enabled ? 1 : 0,
      method.sortOrder,
      now,
      now,
    )
    .run()

  await logAudit(db, {
    actorId: adminId,
    action: 'donation.method.create',
    targetType: 'donation_method',
    targetId: method.id,
    metadata: { kind: method.kind, label: method.label },
  })

  return ok(method)
}

async function methodById(
  db: D1Database,
  id: string,
): Promise<DonationMethod | null> {
  const row = await db
    .prepare(
      `SELECT id, kind, label, destination, url, note, enabled,
              sort_order AS sortOrder
       FROM donation_methods WHERE id = ?`,
    )
    .bind(id)
    .first<MethodRow>()
  return row ? mapMethod(row) : null
}

export async function updateDonationMethod(
  db: D1Database,
  adminId: string,
  id: string,
  input: MethodInput,
): Promise<MutationResult<DonationMethod>> {
  const existing = await methodById(db, id)
  if (!existing) return fail(404, 'That payment method does not exist.')

  const parsed = parseMethod(input, existing)
  if (!parsed.ok) return parsed
  const next = { ...existing, ...parsed.value }

  await db
    .prepare(
      `UPDATE donation_methods
       SET kind = ?, label = ?, destination = ?, url = ?, note = ?,
           enabled = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      next.kind,
      next.label,
      next.destination,
      next.url,
      next.note,
      next.enabled ? 1 : 0,
      Date.now(),
      id,
    )
    .run()

  await logAudit(db, {
    actorId: adminId,
    action: 'donation.method.update',
    targetType: 'donation_method',
    targetId: id,
    metadata: { kind: next.kind, label: next.label, enabled: next.enabled },
  })

  return ok(next)
}

export async function deleteDonationMethod(
  db: D1Database,
  adminId: string,
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const existing = await methodById(db, id)
  if (!existing) return fail(404, 'That payment method does not exist.')

  await db.prepare('DELETE FROM donation_methods WHERE id = ?').bind(id).run()
  await logAudit(db, {
    actorId: adminId,
    action: 'donation.method.delete',
    targetType: 'donation_method',
    targetId: id,
    metadata: { kind: existing.kind, label: existing.label },
  })
  return ok({ id })
}

export async function moveDonationMethod(
  db: D1Database,
  adminId: string,
  id: string,
  direction: 'up' | 'down',
): Promise<MutationResult<DonationMethod[]>> {
  const methods = await listDonationMethods(db)
  const index = methods.findIndex((method) => method.id === id)
  if (index < 0) return fail(404, 'That payment method does not exist.')
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= methods.length) return ok(methods)

  const current = methods[index]
  const other = methods[target]
  if (!current || !other) return ok(methods)

  await db.batch([
    db
      .prepare('UPDATE donation_methods SET sort_order = ? WHERE id = ?')
      .bind(other.sortOrder, current.id),
    db
      .prepare('UPDATE donation_methods SET sort_order = ? WHERE id = ?')
      .bind(current.sortOrder, other.id),
  ])

  await logAudit(db, {
    actorId: adminId,
    action: 'donation.method.move',
    targetType: 'donation_method',
    targetId: id,
    metadata: { direction },
  })

  return ok(await listDonationMethods(db))
}
