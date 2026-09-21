import type { EpicAlertFilters } from '@/lib/epic-alert-service';

/**
 * Parses the "Bộ lọc nâng cao" query params shared by /api/epic-alerts-15 and /api/epic-alerts
 * (layerDates, createdDateFrom, startDateFrom, dueDateFrom) — see EpicAlertFilters.
 */
export function parseEpicAlertFiltersFromSearchParams(searchParams: URLSearchParams): EpicAlertFilters {
  const layerDatesParam = searchParams.get('layerDates');
  return {
    asOfDate: searchParams.get('asOfDate') || undefined,
    createdDateFrom: searchParams.get('createdDateFrom') || undefined,
    dueDateFrom: searchParams.get('dueDateFrom') || undefined,
    layerDates: layerDatesParam ? layerDatesParam.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
    startDateFrom: searchParams.get('startDateFrom') || undefined,
  };
}
