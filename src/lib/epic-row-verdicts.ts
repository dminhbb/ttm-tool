import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { BADGE_BY_ID } from '@/lib/scoring/catalog';
import { FILTER_PRESETS } from '@/lib/scoring/select';
import type { Finding } from '@/lib/scoring/types';

/**
 * Verdicts the Epic screens (Quản trị Epic, Epic in PO) show in the "Nhận xét" cell and filter on —
 * one shared place instead of a copy per page. A row carrying `scoringBadges` (display engine
 * 'scoring', see scoring/projection.ts) is judged by the Epic Scoring Service's badges; otherwise the
 * legacy formulas below apply unchanged.
 */

type VerdictRow = Pick<EpicAlertRowPhased,
  'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'releaseAxisState' | 'releaseGraceDeadline' | 'scoringBadges' | 'scoringFindings'
  | 'ttmActualToDate' | 'ttmCnttInScope' | 'ttmCnttStatusMismatch' | 'ttmE2eActualToDate' | 'ttmE2eAlertLevel' | 'ttmExclusion'>;

/** Today in Vietnam, "YYYY-MM-DD" — mirrors vnToday() in scoring-context-service.ts, which is
 * server-only and can't be imported from this client-usable module. Used only to split "Chờ
 * golive" into Trong hạn/Quá hạn (release.graceWorkingDays, R4G Date +wd grace). */
export function vnTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function hasBadge(row: VerdictRow, badge: string): boolean {
  return Boolean(row.scoringBadges?.includes(badge));
}

/** "Đạt TTM-CNTT" — never for a "Sai Status" or Cancelled Epic. */
export function isTtmCnttAchieved(row: VerdictRow): boolean {
  if (row.scoringBadges) return hasBadge(row, 'CNTT_PASS');
  return !row.ttmCnttStatusMismatch && row.alertLevel === 'NONE' && Boolean(row.r4gDate) && row.ttmActualToDate === row.r4gDate;
}

/** "Đạt TTM-E2E" — Released and T0 → R4G Date within budget. */
export function isTtmE2eAchieved(row: VerdictRow): boolean {
  if (row.scoringBadges) return hasBadge(row, 'E2E_PASS');
  return row.ttmE2eAlertLevel === 'NONE' && normalizeEpicWorkflowStatus(row.currentStatus) === 'RELEASED' && Boolean(row.r4gDate) && row.ttmE2eActualToDate === row.r4gDate;
}

/**
 * "Chờ golive" / "Giải trình Golive". Since the 2026-10-01 rule both badges can be active on the
 * same Epic, which the single-valued legacy `releaseAxisState` can't express (projection keeps
 * "Giải trình" there) — so scoring rows are read from their badges; legacy rows from the field.
 */
type ReleaseRow = Pick<EpicAlertRowPhased, 'releaseAxisState' | 'scoringBadges'>;

export function isWaitingGolive(row: ReleaseRow): boolean {
  if (row.scoringBadges) return row.scoringBadges.includes('RELEASE_WAITING_GOLIVE');
  return row.releaseAxisState === 'WAITING_GOLIVE';
}

export function isJustifyGolive(row: ReleaseRow): boolean {
  if (row.scoringBadges) return row.scoringBadges.includes('RELEASE_JUSTIFY_GOLIVE');
  return row.releaseAxisState === 'JUSTIFY_GOLIVE';
}

/** Sub-buckets of "Chờ golive" (TTM Dashboard sub-links): no R4G Date / still inside R4G + grace /
 * past it. `today` = "YYYY-MM-DD" (Vietnam). */
export function waitingGoliveBucket(row: ReleaseRow & Pick<EpicAlertRowPhased, 'r4gDate' | 'releaseGraceDeadline'>, today: string): 'MISSING_R4G' | 'WITHIN_GRACE' | 'OVERDUE' | null {
  if (!isWaitingGolive(row)) return null;
  if (!row.r4gDate) return 'MISSING_R4G';
  return row.releaseGraceDeadline && today <= row.releaseGraceDeadline ? 'WITHIN_GRACE' : 'OVERDUE';
}

/** Which kind of "Fail TTM-CNTT (QLDA)" a row is, or null when it isn't one: 'LATE_R4G' = R4G Date
 * recorded but past Target (counted in the TTM-CNTT denominator); 'MISSING_R4G' = no R4G Date yet
 * and already past Target (outside the denominator). Same for both display engines. */
export function ttmFailKind(row: Pick<EpicAlertRowPhased, 'alertLevel' | 'r4gDate' | 'ttmCnttInScope'>): 'LATE_R4G' | 'MISSING_R4G' | null {
  if (!row.ttmCnttInScope || row.alertLevel !== 'FAIL') return null;
  return row.r4gDate ? 'LATE_R4G' : 'MISSING_R4G';
}

/** "Sai Status" on the Release axis (former rule R7) — scoring engine only. */
export function hasReleaseStatusMismatch(row: VerdictRow): boolean {
  return hasBadge(row, 'RELEASE_STATUS_MISMATCH');
}

/** Active finding for one badge (for its tooltip message), scoring engine only. */
export function findingOf(row: VerdictRow, badge: string): Finding | null {
  return row.scoringFindings?.find((item) => item.badge === badge && !item.suppressedBy) ?? null;
}

/** Active RECOMMENDATION findings that don't already have a badge of their own in the cell
 * ("Sai Status", "Pending lâu") — shown together as "Khuyến nghị (n)". */
export function extraRecommendations(row: VerdictRow): Finding[] {
  const ownBadges = new Set(['CNTT_STATUS_MISMATCH', 'E2E_STATUS_MISMATCH', 'RELEASE_STATUS_MISMATCH', 'ANOMALY_R2_PENDING_TOO_LONG']);
  return (row.scoringFindings ?? []).filter((item) => !item.suppressedBy && !ownBadges.has(item.badge) && BADGE_BY_ID.get(item.badge)?.group === 'RECOMMENDATION');
}

/** "Nhận xét" filter values. Scoring engine removed the two "Cảnh báo sớm" values and added
 * "Pending lâu" (see ALERT_FILTER_OPTIONS_FOR). */
export type AlertFilterValue =
  | '' | 'NONE' | 'EARLY' | 'LATE' | 'FAIL' | 'FAIL_E2E' | 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'STATUS_MISMATCH'
  | 'FAIL_LATE_R4G' | 'FAIL_MISSING_R4G' | 'DATA_ANOMALY' | 'DATA_ANOMALY_IN_SCOPE' | 'IN_SCOPE_CNTT' | 'OUT_OF_SCOPE_NO_ANOMALY' | 'MISSING_R4G_IN_SCOPE' | 'TTM_ELIGIBLE_IN_SCOPE' | 'PENDING_TOO_LONG' | 'WAITING_GOLIVE' | 'WAITING_GOLIVE_MISSING_R4G'
  | TtmFunnelFilterValue
  | 'WAITING_GOLIVE_WITHIN_GRACE' | 'WAITING_GOLIVE_OVERDUE' | 'RELEASE_EARLY' | 'JUSTIFY_GOLIVE' | 'OUT_OF_SCOPE_CNTT'
  | 'TTM_COUNTED_IN_SCOPE' | 'TTM_BLACK_LISTED' | 'TTM_PROJECT_NON_TTM';

const ALL_ALERT_FILTER_OPTIONS: { label: string; value: AlertFilterValue; engines: ('legacy' | 'scoring')[] }[] = [
  { label: 'Tất cả nhận xét', value: '', engines: ['legacy', 'scoring'] },
  { label: 'Đạt TTM-CNTT (QLDA)', value: 'ACHIEVED_CNTT', engines: ['legacy', 'scoring'] },
  { label: 'Đạt TTM-E2E', value: 'ACHIEVED_E2E', engines: ['legacy', 'scoring'] },
  { label: 'Cảnh báo sớm', value: 'EARLY', engines: ['legacy'] },
  { label: 'Cảnh báo muộn', value: 'LATE', engines: ['legacy', 'scoring'] },
  { label: 'Fail TTM-CNTT (QLDA)', value: 'FAIL', engines: ['legacy', 'scoring'] },
  { label: 'Fail TTM-CNTT (QLDA): Trễ R4G', value: 'FAIL_LATE_R4G', engines: ['legacy', 'scoring'] },
  { label: 'Fail TTM-CNTT (QLDA): Thiếu R4G', value: 'FAIL_MISSING_R4G', engines: ['legacy', 'scoring'] },
  { label: 'Fail TTM-E2E', value: 'FAIL_E2E', engines: ['legacy', 'scoring'] },
  { label: 'Sai Status', value: 'STATUS_MISMATCH', engines: ['legacy', 'scoring'] },
  { label: 'Sai lệch dữ liệu', value: 'DATA_ANOMALY', engines: ['legacy', 'scoring'] },
  { label: 'Trong phạm vi dữ liệu cho TTM (L01 — Tổng epic)', value: 'IN_SCOPE_CNTT', engines: ['legacy', 'scoring'] },
  { label: 'L02 — Epic trong phạm vi tính TTM', value: 'TTM_COUNTED_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'Epic ngoại lệ (TTM Black listed — loại khỏi L02)', value: 'TTM_BLACK_LISTED', engines: ['legacy', 'scoring'] },
  { label: 'Dự án không tính TTM (Time to Market = N — loại khỏi L02)', value: 'TTM_PROJECT_NON_TTM', engines: ['legacy', 'scoring'] },
  { label: 'Sai lệch dữ liệu (trong phạm vi TTM-CNTT)', value: 'DATA_ANOMALY_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'Chưa có R4G Date (trong phạm vi TTM-CNTT)', value: 'MISSING_R4G_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L04a — Epic hoàn thành (có R4G Date)', value: 'TTM_ELIGIBLE_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L05aa — Epic đạt TTM-CNTT', value: 'TTM_PASS_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L05ab — Epic không đạt TTM-CNTT (nhóm 1: trễ R4G)', value: 'TTM_LATE_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L05ac — Epic chưa kết luận (R4G tương lai / thiếu Target)', value: 'TTM_NOT_SCORED_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L05ba — Epic không đạt TTM-CNTT (nhóm 2: chưa có R4G, quá Target)', value: 'OVERDUE_MISSING_R4G_IN_SCOPE', engines: ['legacy', 'scoring'] },
  { label: 'L05bb — Epic trong hạn (chưa có R4G)', value: 'WITHIN_TARGET_MISSING_R4G', engines: ['legacy', 'scoring'] },
  { label: 'Ngoài phạm vi TTM-CNTT (không sai lệch dữ liệu)', value: 'OUT_OF_SCOPE_NO_ANOMALY', engines: ['legacy', 'scoring'] },
  { label: 'Pending lâu', value: 'PENDING_TOO_LONG', engines: ['scoring'] },
  { label: 'Chờ golive', value: 'WAITING_GOLIVE', engines: ['legacy', 'scoring'] },
  { label: 'Chờ golive: Thiếu R4G Date', value: 'WAITING_GOLIVE_MISSING_R4G', engines: ['legacy', 'scoring'] },
  { label: 'Chờ golive: Trong hạn', value: 'WAITING_GOLIVE_WITHIN_GRACE', engines: ['legacy', 'scoring'] },
  { label: 'Chờ golive: Quá hạn', value: 'WAITING_GOLIVE_OVERDUE', engines: ['legacy', 'scoring'] },
  { label: 'Cảnh báo sớm Release', value: 'RELEASE_EARLY', engines: ['legacy'] },
  { label: 'Giải trình Golive', value: 'JUSTIFY_GOLIVE', engines: ['legacy', 'scoring'] },
  { label: 'Ngoài phạm vi TTM-CNTT (QLDA)', value: 'OUT_OF_SCOPE_CNTT', engines: ['legacy', 'scoring'] },
];

export const ALERT_FILTER_VALUES = new Set<AlertFilterValue>(ALL_ALERT_FILTER_OPTIONS.map((option) => option.value));

export function alertFilterOptionsFor(engine: 'legacy' | 'scoring' | undefined): { label: string; value: AlertFilterValue }[] {
  const mode = engine ?? 'legacy';
  return ALL_ALERT_FILTER_OPTIONS.filter((option) => option.engines.includes(mode)).map(({ label, value }) => ({ label, value }));
}

/**
 * "Lọc Nhận xét" — matches the same badges the "Nhận xét" cell renders. Legacy: FAIL/LATE/EARLY/
 * NONE are TTM-CNTT labels, so an out-of-scope row (shown "Ngoài phạm vi TTM-CNTT") never matches
 * them; "Sai Status" never also matches "Đạt". Scoring: each value is a set of badge codes.
 */
export function matchesAlertFilter(row: VerdictRow, alertFilter: AlertFilterValue): boolean {
  if (!alertFilter) return true;
  // Field-based sub-filters (Dashboard "Tổng số Epic"/"Chờ golive" sub-links, 2026-10-01) — identical
  // check for both engines, since ttmCnttInScope/hasDataAnomaly/releaseAxisState/r4gDate/
  // releaseGraceDeadline are always plain projected fields regardless of display engine.
  switch (alertFilter) {
    // "Fail TTM" split (Ma trận Phân bổ, 2026-10-02): a Fail with a recorded R4G Date past Target
    // (L05ab) vs. a Fail without R4G Date, already past Target (L05ba). Both are in the TTM-CNTT
    // denominator since 2026-10-04 (Đạt + Fail). Unlike the L05 funnel filters, these two don't drop
    // "Epic ngoại lệ" / non-TTM-project Epics — they list every Epic carrying the Fail verdict.
    case 'FAIL_LATE_R4G': return ttmFailKind(row) === 'LATE_R4G';
    case 'FAIL_MISSING_R4G': return ttmFailKind(row) === 'MISSING_R4G';
    // L01 of the TTM Dashboard 2 funnel: every Epic inside "Phạm vi dữ liệu cho TTM".
    case 'IN_SCOPE_CNTT': return row.ttmCnttInScope;
    // L02: L01 without Cancelled, "Epic ngoại lệ" and non-TTM-project Epics.
    case 'TTM_COUNTED_IN_SCOPE': return row.ttmCnttInScope && !isCancelledStatus(row.currentStatus || '') && !row.ttmExclusion;
    // The two groups L02 drops besides Cancelled (inside "Phạm vi dữ liệu cho TTM", like the funnel).
    case 'TTM_BLACK_LISTED': return ttmFunnelBucket(row) === 'BLACK_LISTED';
    case 'TTM_PROJECT_NON_TTM': return ttmFunnelBucket(row) === 'PROJECT_NON_TTM';
    case 'OUT_OF_SCOPE_NO_ANOMALY': return !row.ttmCnttInScope && !row.hasDataAnomaly && !isCancelledStatus(row.currentStatus || '');
    case 'DATA_ANOMALY_IN_SCOPE': return row.ttmCnttInScope && row.hasDataAnomaly && !row.ttmExclusion;
    // Mutually exclusive with DATA_ANOMALY_IN_SCOPE (excludes hasDataAnomaly rows) so the dashboard's
    // "Tổng số Epic" − "Sai lệch dữ liệu" − "Chưa có R4G Date" arithmetic always lands exactly on
    // the TTM-CNTT (QLDA) denominator (isTtmIndexEligible below) with no double-counted overlap.
    case 'MISSING_R4G_IN_SCOPE': return row.ttmCnttInScope && !row.hasDataAnomaly && !row.r4gDate && !row.ttmExclusion;
    // TTM Dashboard 2 funnel leaves — see ttmFunnelBucket.
    case 'TTM_PASS_IN_SCOPE':
    case 'TTM_LATE_IN_SCOPE':
    case 'TTM_NOT_SCORED_IN_SCOPE':
    case 'OVERDUE_MISSING_R4G_IN_SCOPE':
    case 'WITHIN_TARGET_MISSING_R4G':
      return ttmFunnelBucket(row) === TTM_FUNNEL_BUCKET_BY_FILTER[alertFilter];
    // L04a "Epic hoàn thành" / "EPIC TÍNH TTM" column (Ma trận Phân bổ) — exactly isTtmIndexEligible's
    // own gate, expressed field-based so it matches both engines like the two filters above.
    case 'TTM_ELIGIBLE_IN_SCOPE': return row.ttmCnttInScope && Boolean(row.r4gDate) && !row.hasDataAnomaly && !row.ttmExclusion;
    case 'WAITING_GOLIVE_MISSING_R4G': return waitingGoliveBucket(row, vnTodayIso()) === 'MISSING_R4G';
    case 'WAITING_GOLIVE_WITHIN_GRACE': return waitingGoliveBucket(row, vnTodayIso()) === 'WITHIN_GRACE';
    case 'WAITING_GOLIVE_OVERDUE': return waitingGoliveBucket(row, vnTodayIso()) === 'OVERDUE';
    default: break;
  }
  if (row.scoringBadges) {
    const badges = FILTER_PRESETS[alertFilter];
    return Boolean(badges?.some((badge) => row.scoringBadges!.includes(badge)));
  }
  switch (alertFilter) {
    case 'FAIL_E2E': return row.ttmE2eAlertLevel === 'FAIL';
    case 'ACHIEVED_CNTT': return row.ttmCnttInScope && isTtmCnttAchieved(row);
    case 'ACHIEVED_E2E': return isTtmE2eAchieved(row);
    case 'STATUS_MISMATCH': return row.ttmCnttInScope && row.ttmCnttStatusMismatch;
    case 'DATA_ANOMALY': return row.hasDataAnomaly;
    case 'PENDING_TOO_LONG': return false;
    case 'WAITING_GOLIVE': return row.releaseAxisState === 'WAITING_GOLIVE';
    case 'RELEASE_EARLY': return row.releaseAxisState === 'EARLY_WARNING';
    case 'JUSTIFY_GOLIVE': return row.releaseAxisState === 'JUSTIFY_GOLIVE';
    case 'OUT_OF_SCOPE_CNTT': return !row.ttmCnttInScope;
    default: return row.ttmCnttInScope && row.alertLevel === alertFilter;
  }
}

type IndexRow = Pick<EpicAlertRowPhased, 'alertLevel' | 'hasDataAnomaly' | 'r4gDate' | 'scoringIndexFlags' | 'ttmCnttInScope'>;

/** In the TTM-Index denominator ("QLDA-judged"): in scope, R4G Date recorded, no data anomaly. */
export function isTtmIndexEligible(row: IndexRow): boolean {
  if (row.scoringIndexFlags) return row.scoringIndexFlags.includes('TTM_ELIGIBLE');
  return Boolean(row.ttmCnttInScope && row.r4gDate && !row.hasDataAnomaly);
}

/** Counted as "Đạt" by TTM-Index — scoring engine: exactly the "Đạt TTM-CNTT" badge (decision D1). */
export function isTtmIndexPass(row: IndexRow): boolean {
  if (row.scoringIndexFlags) return row.scoringIndexFlags.includes('TTM_PASS');
  return isTtmIndexEligible(row) && row.alertLevel === 'NONE';
}

/**
 * TTM Dashboard 2 funnel (docs/ttm-dashboard-2-spec.md, criteria names of 2026-10-04): every Epic
 * falls in exactly ONE leaf, so each layer is the sum of its leaves and nothing is counted twice.
 * The funnel only covers Epics inside "Phạm vi dữ liệu cho TTM" — OUT_OF_SCOPE is peeled off first
 * and is not part of L01:
 *
 *   OUT_OF_SCOPE (ngoài "Phạm vi dữ liệu cho TTM") — outside the funnel
 *   L01 Tổng epic ─┬─ CANCELLED | BLACK_LISTED | PROJECT_NON_TTM → L02 = L01 − the three (owner rule 2026-10-05:
 *                  │                                            Cancelled, "Epic ngoại lệ", project Time to Market = N)
 *                  ├─ DATA_ANOMALY                           → L03 = L02 − DATA_ANOMALY = L04a + L04b
 *                  ├─ L04a Epic hoàn thành (có R4G Date):       L05aa R4G_PASS | L05ab R4G_LATE | L05ac R4G_NOT_SCORED
 *                  └─ L04b Epic chưa hoàn thành (chưa có R4G):  L05ba NO_R4G_OVERDUE | L05bb NO_R4G_WITHIN_TARGET
 *
 * Tỷ lệ % Pass TTM-CNTT = L05aa / (L05aa + L05ab + L05ba) — the same ratio summarizeTtmCntt
 * (ttm-cntt-qa.ts) returns. L05ac = neither Đạt nor Fail yet: R4G Date still in the future, or no
 * Target could be computed. The drill-down lists in Quản trị Epic use the matching "Nhận xét" filter
 * values (TTM_FUNNEL_BUCKET_BY_FILTER; SQL twin in epic-alert-row-cache-query-service.ts), so a
 * funnel number and the list it opens always agree.
 */
export type TtmFunnelBucket =
  | 'CANCELLED' | 'BLACK_LISTED' | 'PROJECT_NON_TTM' | 'DATA_ANOMALY' | 'OUT_OF_SCOPE'
  | 'R4G_PASS' | 'R4G_LATE' | 'R4G_NOT_SCORED'
  | 'NO_R4G_OVERDUE' | 'NO_R4G_WITHIN_TARGET';

type FunnelRow = Pick<EpicAlertRowPhased, 'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'scoringIndexFlags' | 'ttmCnttInScope' | 'ttmExclusion'>;

export function ttmFunnelBucket(row: FunnelRow): TtmFunnelBucket {
  if (!row.ttmCnttInScope) return 'OUT_OF_SCOPE';
  if (isCancelledStatus(row.currentStatus || '')) return 'CANCELLED';
  if (row.ttmExclusion === 'BLACK_LISTED') return 'BLACK_LISTED';
  if (row.ttmExclusion === 'PROJECT_NON_TTM') return 'PROJECT_NON_TTM';
  if (row.hasDataAnomaly) return 'DATA_ANOMALY';
  if (row.r4gDate) {
    if (isTtmIndexPass(row)) return 'R4G_PASS';
    return row.alertLevel === 'FAIL' ? 'R4G_LATE' : 'R4G_NOT_SCORED';
  }
  return row.alertLevel === 'FAIL' ? 'NO_R4G_OVERDUE' : 'NO_R4G_WITHIN_TARGET';
}

export type TtmFunnelFilterValue =
  | 'TTM_PASS_IN_SCOPE' | 'TTM_LATE_IN_SCOPE' | 'TTM_NOT_SCORED_IN_SCOPE'
  | 'OVERDUE_MISSING_R4G_IN_SCOPE' | 'WITHIN_TARGET_MISSING_R4G';

export const TTM_FUNNEL_BUCKET_BY_FILTER: Record<TtmFunnelFilterValue, TtmFunnelBucket> = {
  OVERDUE_MISSING_R4G_IN_SCOPE: 'NO_R4G_OVERDUE',
  TTM_LATE_IN_SCOPE: 'R4G_LATE',
  TTM_NOT_SCORED_IN_SCOPE: 'R4G_NOT_SCORED',
  TTM_PASS_IN_SCOPE: 'R4G_PASS',
  WITHIN_TARGET_MISSING_R4G: 'NO_R4G_WITHIN_TARGET',
};
