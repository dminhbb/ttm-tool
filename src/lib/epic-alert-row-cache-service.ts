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
 * Throws on failure (after rolling back) — callers decide: the import catches and only logs, since a
 * stale/missing cache is far less harmful than failing the import itself.
 */
const INSERT_CHUNK_SIZE = 200;
/** Arbitrary constant key for pg_advisory_xact_lock — unique to this cache's rebuild. */
const EPIC_ALERT_ROW_CACHE_LOCK_KEY = 7_260_925;
const INSERT_COLUMN_COUNT = 19;

/** `precomputedRows` — same as refreshTtmIndexGlobalCache's: lets refreshDerivedCaches
 * (daily-cache-service.ts) compute the unscoped row set once for both caches. */
export async function refreshEpicAlertRowCache(batchId: number | null, precomputedRows?: EpicAlertRowPhased[]): Promise<void> {
  const rows = precomputedRows ?? (await getEpicAlertRowsPhased(0, 'SUPERVISOR', {})).rows;
  // Last row per epic_key wins — same outcome the previous row-by-row ON CONFLICT upsert gave,
  // but a single multi-row INSERT can't touch the same key twice, so dedupe up front.
  const uniqueRows = [...new Map(rows.map((row) => [row.epicKey, row])).values()];
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Serializes concurrent rebuilds (import, daily run, scope/domain save, manual recompute can all
    // overlap): without it the later DELETE misses the earlier run's fresh INSERTs, the later INSERT
    // then hits a duplicate epic_key and rolls back — silently keeping the earlier (possibly stale-
    // config) rows. Transaction-scoped, so it's safe through Supabase's transaction pooler.
    await client.query('SELECT pg_advisory_xact_lock($1)', [EPIC_ALERT_ROW_CACHE_LOCK_KEY]);
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
          row.ttmCnttInScope,
          row.qaInScope,
        );
        const base = params.length - INSERT_COLUMN_COUNT;
        const p = (index: number) => `$${base + index}`;
        return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}, ${p(12)}, ${p(13)}, ${p(14)}, NOW(), ${p(15)}, ${p(16)}, ${p(17)}, ${p(18)}, ${p(19)})`;
      });
      await client.query(
        `
        INSERT INTO epic_alert_row_cache (
          epic_key, project_key, current_status, epic_type, requesting_unit, owner_names,
          components, alert_level, ttm_e2e_alert_level, has_data_anomaly, remaining_working_days,
          epic_name, row_data, source_import_batch_id, computed_at,
          alert_rank, bottom_status_rank, remaining_working_days_rank,
          ttm_cntt_in_scope, qa_in_scope
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
