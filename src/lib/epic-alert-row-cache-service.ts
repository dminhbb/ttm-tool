import { getClient } from '@/lib/db';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { ALERT_RANK, bottomStatusRankOf } from '@/lib/epic-alert-sort-rules';

/**
 * Recomputes and caches the full "Quản trị Epic" (đầy đủ) row set — permission-unscoped, newest
 * data layer only — right after an import commits (see processImport in import-service.ts), same
 * trigger as refreshTtmIndexGlobalCache. alertLevel/hasDataAnomaly/stages/etc. are all derived in
 * JS from working-day calendars and live story/subtask completion, not queryable SQL columns on
 * `issues`, so this is where that (expensive, once-per-import) computation happens; epic-alert-
 * row-cache-query-service.ts then serves paginated/filtered reads straight off this table instead
 * of recomputing per page view. Only ever holds the newest layer — "layer cũ hơn" drill-down on
 * Quản trị Epic keeps using the existing live computation path (getEpicAlertRowsPhased directly).
 *
 * Never throws: a stale/missing cache is far less harmful than failing the import itself, so the
 * caller only logs on failure — mirrors refreshTtmIndexGlobalCache.
 */
export async function refreshEpicAlertRowCache(batchId: number | null): Promise<void> {
  const { rows } = await getEpicAlertRowsPhased(0, 'SUPERVISOR', {});
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM epic_alert_row_cache');
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO epic_alert_row_cache (
          epic_key, project_key, current_status, epic_type, requesting_unit, owner_names,
          components, alert_level, ttm_e2e_alert_level, has_data_anomaly, remaining_working_days,
          epic_name, row_data, source_import_batch_id, computed_at,
          alert_rank, bottom_status_rank, remaining_working_days_rank
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, $17)
        ON CONFLICT (epic_key) DO UPDATE SET
          project_key = EXCLUDED.project_key,
          current_status = EXCLUDED.current_status,
          epic_type = EXCLUDED.epic_type,
          requesting_unit = EXCLUDED.requesting_unit,
          owner_names = EXCLUDED.owner_names,
          components = EXCLUDED.components,
          alert_level = EXCLUDED.alert_level,
          ttm_e2e_alert_level = EXCLUDED.ttm_e2e_alert_level,
          has_data_anomaly = EXCLUDED.has_data_anomaly,
          remaining_working_days = EXCLUDED.remaining_working_days,
          epic_name = EXCLUDED.epic_name,
          row_data = EXCLUDED.row_data,
          source_import_batch_id = EXCLUDED.source_import_batch_id,
          computed_at = NOW(),
          alert_rank = EXCLUDED.alert_rank,
          bottom_status_rank = EXCLUDED.bottom_status_rank,
          remaining_working_days_rank = EXCLUDED.remaining_working_days_rank;
        `,
        [
          row.epicKey,
          row.projectKey,
          row.currentStatus,
          row.epicType ?? '',
          row.requestingUnit,
          ownerNamesOf(row),
          row.components,
          row.alertLevel,
          row.ttmE2eAlertLevel,
          row.hasDataAnomaly,
          row.remainingWorkingDays,
          row.epicName,
          JSON.stringify(row),
          batchId,
          ALERT_RANK[row.alertLevel],
          bottomStatusRankOf(row.currentStatus),
          row.remainingWorkingDays ?? 2147483647,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function ownerNamesOf(row: EpicAlertRowPhased): string[] {
  return row.ownerName.split(',').map((name) => name.trim()).filter(Boolean);
}
