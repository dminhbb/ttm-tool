import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';

/**
 * TTM-CNTT-QA is TTM-CNTT itself, narrowed to Epics whose current status is 'MVP Done' or
 * 'Released' — it never recomputes alertLevel/r4gDate/hasDataAnomaly on its own. Whatever rule
 * change lands in the core TTM-CNTT calculation (epic-alert-phase-service.ts /
 * epic-alert-service.ts) flows into every reader of this scope automatically, because this file
 * only filters rows the core calculation already produced; it never re-derives the alert itself.
 * Only the status allowlist below is this metric's own concern.
 */
const TTM_CNTT_QA_STATUSES = new Set(['MVP DONE', 'RELEASED']);

export function isTtmCnttQaInScope(status: string | null | undefined): boolean {
  return TTM_CNTT_QA_STATUSES.has((status ?? '').trim().toUpperCase());
}

export interface TtmCnttSummary {
  /** Epics with a recorded R4G Date and no data anomaly — the denominator `pass`/`pct` are a ratio
   * of (see achievedTtmEligibleCount in dashboard-service.ts, the same eligibility gate). */
  eligible: number;
  /** alertLevel === 'FAIL' count — independent of the eligibility gate above, since an Epic can
   * already blow its TTM-CNTT budget before ever reaching R4G. */
  fail: number;
  /** alertLevel === 'NONE' among eligible Epics — "Đạt TTM-CNTT". */
  pass: number;
  /** pass/eligible as a percentage, rounded to a whole number — used wherever the ratio is shown
   * compactly (matrix table bars/cells). When nothing is eligible yet (no Epic has reached R4G),
   * falls back to (total-fail)/total so an Epic that already blew its TTM-CNTT budget pre-R4G still
   * pulls the ratio down instead of rendering a false 100% "healthy"; 100 only when there are no
   * rows at all. */
  pct: number;
  /** Same ratio as `pct`, unrounded — for displays that show 1 decimal place (the two "TTM Index"
   * ring widgets on Dashboard 2's Executive view) instead of a whole-number percentage. */
  pctPrecise: number;
  total: number;
}

/** 1 decimal place, Vietnamese comma separator — shared by every "TTM/QA Index" ring/badge widget
 * (Dashboard 2's Executive view, Quản trị Epic's header badges) so the same ratio never renders
 * with a different precision/locale on two screens. */
const PERCENT_1_DECIMAL_FORMATTER = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function formatTtmPct1(value: number): string {
  return PERCENT_1_DECIMAL_FORMATTER.format(value);
}

export function summarizeTtmCntt(rows: Pick<EpicAlertRowPhased, 'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'r4gDate'>[]): TtmCnttSummary {
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    total += 1;
    if (row.alertLevel === 'FAIL') fail += 1;
    if (row.r4gDate && !row.hasDataAnomaly) {
      eligible += 1;
      if (row.alertLevel === 'NONE') pass += 1;
    }
  }

  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

/** Same eligible/pass/fail/total → pct/pctPrecise formula as summarizeTtmCntt, for callers that
 * already have the counts (e.g. a SQL aggregate) instead of the row array itself — see
 * epic-alert-row-cache-query-service.ts's queryTtmQaIndexPm. */
export function summarizeTtmCnttFromCounts(eligible: number, pass: number, fail: number, total: number): TtmCnttSummary {
  const pctPrecise = eligible > 0
    ? (pass / eligible) * 100
    : total > 0
      ? ((total - fail) / total) * 100
      : 100;
  return { eligible, fail, pass, pct: Math.round(pctPrecise), pctPrecise, total };
}
