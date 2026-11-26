import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-alert-rows-service';
import { parseEpicAlertFiltersFromSearchParams } from '@/lib/epic-alert-filter-params';
import { getTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import { resolveViewAsTarget } from '@/lib/view-as-user-service';
import { resolveViewGrants } from '@/lib/user-view-grants-service';
import { fetchEpicAlertHeaderContext, type AccessScope } from '@/lib/epic-alert-service';
import type { EpicAlertRowCacheFilters } from '@/lib/epic-alert-row-cache-query-service';
import { buildFilterClause } from '@/lib/epic-alert-row-cache-query-service';
import { filterFullModeRows, type FullModeFilterOptions } from '@/lib/epic-row-export';
import type { EpicAlertRowExport } from '@/lib/epic-row-export';
import { ALERT_FILTER_VALUES } from '@/lib/epic-row-verdicts';
import type { AlertFilterValue } from '@/lib/epic-row-verdicts';
import { getJiraSettings } from '@/lib/jira-settings-service';
import { applyEpicMarks, loadEpicMarkSummaries } from '@/lib/epic-mark-service';
import pool from '@/lib/db';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/** Same toolbar-filter parsing as the Quản trị Epic list API (parseCacheFilters), reproduced here so
 * the export endpoint can reuse the cache query's SQL WHERE without importing the screen route. */
function parseCacheFilters(searchParams: URLSearchParams, viewerUserId: number): EpicAlertRowCacheFilters {
  const csv = (key: string) => {
    const raw = searchParams.get(key);
    return raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : undefined;
  };
  return {
    projectKeys: csv('projectKeys'),
    pmSm: csv('pmSm'),
    components: csv('components'),
    alertFilters: csv('alertFilter'),
    epicTypes: csv('epicType'),
    statuses: csv('statuses'),
    dataIssueOnly: searchParams.get('dataIssueOnly') === '1',
    requestingUnits: searchParams.getAll('requestingUnit').map((value) => value.trim()).filter(Boolean),
    ruleGroups: searchParams.getAll('ruleGroup').map((value) => value.trim()).filter(Boolean),
    search: searchParams.get('search') || undefined,
    markFilter: ['HIDDEN', 'MARKED', 'MINE'].includes(searchParams.get('markFilter') ?? '') ? (searchParams.get('markFilter') as 'HIDDEN' | 'MARKED' | 'MINE') : undefined,
    markedPmSm: csv('markedPmSm'),
    viewerUserId,
  };
}

/** Same no-op-scope-drop as the list route, so an export of the default scope stays on the cache path. */
async function dropNoOpTtmScopeOverride(filters: ReturnType<typeof parseEpicAlertFiltersFromSearchParams>): Promise<ReturnType<typeof parseEpicAlertFiltersFromSearchParams>> {
  const keys = ['ttmScopeCnttFrom', 'ttmScopeCnttTo', 'ttmScopeQaFrom', 'ttmScopeQaTo'] as const;
  if (keys.every((key) => filters[key] === undefined)) return filters;
  const defaults = await getTtmScopeConfig();
  const defaultByKey = { ttmScopeCnttFrom: defaults.cnttFrom, ttmScopeCnttTo: defaults.cnttTo, ttmScopeQaFrom: defaults.qaFrom, ttmScopeQaTo: defaults.qaTo };
  const matchesDefault = keys.every((key) => filters[key] === undefined || (filters[key] || null) === (defaultByKey[key] || null));
  if (!matchesDefault) return filters;
  return { ...filters, ttmScopeCnttFrom: undefined, ttmScopeCnttTo: undefined, ttmScopeQaFrom: undefined, ttmScopeQaTo: undefined };
}

/** The viewer's name as it appears in an Epic's PM/SM list (e-mail local part) — for "My assigned epics". */
async function viewerOwnerName(userId: number): Promise<string> {
  const result = await pool.query<{ name: string }>(`SELECT SPLIT_PART(LOWER(email), '@', 1) AS name FROM users WHERE id = $1;`, [userId]);
  return result.rows[0]?.name ?? '';
}

/** Latest known Epic_Real_Start_Date per Epic key (issues, not the row cache). */
async function loadEpicRealStartDates(epicKeys: readonly string[]): Promise<Map<string, string | null>> {
  if (epicKeys.length === 0) return new Map();
  const result = await pool.query<{ issueKey: string; epicRealStartDate: string | null }>(
    `SELECT DISTINCT ON (issue_key) issue_key AS "issueKey", epic_real_start_date::text AS "epicRealStartDate"
     FROM issues
     WHERE issue_key = ANY($1)
     ORDER BY issue_key, aggregated_at DESC`,
    [epicKeys],
  );
  const map = new Map<string, string | null>();
  for (const row of result.rows) {
    if (!map.has(row.issueKey)) map.set(row.issueKey, row.epicRealStartDate);
  }
  return map;
}

/** Cache-backed (paged) path: the full filtered set, unpaginated, each row enriched with its latest
 * Epic_Real_Start_Date. Reuses buildFilterClause so the export set matches the screen's filter. */
async function queryAllCachedRows(
  scope: AccessScope,
  filters: EpicAlertRowCacheFilters,
): Promise<EpicAlertRowExport[]> {
  const { sql: whereSql, params, realScopeSql } = buildFilterClause(scope, filters);
  const result = await pool.query<{ rowData: unknown; epicRealStartDate: string | null; viewOnly: boolean }>(
    `
    SELECT row_data AS "rowData",
           (SELECT i.epic_real_start_date::text FROM issues i WHERE i.issue_key = epic_alert_row_cache.epic_key ORDER BY i.aggregated_at DESC LIMIT 1) AS "epicRealStartDate",
           NOT (${realScopeSql}) AS "viewOnly"
    FROM epic_alert_row_cache
    WHERE ${whereSql}
    `,
    params,
  );
  return result.rows.map((row) => {
    const data = row.rowData as EpicAlertRowExport;
    return row.viewOnly
      ? { ...data, viewOnly: true, epicRealStartDate: row.epicRealStartDate }
      : { ...data, epicRealStartDate: row.epicRealStartDate };
  });
}

/** Builds FullModeFilterOptions from the toolbar search params — a pure twin of the screen's filters. */
function fullModeOptions(searchParams: URLSearchParams, viewerOwner: string): FullModeFilterOptions {
  const csv = (key: string) => (searchParams.get(key)?.split(',').map((value) => value.trim()).filter(Boolean) ?? []);
  const markFilter = (['HIDDEN', 'MARKED', 'MINE'] as const).includes(searchParams.get('markFilter') as never)
    ? (searchParams.get('markFilter') as 'HIDDEN' | 'MARKED' | 'MINE')
    : null;
  const alertFilters = csv('alertFilter').filter((value): value is AlertFilterValue => ALERT_FILTER_VALUES.has(value as AlertFilterValue));
  return {
    projectFilters: csv('projectKeys'),
    pmSmFilters: csv('pmSm'),
    componentFilters: csv('components'),
    alertFilters,
    typeFilters: csv('epicType'),
    statusFilters: csv('statuses'),
    dataIssueFilter: searchParams.get('dataIssueOnly') === '1',
    requestingUnitFilters: searchParams.getAll('requestingUnit').map((value) => value.trim()).filter(Boolean),
    ruleGroupFilters: searchParams.getAll('ruleGroup').map((value) => value.trim()).filter(Boolean),
    search: searchParams.get('search') || '',
    markFilter,
    markedPmSmFilters: csv('markedPmSm'),
    viewerOwnerName: viewerOwner,
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const searchParams = request.nextUrl.searchParams;
    const { userId, role } = await resolveViewAsTarget(actor, searchParams.get('viewAsUserId'));
    const parsedFilters = await dropNoOpTtmScopeOverride(parseEpicAlertFiltersFromSearchParams(searchParams));
    const viewGrants = await resolveViewGrants(userId, role);
    const filters = { ...parsedFilters, viewGrants };

    const usesAdvancedFilter = Boolean(
      filters.asOfDate || filters.createdDateFrom || filters.startDateFrom || filters.dueDateFrom
      || filters.ttmScopeCnttFrom !== undefined || filters.ttmScopeCnttTo !== undefined
      || filters.ttmScopeQaFrom !== undefined || filters.ttmScopeQaTo !== undefined,
    );

    let rows: EpicAlertRowExport[];
    if (!usesAdvancedFilter) {
      const header = await fetchEpicAlertHeaderContext(userId, role);
      const cacheFilters = { ...parseCacheFilters(searchParams, userId), viewGrants };
      const newFailScope = searchParams.get('newFailScope');
      if (newFailScope) {
        const { getNewFailEpicKeys } = await import('@/lib/ttm-dashboard-trend-service');
        cacheFilters.epicKeys = (await getNewFailEpicKeys(newFailScope)) ?? [];
      }
      rows = await queryAllCachedRows(header.scope, cacheFilters);
    } else {
      const fullData = await getEpicAlertRowsForDisplay(userId, role, filters);
      // Stamp Epic Marks (comments / the viewer's own Hide) BEFORE filtering, because the Mark quick
      // filters (Hidden/MARKED/MINE) read them — exactly what the list route does before the browser filters.
      const marks = await loadEpicMarkSummaries(fullData.rows.map((row) => row.epicKey), userId);
      const markedRows = applyEpicMarks(fullData.rows, marks);
      const filtered = filterFullModeRows(markedRows, fullModeOptions(searchParams, await viewerOwnerName(userId)));
      const realStart = await loadEpicRealStartDates(filtered.map((row) => row.epicKey));
      rows = filtered.map((row) => ({ ...row, epicRealStartDate: realStart.get(row.epicKey) ?? null }));
    }

    const [jiraSettings] = await Promise.all([getJiraSettings()]);
    const projectNames = [...new Set(rows.map((row) => row.projectName || row.projectKey))].sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
    const exportedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const dataLayerDate = rows[0]?.dataLayerDate ?? null;

    return NextResponse.json({
      rows,
      viewIssueBaseUrl: jiraSettings.viewIssueBaseUrl,
      exportedAt,
      projectNames,
      dataLayerDate,
    });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts-15/export route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xuất dữ liệu Quản lý Epic 15';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
