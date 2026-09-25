import pool from '@/lib/db';
import type { AccessScope } from '@/lib/epic-alert-service';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { summarizeTtmCnttFromCounts } from '@/lib/ttm-cntt-qa';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';

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
  pmSm?: string;
  components?: string[];
  alertFilter?: string;
  epicType?: string;
  statuses?: string[];
  dataIssueOnly?: boolean;
  requestingUnit?: string;
  search?: string;
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

/** Everything from EpicAlertRowCacheFilters except pagination — shared by the page query, its
 * COUNT, and the stat-widget aggregate, all of which must agree on exactly the same row set. */
function buildFilterClause(scope: AccessScope, filters: EpicAlertRowCacheFilters): WhereClause {
  const params: unknown[] = [];
  const clauses: string[] = [buildAccessScopeClause(scope, params)];

  if (filters.projectKeys && filters.projectKeys.length > 0) {
    params.push(filters.projectKeys);
    clauses.push(`project_key = ANY($${params.length}::text[])`);
  }
  if (filters.pmSm) {
    params.push(filters.pmSm);
    clauses.push(`$${params.length} = ANY(owner_names)`);
  }
  if (filters.components && filters.components.length > 0) {
    params.push(filters.components);
    clauses.push(`components && $${params.length}::text[]`);
  }
  if (filters.epicType) {
    params.push(filters.epicType);
    clauses.push(`epic_type = $${params.length}`);
  }
  if (filters.statuses && filters.statuses.length > 0) {
    params.push(filters.statuses);
    clauses.push(`current_status = ANY($${params.length}::text[])`);
  }
  if (filters.dataIssueOnly) {
    clauses.push('has_data_anomaly = TRUE');
  }
  if (filters.requestingUnit) {
    params.push(filters.requestingUnit);
    clauses.push(`requesting_unit = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(epic_key ILIKE $${params.length} OR epic_name ILIKE $${params.length})`);
  }
  const alertClause = buildAlertFilterClause(filters.alertFilter, params);
  if (alertClause) clauses.push(alertClause);

  return { sql: clauses.join(' AND '), params };
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
      return "alert_level = 'NONE' AND (row_data->>'r4gDate') IS NOT NULL AND (row_data->>'ttmCnttStatusMismatch')::boolean = FALSE AND row_data->>'ttmActualToDate' = row_data->>'r4gDate'";
    case 'ACHIEVED_E2E':
      return "ttm_e2e_alert_level = 'NONE' AND bottom_status_rank = 3 AND (row_data->>'r4gDate') IS NOT NULL AND row_data->>'ttmE2eActualToDate' = row_data->>'r4gDate'";
    case 'STATUS_MISMATCH':
      return "(row_data->>'ttmCnttStatusMismatch')::boolean = TRUE";
    case 'DATA_ANOMALY':
      return 'has_data_anomaly = TRUE';
    case 'WAITING_GOLIVE':
      return "row_data->>'releaseAxisState' = 'WAITING_GOLIVE'";
    case 'RELEASE_EARLY':
      return "row_data->>'releaseAxisState' = 'EARLY_WARNING'";
    case 'JUSTIFY_GOLIVE':
      return "row_data->>'releaseAxisState' = 'JUSTIFY_GOLIVE'";
    default:
      params.push(alertFilter);
      return `alert_level = $${params.length}`;
  }
}

const ORDER_BY = 'bottom_status_rank ASC, has_data_anomaly ASC, alert_rank ASC, remaining_working_days_rank ASC, epic_key ASC';

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
      count(*) FILTER (WHERE alert_level = 'FAIL')::text AS "failCntt",
      count(*) FILTER (WHERE ttm_e2e_alert_level = 'FAIL')::text AS "failE2e",
      count(*) FILTER (WHERE alert_level = 'LATE')::text AS "late",
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

/** TTM-Index (PM)/QA-Index (PM) — same ratio as summarizeTtmCntt (ttm-cntt-qa.ts), computed as a
 * SQL aggregate over every Epic in the viewer's access scope (unfiltered by their toolbar
 * selections, per that badge's own contract) instead of hydrating rows into JS. */
export async function queryTtmQaIndexPm(scope: AccessScope): Promise<{ ttm: TtmCnttSummary; qa: TtmCnttSummary }> {
  const params: unknown[] = [];
  const accessClause = buildAccessScopeClause(scope, params);
  const result = await pool.query<{
    ttmFail: string; ttmEligible: string; ttmPass: string; ttmTotal: string;
    qaFail: string; qaEligible: string; qaPass: string; qaTotal: string;
  }>(
    `
    SELECT
      count(*) FILTER (WHERE alert_level = 'FAIL')::text AS "ttmFail",
      count(*) FILTER (WHERE (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly)::text AS "ttmEligible",
      count(*) FILTER (WHERE (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly AND alert_level = 'NONE')::text AS "ttmPass",
      count(*)::text AS "ttmTotal",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND alert_level = 'FAIL')::text AS "qaFail",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly)::text AS "qaEligible",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED') AND (row_data->>'r4gDate') IS NOT NULL AND NOT has_data_anomaly AND alert_level = 'NONE')::text AS "qaPass",
      count(*) FILTER (WHERE UPPER(TRIM(current_status)) IN ('MVP DONE', 'RELEASED'))::text AS "qaTotal"
    FROM epic_alert_row_cache WHERE ${accessClause};
    `,
    params,
  );
  const row = result.rows[0];
  return {
    ttm: summarizeTtmCnttFromCounts(Number(row?.ttmEligible ?? 0), Number(row?.ttmPass ?? 0), Number(row?.ttmFail ?? 0), Number(row?.ttmTotal ?? 0)),
    qa: summarizeTtmCnttFromCounts(Number(row?.qaEligible ?? 0), Number(row?.qaPass ?? 0), Number(row?.qaFail ?? 0), Number(row?.qaTotal ?? 0)),
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

export async function getEpicAlertRowCacheMeta(): Promise<{ computedAt: string | null; hasCache: boolean }> {
  const result = await pool.query<{ computedAt: string }>('SELECT computed_at::text AS "computedAt" FROM epic_alert_row_cache ORDER BY computed_at DESC LIMIT 1;');
  return { computedAt: result.rows[0]?.computedAt ?? null, hasCache: result.rows.length > 0 };
}
