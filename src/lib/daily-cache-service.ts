import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import pool from '@/lib/db';
import { applyTtmExclusions, loadTtmExclusionSources } from '@/lib/black-listed-epic-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { refreshEpicAlertRowCache } from '@/lib/epic-alert-row-cache-service';
import { refreshTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { getTtmDashboard2CacheOverview, refreshTtmDashboard2Caches } from '@/lib/ttm-dashboard-2-cache-service';
import { runShadowScoring } from '@/lib/scoring-run-service';
import { getStoredScoringEngineMode } from '@/lib/scoring-mode-service';
import { projectRows } from '@/lib/scoring/projection';

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
  /** True when either today's daily run or an asynchronous derived cache rebuild lease is active. */
  isRebuilding: boolean;
  /** A cache rebuild died mid-run and left requests uncovered (see isRebuildLeaseOrphaned) — the
   * next page load re-runs today's rebuild even if today already has a SUCCESS. */
  rebuildInterrupted: boolean;
  state: DailyCacheState;
  today: string;
  todayRun: DailyCacheRun | null;
}

const RUN_COLUMNS_SQL = `
  r.run_date::text AS "runDate", r.status, r.started_at::text AS "startedAt", r.finished_at::text AS "finishedAt",
  r.duration_ms AS "durationMs", r.epic_row_count AS "epicRowCount", r.source_import_batch_id AS "sourceImportBatchId",
  r.attempt_count AS "attemptCount", r.error_message AS "errorMessage", u.full_name AS "triggeredByName"
`;

export async function isDerivedCacheRebuilding(): Promise<boolean> {
  try {
    const result = await pool.query<{ running: boolean }>(
      'SELECT (lease_owner IS NOT NULL AND lease_until >= CURRENT_TIMESTAMP) AS running FROM derived_cache_refresh_lock WHERE id = 1;',
    );
    return result.rows[0]?.running === true;
  } catch {
    return false;
  }
}

export async function getDailyCacheStatus(): Promise<DailyCacheStatus> {
  const [result, rebuildInterrupted, isRebuildingLock] = await Promise.all([pool.query<{
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
  `), isRebuildLeaseOrphaned(), isDerivedCacheRebuilding()]);
  const row = result.rows[0];
  const todayRun = row.runDate ? toRun(row) : null;
  const isRebuilding = (todayRun?.status === 'RUNNING' && !row.runningStale) || isRebuildingLock;

  // An interrupted rebuild makes even a cache computed today untrustworthy (it may predate an import
  // or a black-list save that was told "covered"), so it counts as STALE until a rebuild completes.
  let state: DailyCacheState = 'STALE';
  if (isRebuilding) state = 'RUNNING';
  else if (row.cacheFreshToday && !rebuildInterrupted) state = 'FRESH';
  else if (todayRun?.status === 'FAILED' && !row.failedRetryReady) state = 'FAILED';

  return { cacheComputedAt: row.cacheComputedAt, isRebuilding, rebuildInterrupted, state, today: row.today, todayRun };
}

/** Atomically claims today's run for this user — true only for the single caller that gets it.
 * Re-claimable only when today's earlier attempt FAILED (after a cool-down) or its RUNNING row went
 * stale (the function that owned it was killed), never while a live run or a SUCCESS exists —
 * except `recoverInterruptedRebuild` (DailyCacheStatus.rebuildInterrupted), which lets a SUCCESS be
 * re-run once: the first caller turns the row back to RUNNING, so everyone else is still refused. */
export async function claimDailyCacheRun(userId: number, recoverInterruptedRebuild = false): Promise<string | null> {
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
       OR ($2::boolean AND daily_cache_runs.status = 'SUCCESS')
    RETURNING run_date::text AS "runDate";
  `, [userId, recoverInterruptedRebuild]);
  return result.rows[0]?.runDate ?? null;
}

/** Rebuilds both derived caches off ONE computation of the unscoped newest-layer row set (the
 * expensive part), instead of each refresher recomputing it on its own. Returns the Epic count.
 * Only ever called through refreshDerivedCaches (the rebuild lease), never twice at the same time. */
async function rebuildDerivedCaches(batchId: number | null): Promise<number> {
  const [computed, exclusionSources] = await Promise.all([getEpicAlertRowsPhased(0, 'SUPERVISOR', {}), loadTtmExclusionSources()]);
  // "Epic ngoại lệ" / project Time to Market = N: every cached row carries ttmBlackListed +
  // ttmExclusion, so the caches (Quản trị Epic, TTM-Index, TTM Dashboard 2) all leave the Epic out of
  // the TTM calculation from L02 on. Saving the black list or a project's flag re-runs this.
  const rows = applyTtmExclusions(computed.rows, exclusionSources);
  // Epic Scoring Service in shadow mode: stored next to the legacy row + compared against it
  // (scoring_parity_runs). Returns null on failure — the legacy cache is still rebuilt.
  const scorecards = await runShadowScoring(rows);
  // Display engine 'scoring' (M4): the caches store the rows with the Scoring Service's verdicts
  // projected on — every cache reader (Quản trị Epic, TTM-Index, Dashboard) then shows them. If
  // shadow scoring failed, fall back to the legacy rows rather than leaving the caches stale.
  const displayRows = scorecards && (await getStoredScoringEngineMode()) === 'scoring' ? projectRows(rows, scorecards) : rows;
  await refreshTtmIndexGlobalCache(batchId, displayRows);
  await refreshEpicAlertRowCache(batchId, displayRows, scorecards);
  // TTM Dashboard 2's per-scope funnel cache is derived from the row cache just written. A failure
  // here must not fail the whole refresh — the screen rebuilds a missing/stale entry on demand.
  await refreshTtmDashboard2Caches().catch((error: unknown) => console.error('TTM Dashboard 2 cache refresh failed:', error));
  const count = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM epic_alert_row_cache;');
  return count.rows[0]?.n ?? 0;
}

/**
 * Rebuild lease (table derived_cache_refresh_lock, migration 20261005b). Saving the black list, a
 * project's Time to Market flag, the scope config, a domain…, an import and the daily run all
 * rebuild the derived caches — on serverless, possibly from several instances at once. Without
 * coordination two rebuilds overlap and the one that started first (reading the OLD black list /
 * flags) can finish last, leaving the caches stale until the next rebuild.
 *
 * Protocol (no lost request, at most one rebuild at a time):
 *   - every caller bumps request_seq and, in the SAME statement, takes the lease if it is free;
 *   - a caller that didn't get the lease returns right away (null) — the holder will cover it;
 *   - the holder rebuilds, then releases ONLY if request_seq hasn't moved since it started;
 *     otherwise it renews the lease and rebuilds again with the latest data.
 * A holder killed mid-run (function timeout) leaves the lease to expire after LEASE_INTERVAL; the
 * next request then takes it over. Requests that came in while the dead holder still held the lease
 * were answered "covered" and weren't — so an owned-but-expired lease is reported as
 * DailyCacheStatus.rebuildInterrupted and the next signed-in page load re-runs the rebuild
 * (isRebuildLeaseOrphaned, claimDailyCacheRun). If the table doesn't exist yet (database the
 * migration hasn't reached), rebuilds run uncoordinated, exactly as before.
 */
const LEASE_INTERVAL = '6 minutes';
/** Safety net against an endless stream of requests keeping one function busy past its timeout. */
const MAX_REBUILDS_PER_LEASE = 4;

type LeaseClaim = { claimed: boolean; seq: number } | 'NO_TABLE';

async function requestRebuild(owner: string, source: string): Promise<LeaseClaim> {
  try {
    const result = await pool.query<{ claimed: boolean; seq: string }>(`
      UPDATE derived_cache_refresh_lock SET
        request_seq = request_seq + 1,
        last_source = $2,
        updated_at = CURRENT_TIMESTAMP,
        lease_owner = CASE WHEN lease_until IS NULL OR lease_until < CURRENT_TIMESTAMP THEN $1 ELSE lease_owner END,
        lease_until = CASE WHEN lease_until IS NULL OR lease_until < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + INTERVAL '${LEASE_INTERVAL}' ELSE lease_until END
      WHERE id = 1
      RETURNING request_seq::text AS seq, lease_owner = $1 AS claimed;
    `, [owner, source.slice(0, 100)]);
    const row = result.rows[0];
    // Table present but its single row missing: behave as uncoordinated rather than never rebuild.
    return row ? { claimed: row.claimed, seq: Number(row.seq) } : 'NO_TABLE';
  } catch (error: unknown) {
    console.error('Derived-cache rebuild lease unavailable — rebuilding without coordination:', error);
    return 'NO_TABLE';
  }
}

/** Releases the lease when nobody asked again since `seq`; otherwise renews it and returns the newer
 * request_seq to rebuild for (null = the lease was lost to another instance after expiring). */
async function releaseOrRenew(owner: string, seq: number): Promise<{ released: true } | { released: false; seq: number | null }> {
  const released = await pool.query(
    'UPDATE derived_cache_refresh_lock SET lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND lease_owner = $1 AND request_seq = $2;',
    [owner, seq],
  );
  if ((released.rowCount ?? 0) > 0) return { released: true };
  const renewed = await pool.query<{ seq: string }>(
    `UPDATE derived_cache_refresh_lock SET lease_until = CURRENT_TIMESTAMP + INTERVAL '${LEASE_INTERVAL}', updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND lease_owner = $1 RETURNING request_seq::text AS seq;`,
    [owner],
  );
  return { released: false, seq: renewed.rows[0] ? Number(renewed.rows[0].seq) : null };
}

async function dropLease(owner: string): Promise<void> {
  await pool.query('UPDATE derived_cache_refresh_lock SET lease_owner = NULL, lease_until = NULL WHERE id = 1 AND lease_owner = $1;', [owner])
    .catch((error: unknown) => console.error('Failed to release the derived-cache rebuild lease:', error));
}

/** Gives the lease up while requests are still pending: left owned-but-expired — the state a killed
 * holder leaves — so the next request takes it over, or the next page load recovers it. */
async function abandonLease(owner: string): Promise<void> {
  await pool.query(`UPDATE derived_cache_refresh_lock SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = 1 AND lease_owner = $1;`, [owner])
    .catch((error: unknown) => console.error('Failed to abandon the derived-cache rebuild lease:', error));
}

/** True when a rebuild's holder stopped without finishing: the lease is still owned but has expired
 * (a clean finish, and a failure, always clear lease_owner). False when the lease table isn't there. */
async function isRebuildLeaseOrphaned(): Promise<boolean> {
  try {
    const result = await pool.query<{ orphaned: boolean | null }>(
      'SELECT (lease_owner IS NOT NULL AND lease_until < CURRENT_TIMESTAMP) AS orphaned FROM derived_cache_refresh_lock WHERE id = 1;',
    );
    return result.rows[0]?.orphaned === true;
  } catch {
    return false;
  }
}

/**
 * Rebuilds the derived caches (see rebuildDerivedCaches) under the rebuild lease. Returns the Epic
 * count of the last rebuild it ran, or null when another rebuild was already running — that one
 * then runs again with the latest data before finishing, so the request is never lost. `batchId`
 * is used for the first rebuild; a repeat picks up the latest import batch.
 */
export async function refreshDerivedCaches(batchId: number | null, source = 'manual'): Promise<number | null> {
  const owner = `${source.slice(0, 20)}:${randomUUID()}`;
  const claim = await requestRebuild(owner, source);
  if (claim === 'NO_TABLE') return rebuildDerivedCaches(batchId);
  if (!claim.claimed) return null;

  let seq = claim.seq;
  let nextBatchId = batchId;
  try {
    for (let run = 1; ; run += 1) {
      const count = await rebuildDerivedCaches(nextBatchId);
      const outcome = await releaseOrRenew(owner, seq);
      if (outcome.released || outcome.seq === null) return count;
      if (run >= MAX_REBUILDS_PER_LEASE) {
        console.error(`Derived-cache rebuild: still being asked after ${run} rebuilds in a row (latest: ${source}) — stopping; the next request or page load rebuilds again.`);
        await abandonLease(owner);
        return count;
      }
      seq = outcome.seq;
      nextBatchId = await getLatestImportBatchId();
    }
  } catch (error: unknown) {
    await dropLease(owner);
    throw error;
  }
}

/**
 * For a save that changes what the derived caches hold (scope, Domain, project, PM/SM, black list,
 * display engine): rebuilds them on the latest import batch in after() — past the response, so the
 * save stays instant. The route needs `maxDuration = 300`, like a post-import refresh.
 *
 * Nothing is read before the response and nothing is thrown: the save it follows is already
 * committed, so a failure here must not turn its response into an error (refreshDerivedCaches
 * throws on failure, and a rejection inside after() would otherwise vanish with nothing logged).
 */
export function scheduleDerivedCacheRefresh(source: string): void {
  after(async () => {
    try {
      await refreshDerivedCaches(await getLatestImportBatchId(), source);
    } catch (error: unknown) {
      console.error(`Background derived-cache refresh failed (${source}):`, error);
    }
  });
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
    // null = another rebuild was already running; it rebuilds once more before finishing, so today's
    // cache still ends up fresh — recorded as SUCCESS without a row count. Should that rebuild die
    // instead, its lease is left orphaned and the next page load re-claims today's run
    // (DailyCacheStatus.rebuildInterrupted).
    const epicRowCount = await refreshDerivedCaches(batchId, 'daily-cache');
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
  ttmDashboard2Cache: { computedAt: string | null; entryCount: number };
  ttmIndexGlobalCache: { computedAt: string; sourceImportBatchId: number | null } | null;
}

/** Everything "Theo dõi cache" (Quản trị nguồn dữ liệu) shows, in one round of parallel reads. */
export async function getCacheOverview(): Promise<CacheOverview> {
  const [dailyStatus, epicCache, globalCache, latestBatch, recentRuns, ttmDashboard2Cache] = await Promise.all([
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
    getTtmDashboard2CacheOverview(),
  ]);
  return {
    dailyStatus,
    epicRowCache: epicCache.rows[0] ?? { computedAt: null, rowCount: 0, sourceImportBatchId: null },
    latestImportBatch: latestBatch.rows[0] ?? null,
    recentRuns: recentRuns.rows.map(toRun),
    ttmDashboard2Cache,
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
