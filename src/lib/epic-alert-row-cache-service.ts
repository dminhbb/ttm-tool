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
const INSERT_CHUNK_SIZE = 200;
const INSERT_COLUMN_COUNT = 17;

export async function refreshEpicAlertRowCache(batchId: number | null): Promise<void> {
  const { rows } = await getEpicAlertRowsPhased(0, 'SUPERVISOR', {});
  // Last row per epic_key wins — same outcome the previous row-by-row ON CONFLICT upsert gave,
  // but a single multi-row INSERT can't touch the same key twice, so dedupe up front.
  const uniqueRows = [...new Map(rows.map((row) => [row.epicKey, row])).values()];
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM epic_alert_row_cache');
    // Batched multi-row INSERTs instead of one round trip per Epic: on a hosted DB (~100ms per
    // round trip) a few thousand single-row INSERTs outlived the serverless function's time limit,
    // rolled back, and silently left this cache empty — sending every Quản trị Epic view down the
    // slow live-recompute fallback.
    for (let offset = 0; offset < uniqueRows.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = uniqueRows.slice(offset, offset + INSERT_CHUNK_SIZE);
      const params: unknown[] = [];
      const valuesSql = chunk.map((row) => {
        params.push(
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
        );
        const base = params.length - INSERT_COLUMN_COUNT;
        const p = (index: number) => `$${base + index}`;
        return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}, ${p(13)}, ${p(14)}, NOW(), ${p(15)}, ${p(16)}, ${p(17)})`;
      });
      await client.query(
        `
        INSERT INTO epic_alert_row_cache (
          epic_key, project_key, current_status, epic_type, requesting_unit, owner_names,
          components, alert_level, ttm_e2e_alert_level, has_data_anomaly, remaining_working_days,
          epic_name, row_data, source_import_batch_id, computed_at,
          alert_rank, bottom_status_rank, remaining_working_days_rank
        ) VALUES ${valuesSql.join(', ')};
        `,
        params,
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
