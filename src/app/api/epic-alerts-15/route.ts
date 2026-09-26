import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { parseEpicAlertFiltersFromSearchParams } from '@/lib/epic-alert-filter-params';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { fetchEpicAlertHeaderContext } from '@/lib/epic-alert-service';
import type { EpicAlertRowCacheFilters } from '@/lib/epic-alert-row-cache-query-service';
import { getEpicAlertRowCacheMeta, queryEpicAlertFilterOptions, queryEpicAlertRowCachePage, queryEpicAlertStatCounts, queryTtmQaIndexPm } from '@/lib/epic-alert-row-cache-query-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function parseCacheFilters(searchParams: URLSearchParams): EpicAlertRowCacheFilters {
  const csv = (key: string) => {
    const raw = searchParams.get(key);
    return raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : undefined;
  };
  return {
    projectKeys: csv('projectKeys'),
    pmSm: csv('pmSm'),
    components: csv('components'),
    alertFilter: searchParams.get('alertFilter') || undefined,
    epicType: searchParams.get('epicType') || undefined,
    statuses: csv('statuses'),
    dataIssueOnly: searchParams.get('dataIssueOnly') === '1',
    requestingUnit: searchParams.get('requestingUnit') || undefined,
    search: searchParams.get('search') || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const searchParams = request.nextUrl.searchParams;
    const filters = parseEpicAlertFiltersFromSearchParams(searchParams);
    // ttmIndexGlobal is a cheap cached read (see ttm-index-global-cache-service.ts) — it never
    // re-runs the company-wide, permission-unscoped Epic query on this (very frequently viewed)
    // request; it's only ever recomputed once per CSV import.
    const ttmIndexGlobalPromise = getTtmIndexGlobalCache();

    // Fast path: no "layer cũ hơn" drill-down and no advanced date filter active — those change
    // WHICH Epics are even in scope (a WHERE on `issues`, upstream of epic_alert_row_cache), so
    // only the default (newest layer, no date filter) view can be served from the cache. This is
    // the overwhelming majority of traffic (every plain page load / toolbar-filter change), and is
    // the one true server-side paginated + filtered read — see epic-alert-row-cache-query-service.ts.
    const usesAdvancedFilter = Boolean(filters.layerDates || filters.createdDateFrom || filters.startDateFrom || filters.dueDateFrom);
    const cacheMeta = usesAdvancedFilter ? null : await getEpicAlertRowCacheMeta();

    if (cacheMeta?.hasCache) {
      const header = await fetchEpicAlertHeaderContext(user.id, user.role);
      const cacheFilters = parseCacheFilters(searchParams);
      const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
      const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20));

      const [pageResult, statCounts, ttmQaIndexPm, filterOptions, ttmIndexGlobal] = await Promise.all([
        queryEpicAlertRowCachePage(header.scope, cacheFilters, page, pageSize),
        queryEpicAlertStatCounts(header.scope, cacheFilters),
        queryTtmQaIndexPm(header.scope),
        queryEpicAlertFilterOptions(header.scope),
        ttmIndexGlobalPromise,
      ]);

      return NextResponse.json({
        mode: 'paged',
        accessRole: header.accessRole,
        asOfDate: null,
        availableLayerDates: header.availableLayerDates,
        lastAggregatedAt: header.lastAggregatedAt,
        viewerName: header.viewerName,
        rows: pageResult.rows,
        totalCount: pageResult.totalCount,
        page,
        pageSize,
        statCounts,
        ttmIndexPm: ttmQaIndexPm.ttm,
        qaIndexPm: ttmQaIndexPm.qa,
        filterOptions,
        ttmIndexGlobal,
      });
    }

    // Fallback: advanced date filter active, or the cache hasn't been populated yet (e.g. no
    // import has completed since this table was introduced) — recompute live, same as before.
    const [data, ttmIndexGlobal] = await Promise.all([
      getEpicAlertRowsPhased(user.id, user.role, filters),
      ttmIndexGlobalPromise,
    ]);
    return NextResponse.json({ mode: 'full', ...data, ttmIndexGlobal });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts-15 route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Quản lý Epic 15';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
