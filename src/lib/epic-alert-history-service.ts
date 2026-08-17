import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';

export type EpicAlertHistoryType = 'FAIL' | 'LATE';

/** 'OVERALL' = the pre-existing Epic-level LATE/FAIL alert (import-time, epic_status_alert_rules).
 * The other values are Epic 15's per-component-phase alerts (screen-view-time, see epic-alert-phase-service.ts). */
export type EpicAlertHistoryPhase = 'OVERALL' | 'DESIGN' | 'DEV' | 'TEST' | 'PENTEST' | 'R4GOLIVE';

export interface EpicAlertHistoryEntry {
  alertDate: string;
  alertStatus: string;
  alertType: EpicAlertHistoryType;
  phase: EpicAlertHistoryPhase;
}

/**
 * Appends one accumulated alert record for an Epic (never overwritten across days — only
 * refreshed if the same epic/day/type/phase combination re-triggers). For 'OVERALL', called once
 * per Epic per import batch when that day's computed alert level is LATE or FAIL. For the other
 * phases, called once per Epic per day a user views "Quản lý Epic 15" while that phase is LATE.
 */
export async function recordEpicAlertHistory(
  client: Pool | PoolClient,
  epicKey: string,
  alertType: EpicAlertHistoryType,
  alertStatus: string,
  alertDate: Date,
  sourceImportBatchId: number | null,
  phase: EpicAlertHistoryPhase = 'OVERALL',
): Promise<void> {
  await client.query(`
    INSERT INTO epic_alert_history (epic_key, alert_type, alert_status, alert_date, source_import_batch_id, phase)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (epic_key, alert_date, alert_type, phase) DO UPDATE SET
      alert_status = EXCLUDED.alert_status,
      source_import_batch_id = EXCLUDED.source_import_batch_id;
  `, [epicKey, alertType, alertStatus, alertDate, sourceImportBatchId, phase]);
}

/** Full accumulated alert history for one Epic, most recent first. */
export async function listEpicAlertHistory(epicKey: string): Promise<EpicAlertHistoryEntry[]> {
  const result = await pool.query<EpicAlertHistoryEntry>(`
    SELECT alert_date::text AS "alertDate", alert_status AS "alertStatus", alert_type AS "alertType", phase
    FROM epic_alert_history
    WHERE epic_key = $1
    ORDER BY alert_date DESC, id DESC;
  `, [epicKey]);
  return result.rows;
}

/** Every epic_key that has at least one accumulated alert record, for the Epic Alerts screen's Released-epic visibility rule. */
export async function getEpicKeysWithAlertHistory(): Promise<Set<string>> {
  const result = await pool.query<{ epicKey: string }>('SELECT DISTINCT epic_key AS "epicKey" FROM epic_alert_history;');
  return new Set(result.rows.map((row) => row.epicKey));
}
