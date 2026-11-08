import 'server-only';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import { daysBefore } from '@/lib/data-layer-retention';
import { listSelectableLayerDates } from '@/lib/data-layer-retention-service';
import { resolveAccessScope, type AccessScope } from '@/lib/epic-alert-service';
import { rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-alert-rows-service';
import { ttmDashboard2ScopeKey } from '@/lib/ttm-dashboard-2-cache-service';
import {
  isFunnelCnttFail,
  pickSeriesDates,
  referenceDates,
  TREND_HISTORY_RETENTION_DAYS,
  TREND_SCOPE_KEY,
  TREND_SERIES_POINTS,
  TREND_SERIES_STEP,
  trendValuesOf,
  type TtmDashboardTrend,
  type TtmTrendPoint,
  type TtmTrendSeriesPoint,
  type TtmTrendValues,
} from '@/lib/ttm-dashboard-trend';
import { summarizeTtmFunnel, toTtmFunnelRow, TTM_FUNNEL_ROW_KEYS, type TtmFunnelRow } from '@/lib/ttm-funnel-summary';

/**
 * TTM Dashboard 2 — the numbers behind "Xu hướng biến động chỉ số" and the "So với …" ticker (owner 2026-11-03).
 *
 * ttm_dashboard_metric_history keeps, per data scope (ALL, each active ADMIN and USER — the keys of ttm_dashboard_2_cache)
 * and per data layer date, the six widget numbers AS THEY WERE when that layer was the newest. Only the newest layer is
 * written by a rebuild (cheap: it reads epic_alert_row_cache, the very rows the dashboard shows); an older layer is never
 * touched again. That is what keeps the free-tier database and function minutes out of it — nothing re-judges past days.
 * The one exception is a layer the history lacks (the first deployment, a skipped day): backfillLayerHistory fills it by
 * judging the Epics as they stood on that date with TODAY's rules (source BACKFILL), once, and never overwrites a row.
 *
 * ttm_dashboard_trend_cache then holds, per scope, the ONE row the dashboard reads: the newest numbers, the previous layer's
 * (ticker), the chart series and the week / month comparison days, plus the Epics that newly became Fail TTM-CNTT.
 * Rebuilt by refreshDerivedCaches for the daily run, a manual "Tạo lại cache" and every import (TREND_REFRESH_SOURCES).
 */

/** refreshDerivedCaches sources that also rebuild the ticker (owner decision: daily run, manual rebuild, import). */
export const TREND_REFRESH_SOURCES: ReadonlySet<string> = new Set(['daily-cache', 'recompute-cache', 'import']);

/** Arbitrary constant key for pg_advisory_xact_lock — unique to this cache's rewrite. */
const TREND_WRITE_LOCK_KEY = 7_261_113;

const ALL_SCOPE: AccessScope = { accessRole: 'CBQL_PHONG', projectComponents: new Map(), sourceProjectKeys: null };

/** How many selectable layers are looked at: every 5th of the newest 31 feed the chart, the rest only name the previous layer. */
const LAYERS_NEEDED = (TREND_SERIES_POINTS - 1) * TREND_SERIES_STEP + 1;

type ScopedRow = { components: string[] | null; epicKey: string; projectKey: string; row: TtmFunnelRow };
export type ScopeTarget = { scope: AccessScope; scopeKey: string };
type HistorySource = 'BACKFILL' | 'DAILY';

function inScope(rows: readonly ScopedRow[], scope: AccessScope): ScopedRow[] {
  return rows.filter((item) => rowInAccessScope(scope, item.projectKey, item.components));
}

function valuesFor(rows: readonly ScopedRow[]): TtmTrendValues {
  return trendValuesOf(summarizeTtmFunnel(rows.map((item) => item.row)));
}

/** Every scope the dashboard caches: the company, each active ADMIN and each active USER. Sequential on purpose (hosted connection caps, db.ts). */
export async function loadScopeTargets(): Promise<ScopeTarget[]> {
  const users = await pool.query<{ id: number; role: UserRole }>("SELECT id, role FROM users WHERE is_active AND role IN ('ADMIN', 'USER') ORDER BY id");
  const targets: ScopeTarget[] = [{ scope: ALL_SCOPE, scopeKey: 'ALL' }];
  for (const user of users.rows) targets.push({ scope: await resolveAccessScope(user.id, user.role), scopeKey: ttmDashboard2ScopeKey(user.id, user.role) });
  return targets;
}

function failKeysOf(rows: readonly ScopedRow[]): string[] {
  return rows.filter((item) => isFunnelCnttFail(item.row)).map((item) => item.epicKey).sort();
}

/**
 * Writes one layer date's numbers for every scope (and the company's Fail Epic keys). DAILY overwrites the day's own row
 * (a second import the same day); BACKFILL never overwrites — an existing row is the frozen truth.
 */
async function writeHistory(layerDate: string, source: HistorySource, rows: readonly ScopedRow[], targets: readonly ScopeTarget[]): Promise<void> {
  const keys: string[] = [];
  const values: string[] = [];
  for (const { scope, scopeKey } of targets) {
    keys.push(scopeKey);
    values.push(JSON.stringify(valuesFor(inScope(rows, scope))));
  }
  const onConflict = source === 'DAILY'
    ? 'DO UPDATE SET metric_values = EXCLUDED.metric_values, source = EXCLUDED.source, computed_at = CURRENT_TIMESTAMP'
    : 'DO NOTHING';
  const failOnConflict = source === 'DAILY'
    ? 'DO UPDATE SET fail_epic_keys = EXCLUDED.fail_epic_keys, source = EXCLUDED.source, computed_at = CURRENT_TIMESTAMP'
    : 'DO NOTHING';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO ttm_dashboard_metric_history (scope_key, layer_date, metric_values, source)
       SELECT t.scope_key, $1::date, t.metric_values::jsonb, $2 FROM unnest($3::text[], $4::text[]) AS t(scope_key, metric_values)
       ON CONFLICT (scope_key, layer_date) ${onConflict}`,
      [layerDate, source, keys, values],
    );
    await client.query(
      `INSERT INTO ttm_dashboard_fail_history (layer_date, fail_epic_keys, source) VALUES ($1::date, $2::text[], $3)
       ON CONFLICT (layer_date) ${failOnConflict}`,
      [layerDate, failKeysOf(rows), source],
    );
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fills the history of a past layer date: every Epic judged as it stood on that date with today's rules (the same call the
 * row cache uses for today, plus asOfDate) — ~30-40 s, so it is run once by hand (scripts/backfill-ttm-metric-history.ts)
 * or, for the previous layer only, when a refresh finds it missing. Existing rows are left alone.
 */
export async function backfillLayerHistory(layerDate: string): Promise<{ scopes: number }> {
  const past = await getEpicAlertRowsForDisplay(0, 'SUPERVISOR', { asOfDate: layerDate });
  const rows: ScopedRow[] = past.rows.map((row) => ({ components: row.components, epicKey: row.epicKey, projectKey: row.projectKey, row: toTtmFunnelRow(row) }));
  const targets = await loadScopeTargets();
  await writeHistory(layerDate, 'BACKFILL', rows, targets);
  return { scopes: targets.length };
}

/** Of the given dates, the ones the history holds no company row for yet (what a backfill still has to fill). */
export async function missingHistoryDates(dates: readonly string[]): Promise<string[]> {
  const have = await datesWithHistory();
  return dates.filter((date) => !have.has(date));
}

/** Layer dates that already have their ALL-scope row. */
async function datesWithHistory(): Promise<Set<string>> {
  const result = await pool.query<{ d: string }>("SELECT layer_date::text AS d FROM ttm_dashboard_metric_history WHERE scope_key = 'ALL';");
  return new Set(result.rows.map((row) => row.d));
}

/**
 * All data layer dates available to the system, newest first.
 * Combines selectable dates (import_batches + data_snapshot_dates) and dates already recorded in
 * ttm_dashboard_metric_history (so a restored Smart Export environment or thinned history retains its trend points).
 */
export async function loadAvailableLayerDates(): Promise<string[]> {
  const selectable = await listSelectableLayerDates(pool, 400);
  const historyResult = await pool.query<{ d: string }>("SELECT DISTINCT layer_date::text AS d FROM ttm_dashboard_metric_history WHERE scope_key = 'ALL';");
  const combined = new Set([...selectable, ...historyResult.rows.map((row) => row.d)]);
  return [...combined].sort().reverse();
}

/**
 * The layer dates the dashboard will want from the history, newest first: the chart's data layers and the week / month
 * comparison days — what a one-off backfill has to cover.
 */
export async function listNeededHistoryDates(): Promise<{ all: string[]; layers: string[] }> {
  const layers = await loadAvailableLayerDates();
  const series = pickSeriesDates(layers.slice(0, LAYERS_NEEDED));
  const refs = layers.length > 0 ? referenceDates(layers[0], layers) : { month: null, week: null };
  const wanted = new Set<string>([...layers.slice(0, LAYERS_NEEDED), ...series, ...(refs.week ? [refs.week] : []), ...(refs.month ? [refs.month] : [])]);
  return { all: [...wanted].sort().reverse(), layers };
}

/** Rebuilds the history row of the newest layer and every scope's dashboard row. Returns how many scope rows were written (0 when there is no older layer). */
export async function refreshDashboardTrendCache(): Promise<number> {
  const selectable = await listSelectableLayerDates(pool, 400);
  const historyDates = (await pool.query<{ d: string }>("SELECT DISTINCT layer_date::text AS d FROM ttm_dashboard_metric_history WHERE scope_key = 'ALL';")).rows.map((row) => row.d);
  const layers = [...new Set([...selectable, ...historyDates])].sort().reverse();
  if (layers.length === 0) return 0;
  const latest = selectable.length > 0 ? selectable[0] : layers[0];

  const fieldsSql = TTM_FUNNEL_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ');
  const currentRows = await pool.query<ScopedRow>(`SELECT epic_key AS "epicKey", project_key AS "projectKey", components, jsonb_build_object(${fieldsSql}) AS row FROM epic_alert_row_cache`);
  const targets = await loadScopeTargets();
  await writeHistory(latest, 'DAILY', currentRows.rows, targets);

  // Housekeeping of the history: past the retention only. A scope that is not current (a user made inactive, an ADMIN
  // turned USER) keeps its rows, so they are there again if it comes back (review 2026-11-04); 400 days bound them.
  await pool.query('DELETE FROM ttm_dashboard_metric_history WHERE layer_date < $1::date;', [daysBefore(latest, TREND_HISTORY_RETENTION_DAYS)]);
  await pool.query('DELETE FROM ttm_dashboard_fail_history WHERE layer_date < $1::date;', [daysBefore(latest, TREND_HISTORY_RETENTION_DAYS)]);

  if (layers.length < 2) {
    await pool.query('DELETE FROM ttm_dashboard_trend_cache');
    return 0;
  }
  const previous = layers[1];
  // The previous layer was the newest one yesterday, so it is normally there. A first deployment or a skipped day is filled
  // once (~30-40 s). A scope that has no row for it (a user activated or given another role since) is NOT a reason to
  // judge every Epic again: it simply has no ticker until its next day (free-tier database, review 2026-11-04).
  if (!(await datesWithHistory()).has(previous)) await backfillLayerHistory(previous);

  const seriesDates = pickSeriesDates(layers);
  const history = await pool.query<{ date: string; scopeKey: string; values: TtmTrendValues }>(
    'SELECT scope_key AS "scopeKey", layer_date::text AS date, metric_values AS values FROM ttm_dashboard_metric_history WHERE layer_date = ANY($1::date[]);',
    [[...new Set([latest, previous, ...seriesDates])]],
  );
  const knownDates = (await pool.query<{ d: string }>('SELECT DISTINCT layer_date::text AS d FROM ttm_dashboard_metric_history;')).rows.map((row) => row.d);
  const refs = referenceDates(latest, knownDates);
  const refHistory = await pool.query<{ date: string; scopeKey: string; values: TtmTrendValues }>(
    'SELECT scope_key AS "scopeKey", layer_date::text AS date, metric_values AS values FROM ttm_dashboard_metric_history WHERE layer_date = ANY($1::date[]);',
    [[refs.week, refs.month].filter((date): date is string => date !== null)],
  );
  const valueAt = new Map<string, TtmTrendValues>();
  for (const row of [...history.rows, ...refHistory.rows]) valueAt.set(`${row.scopeKey}|${row.date}`, row.values);

  const previousFail = new Set((await pool.query<{ keys: string[] }>('SELECT fail_epic_keys AS keys FROM ttm_dashboard_fail_history WHERE layer_date = $1::date;', [previous])).rows[0]?.keys ?? []);
  const pointOf = (scopeKey: string, date: string | null): TtmTrendPoint | null => {
    const values = date ? valueAt.get(`${scopeKey}|${date}`) : undefined;
    return date && values ? { date, values } : null;
  };

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    // Another instance may be writing the same table: serialize the writes (transaction-scoped, pooler-safe).
    await client.query('SELECT pg_advisory_xact_lock($1)', [TREND_WRITE_LOCK_KEY]);
    await client.query('DELETE FROM ttm_dashboard_trend_cache');
    for (const { scope, scopeKey } of targets) {
      const current = valueAt.get(`${scopeKey}|${latest}`);
      const before = valueAt.get(`${scopeKey}|${previous}`);
      if (!current || !before) continue; // a scope the history does not know yet (new user): no ticker until its next day
      const newFail = failKeysOf(inScope(currentRows.rows, scope)).filter((key) => !previousFail.has(key));
      // Every chart date is kept: one without numbers is a gap in the line (TrendChartsPanel), so the 5-layer spacing holds.
      const series: TtmTrendSeriesPoint[] = seriesDates.map((date) => ({ date, values: valueAt.get(`${scopeKey}|${date}`) ?? null }));
      await client.query(
        `INSERT INTO ttm_dashboard_trend_cache (scope_key, latest_layer_date, compared_layer_date, current_values, previous_values, new_fail_epic_keys, series, week_ref, month_ref)
         VALUES ($1, $2::date, $3::date, $4::jsonb, $5::jsonb, $6::text[], $7::jsonb, $8::jsonb, $9::jsonb)`,
        [scopeKey, latest, previous, JSON.stringify(current), JSON.stringify(before), newFail, JSON.stringify(series), JSON.stringify(pointOf(scopeKey, refs.week)), JSON.stringify(pointOf(scopeKey, refs.month))],
      );
      written += 1;
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return written;
}

/** The ticker data of one scope, or null when it was never computed (or the migration is not applied yet). */
export async function getDashboardTrend(scopeKey: string): Promise<TtmDashboardTrend | null> {
  try {
    let row = (await pool.query<TtmDashboardTrend>(
      `SELECT latest_layer_date::text AS "latestLayerDate", compared_layer_date::text AS "comparedLayerDate",
              current_values AS current, previous_values AS previous, computed_at::text AS "computedAt",
              cardinality(new_fail_epic_keys) AS "newFailCount", series, week_ref AS "weekRef", month_ref AS "monthRef"
       FROM ttm_dashboard_trend_cache WHERE scope_key = $1`,
      [scopeKey],
    )).rows[0];

    // Self-heal when cache is empty or under-populated (e.g. after database restore/import)
    const needsRefresh = !row || (Boolean(row.series && row.series.length <= 1) && scopeKey === 'ALL');
    if (needsRefresh) {
      const historyCountResult = await pool.query<{ count: string }>("SELECT count(DISTINCT layer_date) AS count FROM ttm_dashboard_metric_history WHERE scope_key = 'ALL';");
      const historyCount = Number(historyCountResult.rows[0]?.count ?? 0);
      if (historyCount >= 2) {
        const written = await refreshDashboardTrendCache();
        if (written > 0) {
          row = (await pool.query<TtmDashboardTrend>(
            `SELECT latest_layer_date::text AS "latestLayerDate", compared_layer_date::text AS "comparedLayerDate",
                    current_values AS current, previous_values AS previous, computed_at::text AS "computedAt",
                    cardinality(new_fail_epic_keys) AS "newFailCount", series, week_ref AS "weekRef", month_ref AS "monthRef"
             FROM ttm_dashboard_trend_cache WHERE scope_key = $1`,
            [scopeKey],
          )).rows[0];
        }
      }
    }

    return row ?? null;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') return null;
    if (code === '42703') {
      // Migration 20261115 (series / week_ref / month_ref) not applied yet: the ticker still works without them.
      const legacy = (await pool.query<TtmDashboardTrend>(
        `SELECT latest_layer_date::text AS "latestLayerDate", compared_layer_date::text AS "comparedLayerDate",
                current_values AS current, previous_values AS previous, computed_at::text AS "computedAt",
                cardinality(new_fail_epic_keys) AS "newFailCount"
         FROM ttm_dashboard_trend_cache WHERE scope_key = $1`,
        [scopeKey],
      )).rows[0];
      return legacy ?? null;
    }
    throw error;
  }
}

/**
 * The new Fail TTM-CNTT Epics of one dashboard scope, for the Quản trị Epic drill-down (`?newFailScope=`). Null when the
 * key is not a scope key; [] when nothing was computed. Quản trị Epic still applies the viewer's own access scope on top.
 */
export async function getNewFailEpicKeys(scopeKey: string): Promise<string[] | null> {
  if (!TREND_SCOPE_KEY.test(scopeKey)) return null;
  try {
    const row = (await pool.query<{ keys: string[] }>('SELECT new_fail_epic_keys AS keys FROM ttm_dashboard_trend_cache WHERE scope_key = $1', [scopeKey])).rows[0];
    return row?.keys ?? [];
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === '42703') return []; // migration 20261113 / 20261114 not applied yet: nothing to list
    throw error;
  }
}
