import type { EpicAlertFilters } from '@/lib/epic-alert-service';

/**
 * Parses the "Bộ lọc nâng cao" query params shared by /api/epic-alerts-15 and /api/epic-alerts
 * (asOfDate, changedSinceOnly, createdDateFrom, startDateFrom, dueDateFrom) — see EpicAlertFilters. Also parses the
 * "Phạm vi dữ liệu cho TTM" deep-link override (cnttFrom/cnttTo/qaFrom/qaTo) — presence of the key
 * (even with an empty value, an explicit "no bound") overrides the admin default; absence leaves it
 * undefined so fetchEpicAlertContext falls back to that default. See buildEpicAlertsDeepLink.
 */
export function parseEpicAlertFiltersFromSearchParams(searchParams: URLSearchParams): EpicAlertFilters {
  return {
    asOfDate: searchParams.get('asOfDate') || undefined,
    changedSinceOnly: searchParams.get('changedSinceOnly') === '1' || undefined,
    createdDateFrom: searchParams.get('createdDateFrom') || undefined,
    dueDateFrom: searchParams.get('dueDateFrom') || undefined,
    startDateFrom: searchParams.get('startDateFrom') || undefined,
    ttmScopeCnttFrom: searchParams.has('cnttFrom') ? (searchParams.get('cnttFrom') || null) : undefined,
    ttmScopeCnttTo: searchParams.has('cnttTo') ? (searchParams.get('cnttTo') || null) : undefined,
    ttmScopeQaFrom: searchParams.has('qaFrom') ? (searchParams.get('qaFrom') || null) : undefined,
    ttmScopeQaTo: searchParams.has('qaTo') ? (searchParams.get('qaTo') || null) : undefined,
  };
}
