import type { AuditEntry } from '../shared/types'

/** Append-only. There is deliberately no update or delete path. */
export async function logAudit(
  db: D1Database,
  entry: {
    actorId: string
    action: string
    targetType: string
    targetId: string
    reason?: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (
         id, actor_id, action, target_type, target_id, reason, metadata, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.reason ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      Date.now(),
    )
    .run()
}

export async function listAudit(db: D1Database): Promise<AuditEntry[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId,
              a.reason, a.metadata, a.created_at AS createdAt,
              COALESCE(u.display_name, 'removed account') AS actor
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 100`,
    )
    .all<AuditEntry>()
  return result.results
}
