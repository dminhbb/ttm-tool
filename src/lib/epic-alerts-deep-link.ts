/**
 * Single source of truth for the query string "Quản trị Epic" (`/epic-alerts-15`) accepts to have
 * its toolbar filters pre-applied on load — e.g. a Dashboard widget linking straight to "the Epics
 * behind this number". The page's own parseDeepLinkFilters (epic-alerts-15/page.tsx) is the other
 * half; keep both in sync if a param is added or renamed here.
 */

export const EPIC_ALERTS_ROUTE = '/epic-alerts-15';

/** Mirrors AlertFilterValue in epic-alerts-15/page.tsx, minus the '' (no filter) case. */
export type EpicAlertsDeepLinkAlert = 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'DATA_ANOMALY' | 'EARLY' | 'FAIL' | 'FAIL_E2E' | 'LATE' | 'STATUS_MISMATCH';

export interface EpicAlertsDeepLinkParams {
  /** "Lọc Nhận xét" — same values as the table's Nhận xét badges (FAIL = Fail TTM-CNTT, etc.). */
  alert?: EpicAlertsDeepLinkAlert;
  /** Domain filter — also auto-selects every project under it into `projects`, unless `projects`
   * is itself given, which always wins. */
  domain?: string;
  dataIssue?: boolean;
  pmSm?: string;
  /** Jira Project Keys — pre-selects the "Dự án" multi-select. */
  projects?: string[];
  requestingUnit?: string;
  search?: string;
  /** Raw currentStatus values — pre-selects the "Status" multi-select. When omitted, the target
   * screen shows every status (no implicit default exclusions) so counts match whatever the caller
   * computed its own number from. */
  status?: string[];
  /** One of EPIC_COMPLEXITY_TYPES (status-alert-rule-types.ts), e.g. 'CT-Lv12'. */
  type?: string;
}

export function buildEpicAlertsDeepLink(params: EpicAlertsDeepLinkParams): string {
  const query = new URLSearchParams();
  if (params.alert) query.set('alert', params.alert);
  if (params.projects && params.projects.length > 0) query.set('projects', params.projects.join(','));
  if (params.status && params.status.length > 0) query.set('status', params.status.join(','));
  if (params.type) query.set('type', params.type);
  if (params.pmSm) query.set('pmSm', params.pmSm);
  if (params.requestingUnit) query.set('requestingUnit', params.requestingUnit);
  if (params.dataIssue) query.set('dataIssue', '1');
  if (params.search) query.set('search', params.search);
  if (params.domain) query.set('domain', params.domain);

  const queryString = query.toString();
  return queryString ? `${EPIC_ALERTS_ROUTE}?${queryString}` : EPIC_ALERTS_ROUTE;
}
