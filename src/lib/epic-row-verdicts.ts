import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { BADGE_BY_ID } from '@/lib/scoring/catalog';
import { FILTER_PRESETS } from '@/lib/scoring/select';
import type { Finding } from '@/lib/scoring/types';

/**
 * Verdicts the Epic screens (Quản trị Epic, Epic in PO) show in the "Nhận xét" cell and filter on —
 * one shared place instead of a copy per page. Every verdict is read from the row's Epic Scoring
 * Service result (`scoringBadges` / `scoringIndexFlags`, see scoring/projection.ts).
 */

type VerdictRow = Pick<EpicAlertRowPhased,
  'alertLevel' | 'currentStatus' | 'hasDataAnomaly' | 'r4gDate' | 'releaseGraceDeadline' | 'scoringBadges' | 'scoringFindings'
  | 'scoringIndexFlags' | 'ttmCnttInScope' | 'ttmExclusion'>;

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
  return hasBadge(row, 'CNTT_PASS');
}

/** "Đạt TTM-E2E" — Released and T0 → R4G Date within budget. */
export function isTtmE2eAchieved(row: VerdictRow): boolean {
  return hasBadge(row, 'E2E_PASS');
}

/**
 * "Chờ golive" / "Giải trình Golive". Since the 2026-10-01 rule both badges can be active on the
 * same Epic, which the single-valued `releaseAxisState` can't express (projection keeps "Giải trình"
 * there) — so they are read from the row's badges.
 */
type ReleaseRow = Pick<EpicAlertRowPhased, 'scoringBadges'>;

export function isWaitingGolive(row: ReleaseRow): boolean {
  return Boolean(row.scoringBadges?.includes('RELEASE_WAITING_GOLIVE'));
}

export function isJustifyGolive(row: ReleaseRow): boolean {
  return Boolean(row.scoringBadges?.includes('RELEASE_JUSTIFY_GOLIVE'));
}

/** Sub-buckets of "Chờ golive" (TTM Dashboard sub-links): no R4G Date / still inside R4G + grace /
 * past it. `today` = "YYYY-MM-DD" (Vietnam). */
export function waitingGoliveBucket(row: ReleaseRow & Pick<EpicAlertRowPhased, 'r4gDate' | 'releaseGraceDeadline'>, today: string): 'MISSING_R4G' | 'WITHIN_GRACE' | 'OVERDUE' | null {
  if (!isWaitingGolive(row)) return null;
  if (!row.r4gDate) return 'MISSING_R4G';
  return row.releaseGraceDeadline && today <= row.releaseGraceDeadline ? 'WITHIN_GRACE' : 'OVERDUE';
}

/** Which kind of "Fail TTM-CNTT (QLDA)" a row is, or null when it isn't one: 'LATE_R4G' = R4G Date
 * recorded but past Target (L05ab); 'MISSING_R4G' = no R4G Date yet and already past Target
 * (L05ba). Both count in the TTM-CNTT denominator since 2026-10-04 (Đạt + Fail). */
export function ttmFailKind(row: Pick<EpicAlertRowPhased, 'alertLevel' | 'r4gDate' | 'ttmCnttInScope'>): 'LATE_R4G' | 'MISSING_R4G' | null {
  if (!row.ttmCnttInScope || row.alertLevel !== 'FAIL') return null;
  return row.r4gDate ? 'LATE_R4G' : 'MISSING_R4G';
}

/** "Sai Status" on the Release axis (former rule R7). */
export function hasReleaseStatusMismatch(row: VerdictRow): boolean {
  return hasBadge(row, 'RELEASE_STATUS_MISMATCH');
}

/** Active finding for one badge (for its tooltip message). */
export function findingOf(row: VerdictRow, badge: string): Finding | null {
  return row.scoringFindings?.find((item) => item.badge === badge && !item.suppressedBy) ?? null;
}

/** Active RECOMMENDATION findings that don't already have a badge of their own in the cell
 * ("Sai Status", "Pending lâu") — shown together as "Khuyến nghị (n)". */
export function extraRecommendations(row: VerdictRow): Finding[] {
  const ownBadges = new Set(['CNTT_STATUS_MISMATCH', 'E2E_STATUS_MISMATCH', 'RELEASE_STATUS_MISMATCH', 'ANOMALY_R2_PENDING_TOO_LONG', 'REC_MISSING_FAIL_REASON', 'REC_MISSING_RESPONSIBLE_DEPARTMENT']);
  return (row.scoringFindings ?? []).filter((item) => !item.suppressedBy && !ownBadges.has(item.badge) && BADGE_BY_ID.get(item.badge)?.group === 'RECOMMENDATION');
}

/** "Nhận xét" filter values. */
export type AlertFilterValue =
  | '' | 'NONE' | 'EARLY' | 'LATE' | 'FAIL' | 'FAIL_E2E' | 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'STATUS_MISMATCH'
  | 'FAIL_LATE_R4G' | 'FAIL_MISSING_R4G' | 'DATA_ANOMALY' | 'DATA_ANOMALY_IN_SCOPE' | 'IN_SCOPE_CNTT' | 'OUT_OF_SCOPE_NO_ANOMALY' | 'MISSING_R4G_IN_SCOPE' | 'TTM_ELIGIBLE_IN_SCOPE' | 'PENDING_TOO_LONG' | 'WAITING_GOLIVE' | 'WAITING_GOLIVE_MISSING_R4G'
  | TtmFunnelFilterValue
  | 'WAITING_GOLIVE_WITHIN_GRACE' | 'WAITING_GOLIVE_OVERDUE' | 'RELEASE_EARLY' | 'JUSTIFY_GOLIVE' | 'OUT_OF_SCOPE_CNTT'
  | 'TTM_COUNTED_IN_SCOPE' | 'TTM_BLACK_LISTED' | 'TTM_PROJECT_NON_TTM' | 'MISSING_FAIL_REASON' | 'MISSING_FAIL_STAGE' | 'MISSING_RESPONSIBLE_DEPARTMENT';

const ALERT_FILTER_OPTIONS: { label: string; value: AlertFilterValue }[] = [
  { label: 'Tất cả nhận xét', value: '' },
  { label: 'Đạt TTM-CNTT (QLDA)', value: 'ACHIEVED_CNTT' },
  { label: 'Đạt TTM-E2E', value: 'ACHIEVED_E2E' },
  { label: 'Cảnh báo muộn', value: 'LATE' },
  { label: 'Fail TTM-CNTT (QLDA)', value: 'FAIL' },
  { label: 'Fail TTM-CNTT (QLDA): Trễ R4G', value: 'FAIL_LATE_R4G' },
  { label: 'Fail TTM-CNTT (QLDA): Thiếu R4G', value: 'FAIL_MISSING_R4G' },
  { label: 'Fail TTM-E2E', value: 'FAIL_E2E' },
  { label: 'Sai Status', value: 'STATUS_MISMATCH' },
  { label: 'Sai lệch dữ liệu', value: 'DATA_ANOMALY' },
  { label: 'Trong phạm vi dữ liệu cho TTM (L01 — Tổng epic)', value: 'IN_SCOPE_CNTT' },
  { label: 'L02 — Epic trong phạm vi tính TTM', value: 'TTM_COUNTED_IN_SCOPE' },
  { label: 'Epic ngoại lệ — TTM Black listed (loại khỏi L02)', value: 'TTM_BLACK_LISTED' },
  { label: 'Epic ngoại lệ — dự án Time to Market = N (loại khỏi L02)', value: 'TTM_PROJECT_NON_TTM' },
  { label: 'Sai lệch dữ liệu (trong phạm vi TTM-CNTT)', value: 'DATA_ANOMALY_IN_SCOPE' },
  { label: 'Chưa có R4G Date (trong phạm vi TTM-CNTT)', value: 'MISSING_R4G_IN_SCOPE' },
  { label: 'L04a — Epic hoàn thành (có R4G Date)', value: 'TTM_ELIGIBLE_IN_SCOPE' },
  { label: 'L05aa — Epic đạt TTM-CNTT', value: 'TTM_PASS_IN_SCOPE' },
  { label: 'L05ab — Epic không đạt TTM-CNTT (nhóm 1: trễ R4G)', value: 'TTM_LATE_IN_SCOPE' },
  { label: 'L05ac — Epic chưa kết luận (không tính được Target)', value: 'TTM_NOT_SCORED_IN_SCOPE' },
  { label: 'L05ba — Epic không đạt TTM-CNTT (nhóm 2: chưa có R4G, quá Target)', value: 'OVERDUE_MISSING_R4G_IN_SCOPE' },
  { label: 'L05bb — Epic trong hạn (chưa có R4G)', value: 'WITHIN_TARGET_MISSING_R4G' },
  { label: 'Ngoài phạm vi TTM-CNTT (không sai lệch dữ liệu)', value: 'OUT_OF_SCOPE_NO_ANOMALY' },
  { label: 'Pending lâu', value: 'PENDING_TOO_LONG' },
  { label: 'Thiếu lý do Fail TTM (khâu fail hoặc phòng chịu TN chính)', value: 'MISSING_FAIL_REASON' },
  { label: 'Thiếu lý do Fail TTM: khâu fail', value: 'MISSING_FAIL_STAGE' },
  { label: 'Thiếu lý do Fail TTM: phòng chịu TN chính', value: 'MISSING_RESPONSIBLE_DEPARTMENT' },
  { label: 'Chờ golive', value: 'WAITING_GOLIVE' },
  { label: 'Chờ golive: Thiếu R4G Date', value: 'WAITING_GOLIVE_MISSING_R4G' },
  { label: 'Chờ golive: Trong hạn', value: 'WAITING_GOLIVE_WITHIN_GRACE' },
  { label: 'Chờ golive: Quá hạn', value: 'WAITING_GOLIVE_OVERDUE' },
  { label: 'Giải trình Golive', value: 'JUSTIFY_GOLIVE' },
  { label: 'Ngoài phạm vi TTM-CNTT (QLDA)', value: 'OUT_OF_SCOPE_CNTT' },
];

export const ALERT_FILTER_VALUES = new Set<AlertFilterValue>(ALERT_FILTER_OPTIONS.map((option) => option.value));

export const ALERT_FILTER_SELECT_OPTIONS: readonly { label: string; value: AlertFilterValue }[] = ALERT_FILTER_OPTIONS;

/**
 * "Lọc Nhận xét" — matches the same badges the "Nhận xét" cell renders: each value is a set of badge
 * codes (FILTER_PRESETS); a value with no preset matches nothing.
 */
export function matchesAlertFilter(row: VerdictRow, alertFilter: AlertFilterValue): boolean {
  if (!alertFilter) return true;
  // Field-based sub-filters (Dashboard "Tổng số Epic"/"Chờ golive" sub-links, 2026-10-01) —
  // ttmCnttInScope/hasDataAnomaly/r4gDate/releaseGraceDeadline are plain projected fields.
  switch (alertFilter) {
    // "Fail TTM" split (Ma trận Phân bổ, 2026-10-02): a Fail with a recorded R4G Date past Target
    // (L05ab) vs. a Fail without R4G Date, already past Target (L05ba). Both are in the TTM-CNTT
    // denominator since 2026-10-04 (Đạt + Fail). Unlike the L05 funnel filters, these two don't drop
    // "Epic ngoại lệ" themselves — they list every Epic carrying the Fail verdict (an "Epic ngoại lệ"
    // carries none since 2026-10-09).
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
    // own gate, expressed field-based like the filters above.
    case 'TTM_ELIGIBLE_IN_SCOPE': return row.ttmCnttInScope && Boolean(row.r4gDate) && !row.hasDataAnomaly && !row.ttmExclusion;
    case 'WAITING_GOLIVE_MISSING_R4G': return waitingGoliveBucket(row, vnTodayIso()) === 'MISSING_R4G';
    case 'WAITING_GOLIVE_WITHIN_GRACE': return waitingGoliveBucket(row, vnTodayIso()) === 'WITHIN_GRACE';
    case 'WAITING_GOLIVE_OVERDUE': return waitingGoliveBucket(row, vnTodayIso()) === 'OVERDUE';
    default: break;
  }
  const badges = FILTER_PRESETS[alertFilter];
  return Boolean(badges?.some((badge) => row.scoringBadges?.includes(badge)));
}

type IndexRow = Pick<EpicAlertRowPhased, 'alertLevel' | 'hasDataAnomaly' | 'r4gDate' | 'scoringIndexFlags' | 'ttmCnttInScope'>;

/** In the TTM-Index denominator ("QLDA-judged"): in scope, R4G Date recorded, no data anomaly. */
export function isTtmIndexEligible(row: IndexRow): boolean {
  if (row.scoringIndexFlags) return row.scoringIndexFlags.includes('TTM_ELIGIBLE');
  // Rows carry the flags once scored; this field-based gate is only for a row built without them.
  return Boolean(row.ttmCnttInScope && row.r4gDate && !row.hasDataAnomaly);
}

/** Counted as "Đạt" by TTM-Index: exactly the "Đạt TTM-CNTT" badge (decision D1). */
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
