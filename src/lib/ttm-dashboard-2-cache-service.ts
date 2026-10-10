import 'server-only';
import { createHash } from 'node:crypto';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import { resolveAccessScope, type AccessScope } from '@/lib/epic-alert-service';
import { getEpicAlertRowCacheMeta, queryDashboardEpicRows, rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import { getScoringEngineMode, getStoredScoringEngineMode } from '@/lib/scoring-mode-service';
import { loadDashboardEpicRows } from '@/lib/ttm-dashboard-summary-service';
import {
  buildTtmDashboard2FilterOptions,
  summarizeTtmFunnel,
  toTtmFunnelRow,
  TTM_FUNNEL_ROW_KEYS,
  type TtmDashboard2FilterOptions,
  type TtmFunnelRow,
  type TtmFunnelSummary,
} from '@/lib/ttm-funnel-summary';

/**
 * TTM Dashboard 2 cache — the unfiltered funnel numbers + toolbar filter options of one data scope
 * (table ttm_dashboard_2_cache, migration 20261004). The first load of the screen reads one small
 * row from here; only once a toolbar filter is applied does the page fetch the Epic rows
 * (loadTtmDashboard2Rows) and recompute in the browser with the same functions (ttm-funnel-summary.ts).
 *
 * Scopes (owner rule, 2026-10-04):
 *   - SUPERADMIN + SUPERVISOR → one shared entry 'ALL' (both see every Epic);
 *   - ADMIN  → 'ADMIN:<id>': projects of the Domains they manage + projects they are PM/SM of;
 *   - USER   → 'USER:<id>' : projects they are PM/SM of (+ component narrowing).
 * The scope itself always comes from resolveAccessScope — the same one Quản trị Epic uses — so the
 * drill-down lists keep matching the funnel numbers.
 *
 * Freshness: an entry is used only if it was built from the current epic_alert_row_cache
 * (source_computed_at), with the current display engine, and for the viewer's current access scope
 * (scope_fingerprint — catches user/domain/project assignment changes). Otherwise it is rebuilt on
 * the spot and stored. refreshDerivedCaches also re-warms every ALL/ADMIN/USER entry after each
 * cache rebuild (import, daily refresh, scope/domain save), so most first loads are hits.
 */

export type TtmDashboard2CacheStatus = 'HIT' | 'MISS' | 'LIVE';

export interface TtmDashboard2Snapshot {
  cache: { computedAt: string | null; scopeKey: string; status: TtmDashboard2CacheStatus };
  filterOptions: TtmDashboard2FilterOptions;
  summary: TtmFunnelSummary;
}

interface CachedPayload {
  filterOptions: TtmDashboard2FilterOptions;
  summary: TtmFunnelSummary;
  /** PAYLOAD_VERSION the entry was built with — an entry of another version is rebuilt. */
  version?: number;
}

/** Bump whenever the meaning/shape of TtmFunnelSummary changes, so entries cached by older code are
 * not served. 2 = funnel limited to "Phạm vi dữ liệu cho TTM" (criteria L01…L05bb, 2026-10-04);
 * 3 = + insights (widget row, breakdown matrix, pie charts); 4 = matrix: "Sai lệch dữ liệu" counted on
 * its own (TtmBreakdownItem.anomaly), no longer inside "đúng tiến độ"; 5 = TTM-E2E ring = Đạt / (Đạt + Fail);
 * 6 = L02 also drops "Epic ngoại lệ" and non-TTM-project Epics (buckets BLACK_LISTED / PROJECT_NON_TTM);
 * 7 = PM/SM breakdown: one row per PM/SM name (an Epic with several PM/SMs counts under each);
 * 8 = "Chưa gán Domain" / "Chưa gán PM/SM" rows carry their project keys (TtmBreakdownItem.linkProjects);
 * 9 = the operational widgets (Cảnh báo, Sai lệch, Chờ / Giải trình golive) leave out "Epic ngoại lệ" too;
 * 10 = widget Fail TTM-CNTT shows subtitle with missingFailReason count & link. */
const PAYLOAD_VERSION = 10;

const ALL_SCOPE: AccessScope = { accessRole: 'CBQL_PHONG', projectComponents: new Map(), sourceProjectKeys: null };

export function ttmDashboard2ScopeKey(userId: number, role: UserRole): string {
  if (role === 'SUPERADMIN' || role === 'SUPERVISOR') return 'ALL';
  return role === 'ADMIN' ? `ADMIN:${userId}` : `USER:${userId}`;
}

function scopeFingerprint(scope: AccessScope): string {
  const canonical = JSON.stringify({
    components: [...scope.projectComponents].map(([projectKey, components]) => [projectKey, [...components].sort()]).sort(),
    projects: scope.sourceProjectKeys === null ? null : [...scope.sourceProjectKeys].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 40);
}

function buildPayload(rows: readonly TtmFunnelRow[]): CachedPayload {
  return { filterOptions: buildTtmDashboard2FilterOptions(rows), summary: summarizeTtmFunnel(rows), version: PAYLOAD_VERSION };
}

const UPSERT_SQL = `
  INSERT INTO ttm_dashboard_2_cache (scope_key, scope_fingerprint, source_computed_at, engine_mode, summary, computed_at)
  VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
  ON CONFLICT (scope_key) DO UPDATE SET
    scope_fingerprint = EXCLUDED.scope_fingerprint, source_computed_at = EXCLUDED.source_computed_at,
    engine_mode = EXCLUDED.engine_mode, summary = EXCLUDED.summary, computed_at = EXCLUDED.computed_at
`;

/** The funnel rows of a viewer's scope, Cancelled included (the page filters them itself). */
export async function loadTtmDashboard2Rows(userId: number, role: UserRole): Promise<TtmFunnelRow[]> {
  const { rows } = await loadDashboardEpicRows(userId, role, { includeCancelled: true });
  return rows.map(toTtmFunnelRow);
}

export async function getTtmDashboard2Snapshot(userId: number, role: UserRole): Promise<TtmDashboard2Snapshot> {
  const scopeKey = ttmDashboard2ScopeKey(userId, role);
  const [engineMode, storedMode, cacheMeta] = await Promise.all([getScoringEngineMode(), getStoredScoringEngineMode(), getEpicAlertRowCacheMeta()]);

  // A per-machine SCORING_ENGINE_MODE override (or no row cache yet) is served live, never cached —
  // same rule as every other reader of the shared caches.
  if (!cacheMeta.hasCache || engineMode !== storedMode) {
    const payload = buildPayload(await loadTtmDashboard2Rows(userId, role));
    return { ...payload, cache: { computedAt: null, scopeKey, status: 'LIVE' } };
  }

  const scope = scopeKey === 'ALL' ? ALL_SCOPE : await resolveAccessScope(userId, role);
  const fingerprint = scopeFingerprint(scope);
  try {
    const cached = await pool.query<{ computedAt: string; summary: CachedPayload }>(
      `SELECT summary, computed_at::text AS "computedAt" FROM ttm_dashboard_2_cache
       WHERE scope_key = $1 AND scope_fingerprint = $2 AND source_computed_at = $3 AND engine_mode = $4`,
      [scopeKey, fingerprint, cacheMeta.computedAt, storedMode],
    );
    const hit = cached.rows[0];
    if (hit && hit.summary.version === PAYLOAD_VERSION) {
      return { filterOptions: hit.summary.filterOptions, summary: hit.summary.summary, cache: { computedAt: hit.computedAt, scopeKey, status: 'HIT' } };
    }
  } catch (error: unknown) {
    // e.g. the migration hasn't reached this database yet — still serve the screen, just uncached.
    console.error('TTM Dashboard 2 cache read failed:', error);
  }

  const rows = (await queryDashboardEpicRows(scope, { includeCancelled: true })).map(toTtmFunnelRow);
  const payload = buildPayload(rows);
  const stored = await pool.query<{ computedAt: string }>(
    `${UPSERT_SQL} RETURNING computed_at::text AS "computedAt"`,
    [scopeKey, fingerprint, cacheMeta.computedAt, storedMode, JSON.stringify(payload)],
  ).catch((error: unknown) => {
    console.error('TTM Dashboard 2 cache write failed:', error);
    return null;
  });
  return { ...payload, cache: { computedAt: stored?.rows[0]?.computedAt ?? null, scopeKey, status: 'MISS' } };
}

/**
 * Rebuilds every ALL / ADMIN:<id> / USER:<id> entry off ONE read of epic_alert_row_cache (called by
 * refreshDerivedCaches right after that cache is rebuilt). Entries for anything else (e.g. a
 * previewed Admin/Supervisor, scoped as USER) are dropped and rebuilt on demand. Returns the number
 * of entries written.
 */
export async function refreshTtmDashboard2Caches(): Promise<number> {
  const [cacheMeta, storedMode] = await Promise.all([getEpicAlertRowCacheMeta(), getStoredScoringEngineMode()]);
  if (!cacheMeta.hasCache) return 0;

  const fieldsSql = TTM_FUNNEL_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ');
  const [rowResult, userResult] = await Promise.all([
    pool.query<{ components: string[] | null; projectKey: string; row: TtmFunnelRow }>(
      `SELECT project_key AS "projectKey", components, jsonb_build_object(${fieldsSql}) AS row FROM epic_alert_row_cache`,
    ),
    pool.query<{ id: number; role: UserRole }>("SELECT id, role FROM users WHERE is_active AND role IN ('ADMIN', 'USER') ORDER BY id"),
  ]);

  const targets: { scope: AccessScope; scopeKey: string }[] = [{ scope: ALL_SCOPE, scopeKey: 'ALL' }];
  // Sequential on purpose: hosted connection caps are low (see db.ts).
  for (const user of userResult.rows) {
    targets.push({ scope: await resolveAccessScope(user.id, user.role), scopeKey: ttmDashboard2ScopeKey(user.id, user.role) });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ttm_dashboard_2_cache');
    for (const { scope, scopeKey } of targets) {
      const rows = rowResult.rows.filter((item) => rowInAccessScope(scope, item.projectKey, item.components)).map((item) => item.row);
      await client.query(UPSERT_SQL, [scopeKey, scopeFingerprint(scope), cacheMeta.computedAt, storedMode, JSON.stringify(buildPayload(rows))]);
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

export async function getTtmDashboard2CacheOverview(): Promise<{ computedAt: string | null; entryCount: number }> {
  const result = await pool.query<{ computedAt: string | null; entryCount: number }>(
    'SELECT count(*)::int AS "entryCount", max(computed_at)::text AS "computedAt" FROM ttm_dashboard_2_cache',
  ).catch(() => null);
  return result?.rows[0] ?? { computedAt: null, entryCount: 0 };
}
