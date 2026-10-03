/**
 * Single source of truth for the query string "Quản trị Epic" (`/epic-alerts-15`) accepts to have
 * its toolbar filters pre-applied on load — e.g. a Dashboard widget linking straight to "the Epics
 * behind this number". The page's own parseDeepLinkFilters (epic-alerts-15/page.tsx) is the other
 * half; keep both in sync if a param is added or renamed here.
 */

import type { TtmFunnelFilterValue } from '@/lib/epic-row-verdicts';

export const EPIC_ALERTS_ROUTE = '/epic-alerts-15';

/** Mirrors AlertFilterValue in epic-row-verdicts.ts, minus the '' (no filter) case. */
export type EpicAlertsDeepLinkAlert = 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'DATA_ANOMALY' | 'DATA_ANOMALY_IN_SCOPE' | 'MISSING_R4G_IN_SCOPE' | 'TTM_ELIGIBLE_IN_SCOPE' | TtmFunnelFilterValue | 'EARLY' | 'FAIL' | 'FAIL_E2E' | 'FAIL_LATE_R4G' | 'FAIL_MISSING_R4G' | 'JUSTIFY_GOLIVE' | 'LATE' | 'OUT_OF_SCOPE_CNTT' | 'PENDING_TOO_LONG' | 'RELEASE_EARLY' | 'STATUS_MISMATCH' | 'WAITING_GOLIVE' | 'WAITING_GOLIVE_MISSING_R4G' | 'WAITING_GOLIVE_WITHIN_GRACE' | 'WAITING_GOLIVE_OVERDUE';

export interface EpicAlertsDeepLinkParams {
  /** "Lọc Nhận xét" — same values as the table's Nhận xét badges (FAIL = Fail TTM-CNTT, etc.). */
  alert?: EpicAlertsDeepLinkAlert;
  /** Domain filter — also auto-selects every project under it into `projects`, unless `projects`
   * is itself given, which always wins. */
  domain?: string;
  dataIssue?: boolean;
  pmSm?: string | string[];
  /** Jira Project Keys — pre-selects the "Dự án" multi-select. */
  projects?: string[];
  /** "Đơn vị yêu cầu" — one or several; sent as a repeated `requestingUnit` param (unit names may
   * contain commas, so no comma-joined list). */
  requestingUnit?: string | string[];
  search?: string;
  /** Raw currentStatus values — pre-selects the "Status" multi-select. When omitted, the target
   * screen shows every status (no implicit default exclusions) so counts match whatever the caller
   * computed its own number from. */
  status?: string[];
  /** One of EPIC_COMPLEXITY_TYPES (status-alert-rule-types.ts), e.g. 'CT-Lv12'. */
  type?: string;
  /** "Phạm vi dữ liệu cho TTM" override (Dashboard 2's Advanced Filters, see ttm-scope-rules.ts) —
   * omit entirely to let the target screen use its own default (Cấu hình cảnh báo); pass `null`
   * (or '') for an explicit "no bound" that OVERRIDES the default rather than falling back to it —
   * e.g. Dashboard's Advanced Filter cleared that side deliberately. The CNTT and QA axes are
   * independent; set only the one(s) actually overridden on the caller's side. */
  ttmScopeCnttFrom?: string | null;
  ttmScopeCnttTo?: string | null;
  ttmScopeQaFrom?: string | null;
  ttmScopeQaTo?: string | null;
  /** "Xem dưới quyền" (user preview on the TTM dashboards): list the Epics as this user sees them.
   * The API only honours it for viewers allowed to preview that user (see view-as-user-service.ts). */
  viewAsUserId?: number | null;
}

export function buildEpicAlertsDeepLink(params: EpicAlertsDeepLinkParams = {}): string {
  const query = new URLSearchParams();
  if (params.alert) query.set('alert', params.alert);
  if (params.projects && params.projects.length > 0) query.set('projects', params.projects.join(','));
  if (params.status && params.status.length > 0) query.set('status', params.status.join(','));
  if (params.type) query.set('type', params.type);
  if (params.pmSm) {
    const pmSmVal = Array.isArray(params.pmSm) ? params.pmSm.join(',') : params.pmSm;
    if (pmSmVal) query.set('pmSm', pmSmVal);
  }
  for (const unit of Array.isArray(params.requestingUnit) ? params.requestingUnit : params.requestingUnit ? [params.requestingUnit] : []) {
    if (unit) query.append('requestingUnit', unit);
  }
  if (params.dataIssue) query.set('dataIssue', '1');
  if (params.search) query.set('search', params.search);
  if (params.domain) query.set('domain', params.domain);
  if (params.ttmScopeCnttFrom !== undefined) query.set('cnttFrom', params.ttmScopeCnttFrom ?? '');
  if (params.ttmScopeCnttTo !== undefined) query.set('cnttTo', params.ttmScopeCnttTo ?? '');
  if (params.ttmScopeQaFrom !== undefined) query.set('qaFrom', params.ttmScopeQaFrom ?? '');
  if (params.ttmScopeQaTo !== undefined) query.set('qaTo', params.ttmScopeQaTo ?? '');
  if (params.viewAsUserId) query.set('viewAsUserId', String(params.viewAsUserId));

  const queryString = query.toString();
  return queryString ? `${EPIC_ALERTS_ROUTE}?${queryString}` : EPIC_ALERTS_ROUTE;
}
