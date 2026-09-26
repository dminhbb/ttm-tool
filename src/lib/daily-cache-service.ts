import pool from '@/lib/db';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { refreshEpicAlertRowCache } from '@/lib/epic-alert-row-cache-service';
import { refreshTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

/**
 * "Caching dữ liệu trong ngày": epic_alert_row_cache / ttm_index_global_cache are normally rebuilt
 * only right after a CSV import, but their alertLevel/remaining-working-days are evaluated as of the
 * day they were computed — so on a day without an import they'd silently drift. This deployment has
 * no scheduler, so instead the first signed-in page load of each Vietnam calendar day claims that
 * day's run (daily_cache_runs, one row per day — the PRIMARY KEY is what guarantees "once") and
 * rebuilds both caches in the background (see /api/system/daily-cache and DailyCacheWarmer).
 */

const VN_TODAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date";
/** A RUNNING row older than this is treated as a crashed/timed-out run and may be re-claimed. */
const RUNNING_STALE_INTERVAL = '10 minutes';
/** A FAILED run may be retried by the next page load once this long has passed. */
const FAILED_RETRY_INTERVAL = '5 minutes';

/** FRESH — the cache was already (re)built today (by today's daily run or by an import today). */
export type DailyCacheState = 'FAILED' | 'FRESH' | 'RUNNING' | 'STALE';

export interface DailyCacheRun {
  attemptCount: number;
  durationMs: number | null;
  epicRowCount: number | null;
  errorMessage: string | null;
  finishedAt: string | null;
  runDate: string;
  sourceImportBatchId: number | null;
  startedAt: string;
  status: 'FAILED' | 'RUNNING' | 'SUCCESS';
  triggeredByName: string | null;
}

export interface DailyCacheStatus {
  cacheComputedAt: string | null;
  state: DailyCacheState;
  today: string;
  todayRun: DailyCacheRun | null;
}

const RUN_COLUMNS_SQL = `
  r.run_date::text AS "runDate", r.status, r.started_at::text AS "startedAt", r.finished_at::text AS "finishedAt",
  r.duration_ms AS "durationMs", r.epic_row_count AS "epicRowCount", r.source_import_batch_id AS "sourceImportBatchId",
  r.attempt_count AS "attemptCount", r.error_message AS "errorMessage", u.full_name AS "triggeredByName"
`;

export async function getDailyCacheStatus(): Promise<DailyCacheStatus> {
  const result = await pool.query<{
    cacheComputedAt: string | null; cacheFreshToday: boolean; failedRetryReady: boolean | null;
    runningStale: boolean | null; today: string;
  } & Partial<DailyCacheRun>>(`
    WITH cache AS (SELECT max(computed_at) AS computed_at FROM epic_alert_row_cache)
    SELECT
      ${VN_TODAY_SQL}::text AS today,
      cache.computed_at::text AS "cacheComputedAt",
      COALESCE((cache.computed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${VN_TODAY_SQL}, FALSE) AS "cacheFreshToday",
      (r.status = 'RUNNING' AND r.started_at < CURRENT_TIMESTAMP - INTERVAL '${RUNNING_STALE_INTERVAL}') AS "runningStale",
      (r.status = 'FAILED' AND r.finished_at < CURRENT_TIMESTAMP - INTERVAL '${FAILED_RETRY_INTERVAL}') AS "failedRetryReady",
      ${RUN_COLUMNS_SQL}
    FROM cache
    LEFT JOIN daily_cache_runs r ON r.run_date = ${VN_TODAY_SQL}
    LEFT JOIN users u ON u.id = r.triggered_by_user_id;
  `);
  const row = result.rows[0];
  const todayRun = row.runDate ? toRun(row) : null;

  let state: DailyCacheState = 'STALE';
  if (todayRun?.status === 'RUNNING' && !row.runningStale) state = 'RUNNING';
  else if (row.cacheFreshToday) state = 'FRESH';
  else if (todayRun?.status === 'FAILED' && !row.failedRetryReady) state = 'FAILED';

  return { cacheComputedAt: row.cacheComputedAt, state, today: row.today, todayRun };
}

/** Atomically claims today's run for this user — true only for the single caller that gets it.
 * Re-claimable only when today's earlier attempt FAILED (after a cool-down) or its RUNNING row went
 * stale (the function that owned it was killed), never while a live run or a SUCCESS exists. */
export async function claimDailyCacheRun(userId: number): Promise<string | null> {
  const result = await pool.query<{ runDate: string }>(`
    INSERT INTO daily_cache_runs (run_date, status, triggered_by_user_id)
    VALUES (${VN_TODAY_SQL}, 'RUNNING', $1)
    ON CONFLICT (run_date) DO UPDATE SET
      status = 'RUNNING',
      triggered_by_user_id = EXCLUDED.triggered_by_user_id,
      started_at = CURRENT_TIMESTAMP,
      finished_at = NULL,
      duration_ms = NULL,
      error_message = NULL,
      attempt_count = daily_cache_runs.attempt_count + 1
    WHERE (daily_cache_runs.status = 'FAILED' AND daily_cache_runs.finished_at < CURRENT_TIMESTAMP - INTERVAL '${FAILED_RETRY_INTERVAL}')
       OR (daily_cache_runs.status = 'RUNNING' AND daily_cache_runs.started_at < CURRENT_TIMESTAMP - INTERVAL '${RUNNING_STALE_INTERVAL}')
    RETURNING run_date::text AS "runDate";
  `, [userId]);
  return result.rows[0]?.runDate ?? null;
}

/** Rebuilds both derived caches off ONE computation of the unscoped newest-layer row set (the
 * expensive part), instead of each refresher recomputing it on its own. Returns the Epic count. */
export async function refreshDerivedCaches(batchId: number | null): Promise<number> {
  const { rows } = await getEpicAlertRowsPhased(0, 'SUPERVISOR', {});
  await refreshTtmIndexGlobalCache(batchId, rows);
  await refreshEpicAlertRowCache(batchId, rows);
  const count = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM epic_alert_row_cache;');
  return count.rows[0]?.n ?? 0;
}

export async function getLatestImportBatchId(): Promise<number | null> {
  const result = await pool.query<{ id: number }>('SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1;');
  return result.rows[0]?.id ?? null;
}

/** Executes a run claimed via claimDailyCacheRun and records its outcome. Never throws. */
export async function runDailyCacheRefresh(runDate: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const batchId = await getLatestImportBatchId();
    const epicRowCount = await refreshDerivedCaches(batchId);
    await pool.query(
      `UPDATE daily_cache_runs SET status = 'SUCCESS', finished_at = CURRENT_TIMESTAMP, duration_ms = $2, epic_row_count = $3, source_import_batch_id = $4 WHERE run_date = $1::date;`,
      [runDate, Date.now() - startedAt, epicRowCount, batchId],
    );
  } catch (error: unknown) {
    console.error('Daily cache refresh failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE daily_cache_runs SET status = 'FAILED', finished_at = CURRENT_TIMESTAMP, duration_ms = $2, error_message = $3 WHERE run_date = $1::date;`,
      [runDate, Date.now() - startedAt, message.slice(0, 2000)],
    ).catch((updateError: unknown) => console.error('Failed to record daily cache failure:', updateError));
  }
}

export interface CacheOverview {
  dailyStatus: DailyCacheStatus;
  epicRowCache: { computedAt: string | null; rowCount: number; sourceImportBatchId: number | null };
  latestImportBatch: { aggregatedAt: string; fileName: string | null; id: number } | null;
  recentRuns: DailyCacheRun[];
  ttmIndexGlobalCache: { computedAt: string; sourceImportBatchId: number | null } | null;
}

/** Everything "Theo dõi cache" (Quản trị nguồn dữ liệu) shows, in one round of parallel reads. */
export async function getCacheOverview(): Promise<CacheOverview> {
  const [dailyStatus, epicCache, globalCache, latestBatch, recentRuns] = await Promise.all([
    getDailyCacheStatus(),
    pool.query<{ computedAt: string | null; rowCount: number; sourceImportBatchId: number | null }>(
      'SELECT count(*)::int AS "rowCount", max(computed_at)::text AS "computedAt", max(source_import_batch_id) AS "sourceImportBatchId" FROM epic_alert_row_cache;',
    ),
    pool.query<{ computedAt: string; sourceImportBatchId: number | null }>(
      'SELECT computed_at::text AS "computedAt", source_import_batch_id AS "sourceImportBatchId" FROM ttm_index_global_cache WHERE id = 1;',
    ),
    pool.query<{ aggregatedAt: string; fileName: string | null; id: number }>(
      'SELECT id, file_name AS "fileName", aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1;',
    ),
    pool.query<DailyCacheRun>(`
      SELECT ${RUN_COLUMNS_SQL}
      FROM daily_cache_runs r LEFT JOIN users u ON u.id = r.triggered_by_user_id
      ORDER BY r.run_date DESC LIMIT 10;
    `),
  ]);
  return {
    dailyStatus,
    epicRowCache: epicCache.rows[0] ?? { computedAt: null, rowCount: 0, sourceImportBatchId: null },
    latestImportBatch: latestBatch.rows[0] ?? null,
    recentRuns: recentRuns.rows.map(toRun),
    ttmIndexGlobalCache: globalCache.rows[0] ?? null,
  };
}

function toRun(row: Partial<DailyCacheRun>): DailyCacheRun {
  return {
    attemptCount: row.attemptCount ?? 1,
    durationMs: row.durationMs ?? null,
    epicRowCount: row.epicRowCount ?? null,
    errorMessage: row.errorMessage ?? null,
    finishedAt: row.finishedAt ?? null,
    runDate: row.runDate ?? '',
    sourceImportBatchId: row.sourceImportBatchId ?? null,
    startedAt: row.startedAt ?? '',
    status: row.status ?? 'RUNNING',
    triggeredByName: row.triggeredByName ?? null,
  };
}
