import pool, { getClient } from '@/lib/db';
import { deleteExpiredImportBatches } from '@/lib/data-retention-service';
import { purgeExpiredUsageStats } from '@/lib/usage-stats-service';
import { VISIT_DETAIL_WINDOW_DAYS } from '@/lib/visit-counter-types';

/** audit_logs rows older than this many days are deleted (owner decision 2026-10-24). */
export const AUDIT_LOG_RETENTION_DAYS = 90;

export interface HousekeepingResult {
  auditLogsDeleted: number;
  importBatchesDeleted: number;
  expiredSessionsDeleted: number;
  visitLogsRolledUp: number;
}

/** Sessions past expires_at can never authenticate again (getCurrentUser checks it), so they are dead weight. */
async function purgeExpiredSessions(): Promise<number> {
  const result = await pool.query('DELETE FROM auth_sessions WHERE expires_at < CURRENT_TIMESTAMP;');
  return result.rowCount ?? 0;
}

/**
 * Visit Counter retention (owner 2026-10-24): visit_logs keeps per-event detail only for the days the
 * "T-7 → T vs T-15 → T-8" comparison reads (VISIT_DETAIL_WINDOW_DAYS). Every row before 00:00 (Vietnam) of
 * day T-15 is folded into visit_log_rollups — the cumulative totals per app / screen / user — and deleted,
 * in one transaction with a single fixed cutoff, so the all-time totals (live rows + rollups) never
 * double-count or drop a row. See 20261024_create_visit_log_rollups.sql.
 */
async function rollUpOldVisitLogs(): Promise<number> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const cutoff = (await client.query<{ cutoff: Date }>(
      `SELECT (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - $1::int)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AS cutoff;`,
      [VISIT_DETAIL_WINDOW_DAYS],
    )).rows[0].cutoff;
    await client.query(`
      INSERT INTO visit_log_rollups (event_type, screen_key, user_id, visit_count)
      SELECT event_type, COALESCE(screen_key, ''), COALESCE(user_id, 0), COUNT(*)
      FROM visit_logs
      WHERE created_at < $1
      GROUP BY event_type, COALESCE(screen_key, ''), COALESCE(user_id, 0)
      ON CONFLICT (event_type, screen_key, user_id) DO UPDATE
        SET visit_count = visit_log_rollups.visit_count + EXCLUDED.visit_count, updated_at = CURRENT_TIMESTAMP;
    `, [cutoff]);
    const deleted = await client.query('DELETE FROM visit_logs WHERE created_at < $1;', [cutoff]);
    await client.query('COMMIT');
    return deleted.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function purgeOldAuditLogs(): Promise<number> {
  const result = await pool.query(`DELETE FROM audit_logs WHERE created_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day');`, [AUDIT_LOG_RETENTION_DAYS]);
  return result.rowCount ?? 0;
}

/**
 * The app's "dọn dẹp" job. There is no scheduler, so it runs once per Vietnam calendar day from the
 * daily cache run (runDailyCacheRefresh). Every step is an independent, idempotent delete: one
 * failing never blocks the others, and the next day simply retries. Never throws.
 */
export async function runDailyHousekeeping(): Promise<HousekeepingResult> {
  const result: HousekeepingResult = { auditLogsDeleted: 0, expiredSessionsDeleted: 0, importBatchesDeleted: 0, visitLogsRolledUp: 0 };
  const steps: [string, () => Promise<void>][] = [
    ['auth_sessions', async () => { result.expiredSessionsDeleted = await purgeExpiredSessions(); }],
    ['visit_logs', async () => { result.visitLogsRolledUp = await rollUpOldVisitLogs(); }],
    ['audit_logs', async () => { result.auditLogsDeleted = await purgeOldAuditLogs(); }],
    // Same RAW retention cleanup an import runs, so batches also expire on days without an import.
    ['import_batches', async () => { result.importBatchesDeleted = await deleteExpiredImportBatches(pool); }],
    ['user_usage_daily_stats', async () => { await purgeExpiredUsageStats(); }],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (error: unknown) {
      console.error(`Housekeeping step "${name}" failed:`, error);
    }
  }
  return result;
}
