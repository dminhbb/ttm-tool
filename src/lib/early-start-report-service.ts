import 'server-only';
import pool from '@/lib/db';
import type { AuthUser } from '@/lib/auth-types';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { buildAccessScopeClause, getEpicAlertRowCacheMeta, rowInAccessScope } from '@/lib/epic-alert-row-cache-query-service';
import { loadEpicMarkSummaries } from '@/lib/epic-mark-service';
import { scopeFingerprint, ttmDashboard2ScopeKey } from '@/lib/ttm-dashboard-2-cache-service';
import { loadScopeTargets } from '@/lib/ttm-dashboard-trend-service';
import {
  listEarlyStartFailEpics,
  summarizeEarlyStart,
  type EarlyStartFailEpic,
  type EarlyStartReportRow,
  type EarlyStartSummary,
} from '@/lib/early-start-report';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04), read off epic_alert_row_cache (newest data layer, Scoring Service rule
 * "Start sớm") within the viewer's report scope — the same scope as "Báo cáo Epic" and Quản trị Epic.
 *
 * Widgets (table ttm_early_start_cache, one entry per scope, keyed like ttm_dashboard_2_cache): written for EVERY scope by
 * each rebuild of the derived caches (refreshEarlyStartCaches — import, daily run, "Tạo lại cache"; a few milliseconds of
 * work on rows already read) and only read by the report and by the header widget "TTM-CNTT (SỚM)" (TTM Dashboard 2,
 * Quản trị Epic). A visit that finds no valid entry (the Epic row cache was rebuilt since, the viewer's access scope
 * changed, a user created after the last rebuild) still builds it on the spot — otherwise the widgets would disagree with
 * the table below them, which is read live. The header widget never builds one.
 *
 * The table: only the Epics carrying REC_EARLY_START are read (GIN index on badge_codes), so it is not cached; Review
 * Notes (column Review) are the viewer's live ones.
 */

export type EarlyStartCacheStatus = 'HIT' | 'MISS' | 'LIVE';

export interface EarlyStartSummarySnapshot extends EarlyStartSummary {
  /** Vietnam date the entry belongs to, and when it was built. */
  cacheDate: string | null;
  computedAt: string | null;
  status: EarlyStartCacheStatus;
}

interface CachedPayload extends EarlyStartSummary {
  version: number;
}

/** Bump when EarlyStartSummary changes shape, so entries of older code are rebuilt. */
const PAYLOAD_VERSION = 1;

/** row_data keys the report reads — the rest of each cached row never leaves the database. */
const EARLY_START_ROW_KEYS: readonly (keyof EarlyStartReportRow)[] = [
  'alertLevel', 'currentStatus', 'dataLayerDate', 'domainName', 'dueDate', 'epicKey', 'epicName', 'hasDataAnomaly',
  'ownerName', 'projectKey', 'r4gDate', 'ruleGroupName', 'scoringEarlyStart', 'scoringIndexFlags', 't0IdeaApprovedDate',
  't1StartDate', 'ttmBlackListed', 'ttmCnttInScope', 'ttmExclusion',
];
const ROW_SQL = `jsonb_build_object(${EARLY_START_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ')}, 'ownerNames', to_jsonb(owner_names))`;
const VN_TODAY_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

async function loadRows(user: AuthUser, options: { earlyStartOnly: boolean }): Promise<EarlyStartReportRow[]> {
  const scope = await resolveAccessScope(user.id, user.role);
  const params: unknown[] = [];
  const accessClause = buildAccessScopeClause(scope, params);
  const earlyClause = options.earlyStartOnly ? ` AND badge_codes && ARRAY['REC_EARLY_START']::text[]` : '';
  const result = await pool.query<{ row: EarlyStartReportRow }>(`SELECT ${ROW_SQL} AS row FROM epic_alert_row_cache WHERE ${accessClause}${earlyClause};`, params);
  return result.rows.map((item) => item.row);
}

/** The 4 widget numbers of the report — from today's entry of the viewer's scope (written by the cache rebuild; built here only when missing). */
export async function getEarlyStartSummary(user: AuthUser): Promise<EarlyStartSummarySnapshot> {
  const scopeKey = ttmDashboard2ScopeKey(user.id, user.role);
  const [cacheMeta, scope] = await Promise.all([getEpicAlertRowCacheMeta(), resolveAccessScope(user.id, user.role)]);
  if (!cacheMeta.hasCache) {
    return { ...summarizeEarlyStart([]), cacheDate: null, computedAt: null, status: 'LIVE' };
  }
  const fingerprint = scopeFingerprint(scope);
  try {
    const cached = await pool.query<{ cacheDate: string; computedAt: string; summary: CachedPayload }>(
      `SELECT summary, cache_date::text AS "cacheDate", computed_at::text AS "computedAt" FROM ttm_early_start_cache
       WHERE scope_key = $1 AND scope_fingerprint = $2 AND source_computed_at = $3 AND cache_date = ${VN_TODAY_SQL}`,
      [scopeKey, fingerprint, cacheMeta.computedAt],
    );
    const hit = cached.rows[0];
    if (hit && hit.summary.version === PAYLOAD_VERSION) {
      const { current, earlyStart, dataLayerDate } = hit.summary;
      return { current, earlyStart, dataLayerDate, cacheDate: hit.cacheDate, computedAt: hit.computedAt, status: 'HIT' };
    }
  } catch (error: unknown) {
    console.error('Early start report cache read failed:', error);
  }

  const summary = summarizeEarlyStart(await loadRows(user, { earlyStartOnly: false }));
  const payload: CachedPayload = { ...summary, version: PAYLOAD_VERSION };
  const stored = await pool.query<{ cacheDate: string; computedAt: string }>(`
    INSERT INTO ttm_early_start_cache (scope_key, scope_fingerprint, cache_date, source_computed_at, summary, computed_at)
    VALUES ($1, $2, ${VN_TODAY_SQL}, $3, $4::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (scope_key) DO UPDATE SET
      scope_fingerprint = EXCLUDED.scope_fingerprint, cache_date = EXCLUDED.cache_date, source_computed_at = EXCLUDED.source_computed_at,
      summary = EXCLUDED.summary, computed_at = EXCLUDED.computed_at
    RETURNING cache_date::text AS "cacheDate", computed_at::text AS "computedAt"
  `, [scopeKey, fingerprint, cacheMeta.computedAt, JSON.stringify(payload)]).catch((error: unknown) => {
    console.error('Early start report cache write failed:', error);
    return null;
  });
  return { ...summary, cacheDate: stored?.rows[0]?.cacheDate ?? null, computedAt: stored?.rows[0]?.computedAt ?? null, status: 'MISS' };
}

/**
 * Writes the report's widget numbers of EVERY scope (the company, each active ADMIN and USER — the keys of
 * ttm_dashboard_2_cache) from one read of epic_alert_row_cache; called by every rebuild of the derived caches, so the
 * header widget "TTM-CNTT (SỚM)" and the report open on numbers of the current data layer without anyone having to
 * visit the report first. Returns how many entries were written.
 */
export async function refreshEarlyStartCaches(): Promise<number> {
  const cacheMeta = await getEpicAlertRowCacheMeta();
  if (!cacheMeta.hasCache) return 0;
  const result = await pool.query<{ components: string[] | null; projectKey: string; row: EarlyStartReportRow }>(
    `SELECT project_key AS "projectKey", components, ${ROW_SQL} AS row FROM epic_alert_row_cache;`,
  );
  const targets = await loadScopeTargets();
  const keys: string[] = [];
  const fingerprints: string[] = [];
  const payloads: string[] = [];
  for (const { scope, scopeKey } of targets) {
    const rows = result.rows.filter((item) => rowInAccessScope(scope, item.projectKey, item.components)).map((item) => item.row);
    const payload: CachedPayload = { ...summarizeEarlyStart(rows), version: PAYLOAD_VERSION };
    keys.push(scopeKey);
    fingerprints.push(scopeFingerprint(scope));
    payloads.push(JSON.stringify(payload));
  }
  await pool.query(`
    INSERT INTO ttm_early_start_cache (scope_key, scope_fingerprint, cache_date, source_computed_at, summary, computed_at)
    SELECT t.scope_key, t.scope_fingerprint, ${VN_TODAY_SQL}, $4::timestamptz, t.summary::jsonb, CURRENT_TIMESTAMP
    FROM unnest($1::text[], $2::text[], $3::text[]) AS t(scope_key, scope_fingerprint, summary)
    ON CONFLICT (scope_key) DO UPDATE SET
      scope_fingerprint = EXCLUDED.scope_fingerprint, cache_date = EXCLUDED.cache_date, source_computed_at = EXCLUDED.source_computed_at,
      summary = EXCLUDED.summary, computed_at = EXCLUDED.computed_at;
  `, [keys, fingerprints, payloads, cacheMeta.computedAt]);
  return targets.length;
}

/** Header widget "TTM-CNTT (SỚM)": the newest entry of the viewer's scope, whatever its date; null when there is none yet. */
export async function getLatestEarlyStartSummary(user: AuthUser): Promise<EarlyStartSummarySnapshot | null> {
  const result = await pool.query<{ cacheDate: string; computedAt: string; summary: CachedPayload }>(
    'SELECT summary, cache_date::text AS "cacheDate", computed_at::text AS "computedAt" FROM ttm_early_start_cache WHERE scope_key = $1',
    [ttmDashboard2ScopeKey(user.id, user.role)],
  );
  const hit = result.rows[0];
  if (!hit || hit.summary.version !== PAYLOAD_VERSION) return null;
  const { current, earlyStart, dataLayerDate } = hit.summary;
  return { current, earlyStart, dataLayerDate, cacheDate: hit.cacheDate, computedAt: hit.computedAt, status: 'HIT' };
}

/** The table: "Start sớm" Epics that fail from their real start date, with the viewer's Review Notes. */
export async function getEarlyStartFailEpics(user: AuthUser): Promise<EarlyStartFailEpic[]> {
  const epics = listEarlyStartFailEpics(await loadRows(user, { earlyStartOnly: true }));
  if (!epics.length) return epics;
  const marks = await loadEpicMarkSummaries(epics.map((epic) => epic.epicKey), user.id);
  return epics.map((epic) => ({ ...epic, mark: marks.get(epic.epicKey) }));
}

export interface EarlyStartReportPage {
  summary: EarlyStartSummarySnapshot;
  failedEpics: EarlyStartFailEpic[];
  /** Newest import ("Dữ liệu cập nhật lần cuối" under the table, as on Quản trị Epic). */
  lastAggregatedAt: string | null;
}

export async function getEarlyStartReportPage(user: AuthUser): Promise<EarlyStartReportPage> {
  // Sequential on purpose: hosted connection caps are low (see db.ts).
  const summary = await getEarlyStartSummary(user);
  const failedEpics = await getEarlyStartFailEpics(user);
  const latest = await pool.query<{ aggregatedAt: string | null }>('SELECT MAX(aggregated_at)::text AS "aggregatedAt" FROM import_batches');
  return { summary, failedEpics, lastAggregatedAt: latest.rows[0]?.aggregatedAt ?? null };
}
