import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-scoring-display-service';
import { getScoringEngineMode, getStoredScoringEngineMode } from '@/lib/scoring-mode-service';
import { parseEpicAlertFiltersFromSearchParams } from '@/lib/epic-alert-filter-params';
import { getTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import type { EpicAlertFilters } from '@/lib/epic-alert-service';
import { fetchEpicAlertHeaderContext } from '@/lib/epic-alert-service';
import type { EpicAlertRowCacheFilters } from '@/lib/epic-alert-row-cache-query-service';
import { getEpicAlertRowCacheMeta, queryEpicAlertFilterOptions, queryEpicAlertRowCachePage, queryEpicAlertStatCounts, queryTtmCnttIndexes } from '@/lib/epic-alert-row-cache-query-service';

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
    alertFilters: csv('alertFilter'),
    epicTypes: csv('epicType'),
    statuses: csv('statuses'),
    dataIssueOnly: searchParams.get('dataIssueOnly') === '1',
    requestingUnits: searchParams.getAll('requestingUnit').map((value) => value.trim()).filter(Boolean),
    search: searchParams.get('search') || undefined,
  };
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
    const user = await requireUser(request);
    const searchParams = request.nextUrl.searchParams;
    const filters = await dropNoOpTtmScopeOverride(parseEpicAlertFiltersFromSearchParams(searchParams));

    // Fast path: no "layer cũ hơn" drill-down and no advanced date filter active — those change
    // WHICH Epics are even in scope (a WHERE on `issues`, upstream of epic_alert_row_cache), so
    // only the default (newest layer, no date filter) view can be served from the cache. This is
    // the overwhelming majority of traffic (every plain page load / toolbar-filter change), and is
    // the one true server-side paginated + filtered read — see epic-alert-row-cache-query-service.ts.
    const usesAdvancedFilter = Boolean(
      filters.layerDates || filters.createdDateFrom || filters.startDateFrom || filters.dueDateFrom
      || filters.ttmScopeCnttFrom !== undefined || filters.ttmScopeCnttTo !== undefined
      || filters.ttmScopeQaFrom !== undefined || filters.ttmScopeQaTo !== undefined,
    );
    // The cache holds rows built with the STORED engine; a per-machine SCORING_ENGINE_MODE override
    // that differs from it can only be served by the live path.
    const [engineMode, cacheEngineMode] = await Promise.all([getScoringEngineMode(), getStoredScoringEngineMode()]);
    const cacheMeta = usesAdvancedFilter || engineMode !== cacheEngineMode ? null : await getEpicAlertRowCacheMeta();

    if (cacheMeta?.hasCache) {
      const header = await fetchEpicAlertHeaderContext(user.id, user.role);
      const cacheFilters = { ...parseCacheFilters(searchParams), engineMode };
      const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
      const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20));

      const [pageResult, statCounts, ttmCnttIndexes, filterOptions] = await Promise.all([
        queryEpicAlertRowCachePage(header.scope, cacheFilters, page, pageSize),
        queryEpicAlertStatCounts(header.scope, cacheFilters),
        queryTtmCnttIndexes(header.scope, cacheFilters),
        queryEpicAlertFilterOptions(header.scope),
      ]);

      return NextResponse.json({
        mode: 'paged',
        engineMode,
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
        ttmIndexPm: ttmCnttIndexes.ttm,
        qaIndexPm: ttmCnttIndexes.qa,
        filterOptions,
      });
    }

    // Fallback: advanced date filter active, or the cache hasn't been populated yet (e.g. no
    // import has completed since this table was introduced) — recompute live, same as before.
    const data = await getEpicAlertRowsForDisplay(user.id, user.role, filters);
    return NextResponse.json({ mode: 'full', ...data });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts-15 route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Quản lý Epic 15';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
