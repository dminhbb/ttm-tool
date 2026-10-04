import pool from '@/lib/db';
import type { AccessScope } from '@/lib/epic-alert-service';
import { DASHBOARD_EPIC_ROW_KEYS } from '@/lib/epic-alert-types';
import { LIST_GROUP_RANK_SQL } from '@/lib/epic-alert-sort-rules';
import type { DashboardEpicRow, EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { summarizeTtmCnttFromCounts } from '@/lib/ttm-cntt-qa';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { FILTER_PRESETS } from '@/lib/scoring/select';
import type { ScoringEngineMode } from '@/lib/scoring-mode-service';

/**
 * Server-side filter/sort/pagination reads for "Quản trị Epic" (đầy đủ), backed by
 * epic_alert_row_cache (see epic-alert-row-cache-service.ts) instead of recomputing every Epic's
 * alertLevel/stages/etc. on every page view. Only serves the default (newest layer, no advanced
 * date filter) view — the API route falls back to the live getEpicAlertRowsPhased path whenever a
 * layer window or an advanced date filter (createdDateFrom/startDateFrom/dueDateFrom) is active,
 * since those change which Epics are even in scope (a SQL WHERE on `issues`, upstream of this
 * cache) rather than just how the same Epic set is filtered/sorted/paginated.
 */
export interface EpicAlertRowCacheFilters {
  projectKeys?: string[];
  pmSm?: string[];
  components?: string[];
  /** "Nhận xét" — several values match an Epic that matches ANY of them. */
  alertFilters?: string[];
  epicTypes?: string[];
  statuses?: string[];
  dataIssueOnly?: boolean;
  requestingUnits?: string[];
  search?: string;
  /** 'scoring' → the "Nhận xét" filter matches badge_codes (Epic Scoring Service) instead of
   * re-deriving each verdict from the legacy columns. */
  engineMode?: ScoringEngineMode;
}

export interface EpicAlertRowCachePage {
  rows: EpicAlertRowPhased[];
  totalCount: number;
  computedAt: string | null;
  sourceImportBatchId: number | null;
}

export interface EpicAlertStatCounts {
  dataIssue: number;
  failCntt: number;
  failE2e: number;
  late: number;
  pending: number;
  todo: number;
}

interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Reproduces resolveAccessScope's project/component narrowing as a SQL predicate — a project
 * granted without component narrowing matches on project_key alone; a project narrowed to specific
 * components (PM/SM only) also requires components && the granted list. */
function buildAccessScopeClause(scope: AccessScope, params: unknown[]): string {
  if (scope.sourceProjectKeys === null) return 'TRUE';
  if (scope.sourceProjectKeys.length === 0) return 'FALSE';
  const clauses: string[] = [];
  for (const projectKey of scope.sourceProjectKeys) {
    const narrowedComponents = scope.projectComponents.get(projectKey);
    if (narrowedComponents && narrowedComponents.length > 0) {
      params.push(projectKey, narrowedComponents);
      clauses.push(`(project_key = $${params.length - 1} AND components && $${params.length}::text[])`);
    } else {
      params.push(projectKey);
      clauses.push(`project_key = $${params.length}`);
    }
  }
  return `(${clauses.join(' OR ')})`;
}

/** In-memory twin of buildAccessScopeClause, for code that already holds the rows (the TTM
 * Dashboard 2 cache builds every scope off one read of the table). Keep the two in sync. */
export function rowInAccessScope(scope: AccessScope, projectKey: string, components: readonly string[] | null): boolean {
  if (scope.sourceProjectKeys === null) return true;
  if (!scope.sourceProjectKeys.includes(projectKey)) return false;
  const narrowedComponents = scope.projectComponents.get(projectKey);
  if (!narrowedComponents || narrowedComponents.length === 0) return true;
  return (components ?? []).some((component) => narrowedComponents.includes(component));
}

/** Everything from EpicAlertRowCacheFilters except pagination — shared by the page query, its
 * COUNT, and the stat-widget aggregate, all of which must agree on exactly the same row set. */
function buildFilterClause(scope: AccessScope, filters: EpicAlertRowCacheFilters): WhereClause {
  const params: unknown[] = [];
  const clauses: string[] = [buildAccessScopeClause(scope, params)];

  if (filters.projectKeys && filters.projectKeys.length > 0) {
    params.push(filters.projectKeys);
    clauses.push(`project_key = ANY($${params.length}::text[])`);
  }
  if (filters.pmSm && filters.pmSm.length > 0) {
    params.push(filters.pmSm);
    clauses.push(`owner_names && $${params.length}::text[]`);
  }
  if (filters.components && filters.components.length > 0) {
    params.push(filters.components);
    clauses.push(`components && $${params.length}::text[]`);
  }
  if (filters.epicTypes && filters.epicTypes.length > 0) {
    params.push(filters.epicTypes);
    clauses.push(`epic_type = ANY($${params.length}::text[])`);
  }
  if (filters.statuses && filters.statuses.length > 0) {
    params.push(filters.statuses);
    clauses.push(`current_status = ANY($${params.length}::text[])`);
  } else {
    clauses.push(`current_status !~* 'cancel'`);
  }
  if (filters.dataIssueOnly) {
    clauses.push('has_data_anomaly = TRUE');
  }
  if (filters.requestingUnits && filters.requestingUnits.length > 0) {
    params.push(filters.requestingUnits);
    clauses.push(`requesting_unit = ANY($${params.length}::text[])`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(epic_key ILIKE $${params.length} OR epic_name ILIKE $${params.length})`);
  }
  const alertClauses = (filters.alertFilters ?? [])
    .map((alertFilter) => buildFieldFilterClause(alertFilter, filters.engineMode)
      ?? (filters.engineMode === 'scoring' ? buildBadgeFilterClause(alertFilter, params) : buildAlertFilterClause(alertFilter, params)))
    .filter((clause): clause is string => Boolean(clause));
  if (alertClauses.length > 0) clauses.push(`(${alertClauses.map((clause) => `(${clause})`).join(' OR ')})`);

  return { sql: clauses.join(' AND '), params };
}

/** Vietnam calendar date as "YYYY-MM-DD" text — comparable with the ISO date strings in row_data. */
const VN_TODAY_TEXT_SQL = "to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')";

/**
 * TTM Dashboard sub-link filters (2026-10-01) — plain field checks, same for both engines except
 * where "Chờ golive" is read (badge in scoring, releaseAxisState in legacy). Mirrors the first
 * switch in matchesAlertFilter / waitingGoliveBucket (epic-row-verdicts.ts) exactly; returns null
 * for every other filter value so the engine-specific builders handle those.
 */
function buildFieldFilterClause(alertFilter: string | undefined, engineMode: ScoringEngineMode | undefined): string | null {
  const hasR4g = "(row_data->>'r4gDate') IS NOT NULL";
  const waiting = engineMode === 'scoring' ? "badge_codes @> ARRAY['RELEASE_WAITING_GOLIVE']" : "row_data->>'releaseAxisState' = 'WAITING_GOLIVE'";
  const withinGrace = `(row_data->>'releaseGraceDeadline') IS NOT NULL AND ${VN_TODAY_TEXT_SQL} <= (row_data->>'releaseGraceDeadline')`;
  switch (alertFilter) {
    case 'FAIL_LATE_R4G': return `ttm_cntt_in_scope AND alert_level = 'FAIL' AND ${hasR4g}`;
    case 'FAIL_MISSING_R4G': return `ttm_cntt_in_scope AND alert_level = 'FAIL' AND NOT ${hasR4g}`;
    case 'DATA_ANOMALY_IN_SCOPE': return 'ttm_cntt_in_scope AND has_data_anomaly';
    case 'MISSING_R4G_IN_SCOPE': return `ttm_cntt_in_scope AND NOT has_data_anomaly AND NOT ${hasR4g}`;
    case 'TTM_ELIGIBLE_IN_SCOPE': return `ttm_cntt_in_scope AND ${hasR4g} AND NOT has_data_anomaly`;
    case 'WAITING_GOLIVE_MISSING_R4G': return `${waiting} AND NOT ${hasR4g}`;
    case 'WAITING_GOLIVE_WITHIN_GRACE': return `${waiting} AND ${hasR4g} AND (${withinGrace})`;
    case 'WAITING_GOLIVE_OVERDUE': return `${waiting} AND ${hasR4g} AND NOT (${withinGrace})`;
    default: break;
  }
  // TTM Dashboard 2 funnel leaves — SQL twin of ttmFunnelBucket (epic-row-verdicts.ts), which also
  // excludes Cancelled rows on its own (not just via the default status filter).
  const clean = "current_status !~* 'cancel' AND NOT has_data_anomaly";
  const inScopeR4g = `${clean} AND ttm_cntt_in_scope AND ${hasR4g}`;
  const inScopeNoR4g = `${clean} AND ttm_cntt_in_scope AND NOT ${hasR4g}`;
  // isTtmIndexPass: the TTM_PASS index flag in scoring, alertLevel NONE in legacy.
  const pass = engineMode === 'scoring' ? "index_flags @> ARRAY['TTM_PASS']" : "alert_level = 'NONE'";
  switch (alertFilter) {
    case 'TTM_PASS_IN_SCOPE': return `${inScopeR4g} AND ${pass}`;
    case 'TTM_LATE_IN_SCOPE': return `${inScopeR4g} AND NOT (${pass}) AND alert_level = 'FAIL'`;
    case 'TTM_NOT_SCORED_IN_SCOPE': return `${inScopeR4g} AND NOT (${pass}) AND alert_level IS DISTINCT FROM 'FAIL'`;
    case 'OVERDUE_MISSING_R4G_IN_SCOPE': return `${inScopeNoR4g} AND alert_level = 'FAIL'`;
    case 'WITHIN_TARGET_MISSING_R4G': return `${inScopeNoR4g} AND alert_level IS DISTINCT FROM 'FAIL'`;
    case 'OUT_OF_SCOPE_NO_ANOMALY': return `${clean} AND NOT ttm_cntt_in_scope`;
    default: return null;
  }
}

/** Scoring engine: a "Nhận xét" filter value is a set of badge codes (FILTER_PRESETS); a value with
 * no preset (e.g. the removed "Cảnh báo sớm") matches nothing. */
function buildBadgeFilterClause(alertFilter: string | undefined, params: unknown[]): string | null {
  if (!alertFilter) return null;
  const badges = FILTER_PRESETS[alertFilter];
  if (!badges?.length) return 'FALSE';
  params.push([...badges]);
  return `badge_codes && $${params.length}::text[]`;
}

/** Mirrors matchesAlertFilter in epic-alerts-15/page.tsx exactly — see that function's doc comment
 * for what each sentinel means. bottom_status_rank = 3 is exactly normalizeEpicWorkflowStatus ===
 * 'RELEASED' (see epic-alert-sort-rules.ts), reused here instead of a second status check. */
function buildAlertFilterClause(alertFilter: string | undefined, params: unknown[]): string | null {
  switch (alertFilter) {
    case undefined:
    case '':
      return null;
    case 'FAIL_E2E':
      return "ttm_e2e_alert_level = 'FAIL'";
    case 'ACHIEVED_CNTT':
      return "ttm_cntt_in_scope AND alert_level = 'NONE' AND (row_data->>'r4gDate') IS NOT NULL AND (row_data->>'ttmCnttStatusMismatch')::boolean = FALSE AND row_data->>'ttmActualToDate' = row_data->>'r4gDate'";
    case 'ACHIEVED_E2E':
      return "ttm_e2e_alert_level = 'NONE' AND bottom_status_rank = 3 AND (row_data->>'r4gDate') IS NOT NULL AND row_data->>'ttmE2eActualToDate' = row_data->>'r4gDate'";
    case 'STATUS_MISMATCH':
      return "ttm_cntt_in_scope AND (row_data->>'ttmCnttStatusMismatch')::boolean = TRUE";
    case 'DATA_ANOMALY':
      return 'has_data_anomaly = TRUE';
    case 'OUT_OF_SCOPE_CNTT':
      return 'NOT ttm_cntt_in_scope';
    case 'WAITING_GOLIVE':
      return "row_data->>'releaseAxisState' = 'WAITING_GOLIVE'";
    case 'RELEASE_EARLY':
      return "row_data->>'releaseAxisState' = 'EARLY_WARNING'";
    case 'JUSTIFY_GOLIVE':
      return "row_data->>'releaseAxisState' = 'JUSTIFY_GOLIVE'";
    default:
      // FAIL/LATE/EARLY/NONE — every one of them is a TTM-CNTT-axis label, so an out-of-scope row
      // (whose Nhận xét cell shows "Ngoài phạm vi TTM-CNTT" instead, see ttm-scope-rules.ts) must
      // never match any of them here either.
      params.push(alertFilter);
      return `ttm_cntt_in_scope AND alert_level = $${params.length}`;
  }
}

const ORDER_BY = `${LIST_GROUP_RANK_SQL} ASC, has_data_anomaly ASC, alert_rank ASC, remaining_working_days_rank ASC, epic_key ASC`;

export async function queryEpicAlertRowCachePage(
  scope: AccessScope,
  filters: EpicAlertRowCacheFilters,
  page: number,
  pageSize: number,
): Promise<EpicAlertRowCachePage> {
  const { sql: whereSql, params } = buildFilterClause(scope, filters);
  const countResult = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM epic_alert_row_cache WHERE ${whereSql};`, params);
  const totalCount = Number(countResult.rows[0]?.n ?? 0);

  const pageParams = [...params, pageSize, (Math.max(1, page) - 1) * pageSize];
  const rowsResult = await pool.query<{ rowData: EpicAlertRowPhased; computedAt: string; sourceImportBatchId: number | null }>(
    `
    SELECT row_data AS "rowData", computed_at::text AS "computedAt", source_import_batch_id AS "sourceImportBatchId"
    FROM epic_alert_row_cache
    WHERE ${whereSql}
    ORDER BY ${ORDER_BY}
    LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length};
    `,
    pageParams,
  );

  return {
    rows: rowsResult.rows.map((row) => row.rowData),
    totalCount,
    computedAt: rowsResult.rows[0]?.computedAt ?? null,
    sourceImportBatchId: rowsResult.rows[0]?.sourceImportBatchId ?? null,
  };
}

/** statCounts widgets — computed over the filtered set (same WHERE as the page query), not just
 * the current page, matching the client's previous filteredRows-based computation exactly. */
export async function queryEpicAlertStatCounts(scope: AccessScope, filters: EpicAlertRowCacheFilters): Promise<EpicAlertStatCounts> {
  const { sql: whereSql, params } = buildFilterClause(scope, filters);
  const result = await pool.query<{
    dataIssue: string; failCntt: string; failE2e: string; late: string; pending: string; todo: string;
  }>(
    `
    SELECT
      count(*) FILTER (WHERE has_data_anomaly)::text AS "dataIssue",
      count(*) FILTER (WHERE ttm_cntt_in_scope AND alert_level = 'FAIL')::text AS "failCntt",
      count(*) FILTER (WHERE ttm_e2e_alert_level = 'FAIL')::text AS "failE2e",
      count(*) FILTER (WHERE ttm_cntt_in_scope AND alert_level = 'LATE')::text AS "late",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) = 'PENDING')::text AS "pending",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) = 'TO DO')::text AS "todo"
    FROM epic_alert_row_cache WHERE ${whereSql};
    `,
    params,
  );
  const row = result.rows[0];
  return {
    dataIssue: Number(row?.dataIssue ?? 0),
    failCntt: Number(row?.failCntt ?? 0),
    failE2e: Number(row?.failE2e ?? 0),
    late: Number(row?.late ?? 0),
    pending: Number(row?.pending ?? 0),
    todo: Number(row?.todo ?? 0),
  };
}

/** TTM-CNTT (QLDA) / TTM-CNTT (QA) over exactly the Epic set the "Quản trị Epic" table is showing —
 * same WHERE as the page query (access scope + every toolbar filter), so the header badges move
 * with the table's data scope instead of staying fixed to the viewer's whole permitted scope. Same
 * ratio as summarizeTtmCntt/summarizeQaIndex (ttm-cntt-qa.ts), computed as a SQL aggregate instead
 * of hydrating rows into JS. Cancelled Epics never count, even when the Status filter includes them. */
export async function queryTtmCnttIndexes(scope: AccessScope, filters: EpicAlertRowCacheFilters): Promise<{ ttm: TtmCnttSummary; qa: TtmCnttSummary }> {
  const { sql: accessClause, params } = buildFilterClause(scope, filters);
  if (filters.engineMode === 'scoring') return queryScoringIndexPm(accessClause, params);
  const result = await pool.query<{
    ttmFail: string; ttmEligible: string; ttmPass: string; ttmTotal: string;
    qaFail: string; qaEligible: string; qaPass: string; qaTotal: string;
  }>(
    `
    SELECT
      count(*) FILTER (WHERE ttm_cntt_in_scope AND alert_level = 'FAIL')::text AS "ttmFail",
      count(*) FILTER (WHERE ttm_cntt_in_scope AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly)::text AS "ttmEligible",
      count(*) FILTER (WHERE ttm_cntt_in_scope AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly AND alert_level = 'NONE')::text AS "ttmPass",
      count(*) FILTER (WHERE ttm_cntt_in_scope)::text AS "ttmTotal",
      count(*) FILTER (WHERE qa_in_scope AND UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND alert_level = 'FAIL')::text AS "qaFail",
      count(*) FILTER (WHERE qa_in_scope AND UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly)::text AS "qaEligible",
      count(*) FILTER (WHERE qa_in_scope AND UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly AND alert_level = 'NONE')::text AS "qaPass",
      count(*) FILTER (WHERE qa_in_scope AND UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED'))::text AS "qaTotal"
    FROM epic_alert_row_cache WHERE ${accessClause} AND current_status !~* 'cancel';
    `,
    params,
  );
  const row = result.rows[0];
  return {
    ttm: summarizeTtmCnttFromCounts(Number(row?.ttmEligible ?? 0), Number(row?.ttmPass ?? 0), Number(row?.ttmFail ?? 0), Number(row?.ttmTotal ?? 0)),
    qa: summarizeTtmCnttFromCounts(Number(row?.qaEligible ?? 0), Number(row?.qaPass ?? 0), Number(row?.qaFail ?? 0), Number(row?.qaTotal ?? 0)),
  };
}

/** Scoring engine: TTM-/QA-Index counts straight from each Epic's index_flags (scoring/select.ts
 * indexFlagsOf) — "Đạt" is exactly the "Đạt TTM-CNTT" badge (decision D1). */
async function queryScoringIndexPm(accessClause: string, params: unknown[]): Promise<{ ttm: TtmCnttSummary; qa: TtmCnttSummary }> {
  const count = (flag: string) => `count(*) FILTER (WHERE index_flags @> ARRAY['${flag}'])::text AS "${flag}"`;
  const flags = ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS', 'TTM_FAIL', 'QA_COUNTED', 'QA_ELIGIBLE', 'QA_PASS', 'QA_FAIL'];
  const result = await pool.query<Record<string, string>>(`SELECT ${flags.map(count).join(', ')} FROM epic_alert_row_cache WHERE ${accessClause};`, params);
  const row = result.rows[0] ?? {};
  const n = (flag: string) => Number(row[flag] ?? 0);
  return {
    ttm: summarizeTtmCnttFromCounts(n('TTM_ELIGIBLE'), n('TTM_PASS'), n('TTM_FAIL'), n('TTM_COUNTED')),
    qa: summarizeTtmCnttFromCounts(n('QA_ELIGIBLE'), n('QA_PASS'), n('QA_FAIL'), n('QA_COUNTED')),
  };
}

export interface EpicAlertFilterOptions {
  domainProjectKeys: Record<string, string[]>;
  pmSmNames: string[];
  projectKeys: string[];
  requestingUnits: string[];
  statuses: string[];
}

/** Distinct values for every toolbar filter dropdown (Project/PM-SM/Status/Requesting Unit/Domain),
 * over the viewer's FULL access scope — not just whatever page is currently on screen. Needed
 * because the paged query (queryEpicAlertRowCachePage) only ever returns one page of rows, unlike
 * the old client-side-everything model where the dropdowns could just read straight off `rows`. */
export async function queryEpicAlertFilterOptions(scope: AccessScope): Promise<EpicAlertFilterOptions> {
  const params: unknown[] = [];
  const accessClause = buildAccessScopeClause(scope, params);
  const result = await pool.query<{
    projectKey: string; status: string; requestingUnit: string | null; domainName: string | null; ownerNames: string[];
  }>(
    `SELECT project_key AS "projectKey", current_status AS status, requesting_unit AS "requestingUnit", row_data->>'domainName' AS "domainName", owner_names AS "ownerNames" FROM epic_alert_row_cache WHERE ${accessClause};`,
    params,
  );
  const projectKeys = new Set<string>();
  const pmSmNames = new Set<string>();
  const statuses = new Set<string>();
  const requestingUnits = new Set<string>();
  const domainProjectKeys: Record<string, Set<string>> = {};
  for (const row of result.rows) {
    if (row.projectKey) projectKeys.add(row.projectKey);
    if (row.status) statuses.add(row.status);
    if (row.requestingUnit) requestingUnits.add(row.requestingUnit);
    for (const name of row.ownerNames ?? []) pmSmNames.add(name);
    if (row.domainName && row.projectKey) {
      (domainProjectKeys[row.domainName] ??= new Set()).add(row.projectKey);
    }
  }
  return {
    domainProjectKeys: Object.fromEntries(Object.entries(domainProjectKeys).map(([domain, keys]) => [domain, [...keys].sort()])),
    pmSmNames: [...pmSmNames].sort((a, b) => a.localeCompare(b, 'vi')),
    projectKeys: [...projectKeys].sort(),
    requestingUnits: [...requestingUnits].sort((a, b) => a.localeCompare(b, 'vi')),
    statuses: [...statuses].sort(),
  };
}

/** TTM Dashboard's full row set — every non-cancelled Epic in the viewer's access scope (the
 * dashboard drops Cancelled everywhere, and filters/aggregates the rest client-side), already
 * slimmed to DashboardEpicRow in SQL so the unused bulk of row_data never leaves the database. */
export async function queryDashboardEpicRows(scope: AccessScope, options: { includeCancelled?: boolean } = {}): Promise<DashboardEpicRow[]> {
  const params: unknown[] = [];
  const accessClause = buildAccessScopeClause(scope, params);
  const fieldsSql = DASHBOARD_EPIC_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ');
  const result = await pool.query<{ row: DashboardEpicRow }>(
    `
    SELECT jsonb_build_object(
      ${fieldsSql},
      'stages', jsonb_build_object(
        'design', jsonb_build_object('isCurrentStage', row_data#>'{stages,design,isCurrentStage}'),
        'r4golive', jsonb_build_object('isCurrentStage', row_data#>'{stages,r4golive,isCurrentStage}'),
        'release', jsonb_build_object('isDone', row_data#>'{stages,release,isDone}')
      )
    ) AS row
    FROM epic_alert_row_cache
    WHERE ${accessClause}${options.includeCancelled ? '' : " AND current_status !~* 'cancel'"}
    ORDER BY ${ORDER_BY};
    `,
    params,
  );
  return result.rows.map((row) => row.row);
}

export async function getEpicAlertRowCacheMeta(): Promise<{ computedAt: string | null; hasCache: boolean }> {
  const result = await pool.query<{ computedAt: string }>('SELECT computed_at::text AS "computedAt" FROM epic_alert_row_cache ORDER BY computed_at DESC LIMIT 1;');
  return { computedAt: result.rows[0]?.computedAt ?? null, hasCache: result.rows.length > 0 };
}
