import 'server-only';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import { listSelectableLayerDates } from '@/lib/data-layer-retention-service';
import { resolveAccessScope, type AccessScope } from '@/lib/epic-alert-service';
import { rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-alert-rows-service';
import { ttmDashboard2ScopeKey } from '@/lib/ttm-dashboard-2-cache-service';
import { isFunnelCnttFail, TREND_SCOPE_KEY, trendValuesOf, type TtmDashboardTrend, type TtmTrendValues } from '@/lib/ttm-dashboard-trend';
import { summarizeTtmFunnel, toTtmFunnelRow, TTM_FUNNEL_ROW_KEYS, type TtmFunnelRow } from '@/lib/ttm-funnel-summary';

/**
 * TTM Dashboard 2 — "So với <ngày>" ticker (owner 2026-11-03), table ttm_dashboard_trend_cache (migration 20261113).
 *
 * For every data scope the dashboard caches (ALL, each active ADMIN and USER — same targets as ttm_dashboard_2_cache), the
 * six widget numbers on the newest data layer and on the selectable layer just before it. The newest side is read off
 * epic_alert_row_cache (the very rows the dashboard shows); the past side re-judges every Epic as it stood on that date
 * with today's rules — like Quản trị Epic on an older layer — so only the data moved, not the configuration.
 * Run by refreshDerivedCaches for the daily run, a manual "Tạo lại cache" and every import (TREND_REFRESH_SOURCES).
 */

/** refreshDerivedCaches sources that also rebuild the ticker (owner decision: daily run, manual rebuild, import). */
export const TREND_REFRESH_SOURCES: ReadonlySet<string> = new Set(['daily-cache', 'recompute-cache', 'import']);

const ALL_SCOPE: AccessScope = { accessRole: 'CBQL_PHONG', projectComponents: new Map(), sourceProjectKeys: null };

type ScopedRow = { components: string[] | null; epicKey: string; projectKey: string; row: TtmFunnelRow };

function inScope(rows: readonly ScopedRow[], scope: AccessScope): ScopedRow[] {
  return rows.filter((item) => rowInAccessScope(scope, item.projectKey, item.components));
}

function valuesFor(rows: readonly ScopedRow[]): TtmTrendValues {
  return trendValuesOf(summarizeTtmFunnel(rows.map((item) => item.row)));
}

/** Epics that are Fail TTM-CNTT in `current` but were not in `previous` (sorted keys). */
function newFailKeys(current: readonly ScopedRow[], previous: readonly ScopedRow[]): string[] {
  const before = new Set(previous.filter((item) => isFunnelCnttFail(item.row)).map((item) => item.epicKey));
  return current.filter((item) => isFunnelCnttFail(item.row) && !before.has(item.epicKey)).map((item) => item.epicKey).sort();
}

/** Rebuilds every scope's entry. Returns how many were written (0 when there is no older layer to compare with). */
export async function refreshDashboardTrendCache(): Promise<number> {
  const layers = await listSelectableLayerDates(pool, 2);
  if (layers.length < 2) {
    await pool.query('DELETE FROM ttm_dashboard_trend_cache');
    return 0;
  }
  const [latestLayerDate, comparedLayerDate] = layers;

  const fieldsSql = TTM_FUNNEL_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ');
  const [currentRows, users] = await Promise.all([
    pool.query<ScopedRow>(`SELECT epic_key AS "epicKey", project_key AS "projectKey", components, jsonb_build_object(${fieldsSql}) AS row FROM epic_alert_row_cache`),
    pool.query<{ id: number; role: UserRole }>("SELECT id, role FROM users WHERE is_active AND role IN ('ADMIN', 'USER') ORDER BY id"),
  ]);
  // The past layer, company-wide, judged as of that date (same call the row cache uses for today, plus asOfDate).
  const past = await getEpicAlertRowsForDisplay(0, 'SUPERVISOR', { asOfDate: comparedLayerDate });
  const pastRows: ScopedRow[] = past.rows.map((row) => ({ components: row.components, epicKey: row.epicKey, projectKey: row.projectKey, row: toTtmFunnelRow(row) }));

  const targets: { scope: AccessScope; scopeKey: string }[] = [{ scope: ALL_SCOPE, scopeKey: 'ALL' }];
  // Sequential on purpose: hosted connection caps are low (see db.ts).
  for (const user of users.rows) targets.push({ scope: await resolveAccessScope(user.id, user.role), scopeKey: ttmDashboard2ScopeKey(user.id, user.role) });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ttm_dashboard_trend_cache');
    for (const { scope, scopeKey } of targets) {
      const current = inScope(currentRows.rows, scope);
      const previous = inScope(pastRows, scope);
      await client.query(
        `INSERT INTO ttm_dashboard_trend_cache (scope_key, latest_layer_date, compared_layer_date, current_values, previous_values, new_fail_epic_keys)
         VALUES ($1, $2::date, $3::date, $4::jsonb, $5::jsonb, $6::text[])`,
        [scopeKey, latestLayerDate, comparedLayerDate, JSON.stringify(valuesFor(current)), JSON.stringify(valuesFor(previous)), newFailKeys(current, previous)],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return targets.length;
}

/** The ticker data of one scope, or null when it was never computed (or the migration is not applied yet). */
export async function getDashboardTrend(scopeKey: string): Promise<TtmDashboardTrend | null> {
  try {
    const row = (await pool.query<TtmDashboardTrend>(
      `SELECT latest_layer_date::text AS "latestLayerDate", compared_layer_date::text AS "comparedLayerDate",
              current_values AS current, previous_values AS previous, computed_at::text AS "computedAt",
              cardinality(new_fail_epic_keys) AS "newFailCount"
       FROM ttm_dashboard_trend_cache WHERE scope_key = $1`,
      [scopeKey],
    )).rows[0];
    return row ?? null;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
}

/**
 * The new Fail TTM-CNTT Epics of one dashboard scope, for the Quản trị Epic drill-down (`?newFailScope=`). Null when the
 * key is not a scope key; [] when nothing was computed. Quản trị Epic still applies the viewer's own access scope on top.
 */
export async function getNewFailEpicKeys(scopeKey: string): Promise<string[] | null> {
  if (!TREND_SCOPE_KEY.test(scopeKey)) return null;
  const row = (await pool.query<{ keys: string[] }>('SELECT new_fail_epic_keys AS keys FROM ttm_dashboard_trend_cache WHERE scope_key = $1', [scopeKey])).rows[0];
  return row?.keys ?? [];
}
