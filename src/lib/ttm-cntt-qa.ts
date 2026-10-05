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

/**
 * TTM-CNTT (QLDA) / TTM-CNTT (QA) — owner rule 2026-10-04, named after the TTM Dashboard 2 funnel
 * criteria (ttm-funnel-summary.ts, docs/ttm-dashboard-2-spec.md), all within "Phạm vi dữ liệu cho TTM":
 *   Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba)
 *   Tỷ lệ % Fail = (L05ab + L05ba) / (L05aa + L05ab + L05ba)
 * i.e. only Epics with a final verdict count: Đạt (L05aa), Fail with an R4G Date past Target (L05ab)
 * and Fail without an R4G Date, already past Target (L05ba). Epics not concluded yet (L05ac, L05bb),
 * Cancelled ones and "Sai lệch dữ liệu" ones are outside the ratio. TTM-E2E uses the same ratio on
 * its own verdicts since 2026-10-05: Đạt TTM-E2E / (Đạt TTM-E2E + Fail TTM-E2E) — summarizeE2e.
 */
export interface TtmCnttSummary {
  /** Epics with a recorded R4G Date and no data anomaly (L04a "Epic hoàn thành"). Informational —
   * the ratio's denominator is `denominator` below. */
  eligible: number;
  /** Fail TTM-CNTT among Epics without "Sai lệch dữ liệu" = L05ab + L05ba — an Epic can blow its
   * budget before ever reaching R4G, so this is independent of `eligible`. */
  fail: number;
  /** "Đạt TTM-CNTT" (L05aa). */
  pass: number;
  /** What `pct` is a ratio of: pass + fail (Epics with a final verdict). */
  denominator: number;
  /** Tỷ lệ % Pass, rounded to a whole number — used wherever the ratio is shown compactly (matrix
   * table bars/cells). 100 when nothing has a verdict yet (denominator = 0). */
  pct: number;
  /** Same ratio as `pct`, unrounded — for displays that show 1 decimal place. */
  pctPrecise: number;
  /** Tỷ lệ % Fail = 100 − Tỷ lệ % Pass (0 when the denominator is 0). */
  failPct: number;
  failPctPrecise: number;
  /** Epics counted at all: not Cancelled, inside the index's "Phạm vi dữ liệu cho TTM". */
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
    // "Sai lệch dữ liệu" Epics are outside the ratio altogether (L03) — neither Đạt nor Fail.
    if (row.hasDataAnomaly) continue;
    if (row.alertLevel === 'FAIL') fail += 1;
    if (row.r4gDate) {
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
    if (row.hasDataAnomaly) continue;
    if (row.alertLevel === 'FAIL') fail += 1;
    if (row.r4gDate) {
      eligible += 1;
      if (row.alertLevel === 'NONE') pass += 1;
    }
  }

  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

/** TTM-E2E ratio — same formula as TTM-CNTT since 2026-10-05 (owner rule): Tỷ lệ % Pass = Đạt TTM-E2E /
 * (Đạt TTM-E2E + Fail TTM-E2E), so an Epic that already blew its E2E budget without an R4G Date is
 * in the denominator, and one with no verdict yet (end date still in the future) is not. Cancelled
 * and "Sai lệch dữ liệu" Epics are outside the ratio. No "Phạm vi dữ liệu cho TTM" gate (that only
 * ever applies to CNTT/QA, see ttm-scope-rules.ts). `eligible` = Epics with a recorded R4G Date whose
 * E2E calc isn't broken (informational). Shared by the per-filter "Hoàn thành TTM-E2E" ring (TTM
 * Dashboard, TTM Dashboard 2) and the company-wide cache (ttm-index-global-cache-service.ts). */
export function summarizeE2e(rows: Pick<EpicAlertRowPhased, 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'scoringBadges' | 'ttmE2eAlertLevel'>[]): TtmCnttSummary {
  let eligible = 0;
  let pass = 0;
  let fail = 0;
  let total = 0;

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    total += 1;
    // "Sai lệch dữ liệu" Epics are neither Đạt nor Fail (the scoring engine doesn't judge them at all).
    if (row.hasDataAnomaly) continue;
    const badges = row.scoringBadges;
    if (badges ? badges.includes('E2E_FAIL') : row.ttmE2eAlertLevel === 'FAIL') fail += 1;
    const hasR4g = Boolean(row.r4gDate) && !badges?.includes('E2E_CALC_BROKEN');
    if (hasR4g) eligible += 1;
    const achieved = badges ? badges.includes('E2E_PASS') : hasR4g && row.ttmE2eAlertLevel === 'NONE' && (row.currentStatus ?? '').trim().toUpperCase() === 'RELEASED';
    if (achieved) pass += 1;
  }

  return summarizeTtmCnttFromCounts(eligible, pass, fail, total);
}

/** TTM-CNTT (QLDA/QA) and TTM-E2E ratio from counts — the single place the formula lives, for both
 * the row-based summaries above and callers that already have the counts (a SQL aggregate, the
 * company-wide cache row). `fail` must already exclude "Sai lệch dữ liệu" Epics (= L05ab + L05ba). */
export function summarizeTtmCnttFromCounts(eligible: number, pass: number, fail: number, total: number): TtmCnttSummary {
  const denominator = pass + fail;
  const pctPrecise = denominator > 0 ? (pass / denominator) * 100 : 100;
  const failPctPrecise = denominator > 0 ? (fail / denominator) * 100 : 0;
  return { denominator, eligible, fail, failPct: Math.round(failPctPrecise), failPctPrecise, pass, pct: Math.round(pctPrecise), pctPrecise, total };
}

