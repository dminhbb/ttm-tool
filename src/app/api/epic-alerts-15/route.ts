import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-alert-rows-service';
import { parseEpicAlertFiltersFromSearchParams } from '@/lib/epic-alert-filter-params';
import { getTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import { resolveViewAsTarget } from '@/lib/view-as-user-service';
import type { AccessScope, EpicAlertFilters } from '@/lib/epic-alert-service';
import { fetchEpicAlertHeaderContext, resolveAccessScope } from '@/lib/epic-alert-service';
import type { EpicAlertRowCacheFilters } from '@/lib/epic-alert-row-cache-query-service';
import { buildAccessScopeClause, getEpicAlertRowCacheMeta, queryEpicAlertFilterOptions, queryEpicAlertRowCachePage, queryEpicAlertStatCounts, queryTtmCnttIndexes } from '@/lib/epic-alert-row-cache-query-service';
import { applyEpicMarks, countAssignedTodoEpics, listMarkedOwnerNames, loadEpicMarkSummaries } from '@/lib/epic-mark-service';
import pool from '@/lib/db';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

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

/** Dot on "My assigned epics": the viewer's Epics (PM/SM, with a comment) whose "Giao việc" is still To do. It reads
 * the row cache whatever the list mode — a notification, independent of the toolbar filters and the viewed date. */
async function assignedTodoCount(scope: AccessScope, userId: number): Promise<number> {
  const params: unknown[] = [];
  return countAssignedTodoEpics(buildAccessScopeClause(scope, params), params, userId);
}

/** The viewer's name as it appears in an Epic's PM/SM list (e-mail local part) — for "My assigned epics". */
async function viewerOwnerName(userId: number): Promise<string> {
  const result = await pool.query<{ name: string }>(`SELECT SPLIT_PART(LOWER(email), '@', 1) AS name FROM users WHERE id = $1;`, [userId]);
  return result.rows[0]?.name ?? '';
}

/**
 * TTM dashboard always forwards its "Phạm vi dữ liệu cho TTM" as an explicit override on every
 * deep link (see buildEpicAlertsDeepLink) — even when it's just the untouched admin default. Such
 * an override changes nothing (epic_alert_row_cache's ttm_cntt_in_scope/qa_in_scope were computed
 * with that same default), so it's dropped here to keep the request on the fast cache path instead
 * of forcing the slow live recompute of every Epic. A genuinely different range still goes live.
 */
async function dropNoOpTtmScopeOverride(filters: EpicAlertFilters): Promise<EpicAlertFilters> {
  const keys = ['ttmScopeCnttFrom', 'ttmScopeCnttTo', 'ttmScopeQaFrom', 'ttmScopeQaTo'] as const;
  if (keys.every((key) => filters[key] === undefined)) return filters;
  const defaults = await getTtmScopeConfig();
  const defaultByKey = { ttmScopeCnttFrom: defaults.cnttFrom, ttmScopeCnttTo: defaults.cnttTo, ttmScopeQaFrom: defaults.qaFrom, ttmScopeQaTo: defaults.qaTo };
  const matchesDefault = keys.every((key) => filters[key] === undefined || (filters[key] || null) === (defaultByKey[key] || null));
  if (!matchesDefault) return filters;
  return { ...filters, ttmScopeCnttFrom: undefined, ttmScopeCnttTo: undefined, ttmScopeQaFrom: undefined, ttmScopeQaTo: undefined };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const searchParams = request.nextUrl.searchParams;
    // "Xem dưới quyền" from a TTM dashboard drill-down: list exactly what the previewed user sees
    // (ignored unless the actor may preview that user — see view-as-user-service.ts).
    const { userId, role, viewAsUser } = await resolveViewAsTarget(actor, searchParams.get('viewAsUserId'));
    const filters = await dropNoOpTtmScopeOverride(parseEpicAlertFiltersFromSearchParams(searchParams));

    // Fast path: no "layer cũ hơn" drill-down and no advanced date filter active — those change
    // WHICH Epics are even in scope (a WHERE on `issues`, upstream of epic_alert_row_cache), so
    // only the default (newest layer, no date filter) view can be served from the cache. This is
    // the overwhelming majority of traffic (every plain page load / toolbar-filter change), and is
    // the one true server-side paginated + filtered read — see epic-alert-row-cache-query-service.ts.
    const usesAdvancedFilter = Boolean(
      filters.asOfDate || filters.createdDateFrom || filters.startDateFrom || filters.dueDateFrom
      || filters.ttmScopeCnttFrom !== undefined || filters.ttmScopeCnttTo !== undefined
      || filters.ttmScopeQaFrom !== undefined || filters.ttmScopeQaTo !== undefined,
    );
    const cacheMeta = usesAdvancedFilter ? null : await getEpicAlertRowCacheMeta();

    if (cacheMeta?.hasCache) {
      const header = await fetchEpicAlertHeaderContext(userId, role);
      const cacheFilters = parseCacheFilters(searchParams, userId);
      const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
      const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20));

      const [pageResult, statCounts, ttmCnttIndexes, filterOptions] = await Promise.all([
        queryEpicAlertRowCachePage(header.scope, cacheFilters, page, pageSize),
        queryEpicAlertStatCounts(header.scope, cacheFilters),
        queryTtmCnttIndexes(header.scope, cacheFilters),
        queryEpicAlertFilterOptions(header.scope),
      ]);
      // Epic Mark: comments / the viewer's own Hide are read live and stamped on the page's rows (never cached).
      const [marks, myAssignedTodoCount] = await Promise.all([
        loadEpicMarkSummaries(pageResult.rows.map((row) => row.epicKey), userId),
        assignedTodoCount(header.scope, userId),
      ]);
      const markedOwnerNames = cacheFilters.markFilter === 'MARKED'
        ? await (async () => {
            const params: unknown[] = [];
            return listMarkedOwnerNames(buildAccessScopeClause(header.scope, params), params);
          })()
        : [];

      return NextResponse.json({
        mode: 'paged',
        accessRole: header.accessRole,
        asOfDate: null,
        availableLayerDates: header.availableLayerDates,
        layerDateSources: header.layerDateSources,
        lastAggregatedAt: header.lastAggregatedAt,
        viewerName: header.viewerName,
        viewAsUser,
        rows: applyEpicMarks(pageResult.rows, marks),
        markedOwnerNames,
        myAssignedTodoCount,
        totalCount: pageResult.totalCount,
        page,
        pageSize,
        statCounts,
        ttmIndexPm: ttmCnttIndexes.ttm,
        qaIndexPm: ttmCnttIndexes.qa,
        filterOptions,
      });
    }

    // Fallback: advanced date filter active, or the cache hasn't been populated yet (e.g. no
    // import has completed since this table was introduced) — recompute live, same as before.
    const data = await getEpicAlertRowsForDisplay(userId, role, filters);
    // Full mode: the client filters, so every row carries its mark and the viewer's own PM/SM name. Only the Epics
    // of this list (already within the viewer's data scope) are read — not the whole comment table.
    const [marks, viewerOwner, myAssignedTodoCount] = await Promise.all([
      loadEpicMarkSummaries(data.rows.map((row) => row.epicKey), userId),
      viewerOwnerName(userId),
      resolveAccessScope(userId, role).then((scope) => assignedTodoCount(scope, userId)),
    ]);
    return NextResponse.json({ mode: 'full', ...data, rows: applyEpicMarks(data.rows, marks), myAssignedTodoCount, viewerOwnerName: viewerOwner, viewAsUser });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts-15 route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Quản lý Epic 15';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
