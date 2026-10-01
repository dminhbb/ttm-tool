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

/** Epic Scoring Service rows carry their Index membership precomputed (scoring/select.ts
 * indexFlagsOf) — "Đạt" then means exactly the "Đạt TTM-CNTT" badge (decision D1), so the counts
 * come from those flags instead of the legacy alertLevel formula below. */
function countFromScoringFlags(rows: Pick<EpicAlertRowPhased, 'scoringIndexFlags'>[], prefix: 'TTM' | 'QA'): TtmCnttSummary | null {
  if (!rows.length || rows.some((row) => !row.scoringIndexFlags)) return null;
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;
  for (const row of rows) {
    const flags = row.scoringIndexFlags ?? [];
    if (!flags.includes(`${prefix}_COUNTED`)) continue;
    total += 1;
    if (flags.includes(`${prefix}_FAIL`)) fail += 1;
    if (flags.includes(`${prefix}_ELIGIBLE`)) eligible += 1;
    if (flags.includes(`${prefix}_PASS`)) pass += 1;
  }
  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

export function summarizeTtmCntt(rows: Pick<EpicAlertRowPhased, 'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'scoringIndexFlags' | 'ttmCnttInScope'>[]): TtmCnttSummary {
  const scored = countFromScoringFlags(rows, 'TTM');
  if (scored) return scored;
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    // "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo) — see computeTtmCnttInScope in
    // ttm-scope-rules.ts. True for every Epic while no admin bound is configured, so this is a
    // no-op until an admin actually sets one.
    if (!row.ttmCnttInScope) continue;
    total += 1;
    if (row.alertLevel === 'FAIL') fail += 1;
    if (row.r4gDate && !row.hasDataAnomaly) {
      eligible += 1;
      if (row.alertLevel === 'NONE') pass += 1;
    }
  }

  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

/** Same shape as summarizeTtmCntt, for the QA-Index ratio: scoped to MVP Done/Released status
 * (isTtmCnttQaInScope) AND the "R4G for TTM (QA)" gate (row.qaInScope) instead of ttmCnttInScope —
 * the two date-range gates are independent (see ttm-scope-rules.ts). */
export function summarizeQaIndex(rows: Pick<EpicAlertRowPhased, 'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'qaInScope' | 'r4gDate' | 'scoringIndexFlags'>[]): TtmCnttSummary {
  const scored = countFromScoringFlags(rows, 'QA');
  if (scored) return scored;
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    if (!isTtmCnttQaInScope(row.currentStatus)) continue;
    if (!row.qaInScope) continue;
    total += 1;
    if (row.alertLevel === 'FAIL') fail += 1;
    if (row.r4gDate && !row.hasDataAnomaly) {
      eligible += 1;
      if (row.alertLevel === 'NONE') pass += 1;
    }
  }

  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

/** TTM-E2E ratio, same shape/formula as summarizeTtmCntt but on the E2E axis — no "Phạm vi dữ liệu
 * cho TTM" gate (that only ever applies to CNTT/QA, see ttm-scope-rules.ts). "Eligible" (mẫu số) =
 * Epic has a recorded R4G Date and the TTM-E2E calc isn't broken (R4G < T0); "pass" (tử số) = among
 * those, the Epic has "Đạt TTM-E2E". "fail" counts E2E_FAIL independently of eligibility, same as
 * TTM-CNTT's fail. Shared by the per-filter "Hoàn thành TTM-E2E" ring (dashboard-new/page.tsx) and
 * the company-wide cache (ttm-index-global-cache-service.ts) so both never disagree on the formula. */
export function summarizeE2e(rows: Pick<EpicAlertRowPhased, 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'scoringBadges' | 'ttmE2eAlertLevel'>[]): TtmCnttSummary {
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    total += 1;
    const badges = row.scoringBadges;
    const calcBroken = badges ? badges.includes('E2E_CALC_BROKEN') : row.hasDataAnomaly;
    if (badges ? badges.includes('E2E_FAIL') : row.ttmE2eAlertLevel === 'FAIL') fail += 1;
    if (!row.r4gDate || calcBroken) continue;
    eligible += 1;
    const achieved = badges ? badges.includes('E2E_PASS') : row.ttmE2eAlertLevel === 'NONE' && (row.currentStatus ?? '').trim().toUpperCase() === 'RELEASED';
    if (achieved) pass += 1;
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
