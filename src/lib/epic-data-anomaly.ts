import { diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { isCancelledStatus, isPendingStatus } from '@/lib/issue-status-rules';
import { epicWorkflowStatusIndex, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import type { EpicComplexity } from '@/lib/ttm-rules';

/**
 * Single source of truth for "Epic bị sai lệch dữ liệu" — every screen (Quản trị Epic đầy đủ/rút
 * gọn, Epic in PO), Báo cáo, Dashboard and the alert timeline evaluate anomalies through
 * evaluateEpicDataAnomaly() so the flag and its reason list can never disagree between them.
 * Data-anomaly Epics are NEVER dropped at import — they're all kept and flagged so the owner can
 * complete the missing information (see aggregateBatchData / getEpicAlertRows*).
 *
 * Rules (company spec, 2026-09, revised 2026-09-22 — see EPIC_ANOMALY_RULE_INDEX for the stable
 * numeric index of each rule, persisted alongside every violation in
 * epic_data_anomaly_violations so violations can be counted/queried per rule):
 *  - a. status ∈ {Cancelled, To Do, In PO, Backlog}: EXEMPT from every rule below (a fresh/parked
 *       Epic legitimately has incomplete data — Backlog matches validator.ts's own exemption).
 *  - R1 MISSING_START_DATE — status ≥ In Progress (DEV) and no Start Date (T1) → anomaly.
 *  - R2 PENDING_TOO_LONG — status = Pending, working days from Start Date (T1) to `now` ≥ 20% of
 *       the Epic's TTM-CNTT working-day budget (CT-Lv12's budget when the Epic's own type can't be
 *       resolved) → anomaly. Falls back to the Jira creation date as the anchor when T1 itself is
 *       missing (a Pending Epic that never got a Start Date is exactly the stale case this rule
 *       exists to catch).
 *  - R3 DATE_OUT_OF_SEQUENCE — date sequence must hold for whichever of these are present:
 *       Idea Approved Date ≤ Start Date < R4G Date ≤ Due Date. Any inversion → anomaly (one
 *       violation per bad pair). R4G Date == Due Date is allowed (not an anomaly) — that's the
 *       normal case for an Epic released the same day it hits R4GOLIVE. The Epic's created date is
 *       NOT checked against Idea Approved Date (a later Idea Approved Date than created is normal).
 *  - R4 MISSING_REQUEST_TYPE — missing Phân loại yêu cầu (request type) → anomaly ("" or "none").
 *  - R5 MISSING_REQUIREMENT_LEVEL — missing Requirement Level → anomaly ("" or "none").
 *  - R6 SP_LEVEL_MISMATCH — Epic's resolved complexity is SP (SP-Lv12/SP-Lv34, i.e. request type
 *       not Tính năng mới/Cải tiến/blank) but Requirement Level = 1 or 2 → anomaly. SP-type
 *       requests are expected to always be higher complexity (level 3-4); an SP Epic sitting at
 *       level 1-2 signals a request-type or level entered by mistake.
 *  An Epic can carry several violations at once; the caller shows the full list so the user knows
 *  exactly what to fix.
 */
export type EpicAnomalyCode =
  | 'MISSING_START_DATE'
  | 'PENDING_TOO_LONG'
  | 'DATE_OUT_OF_SEQUENCE'
  | 'MISSING_REQUEST_TYPE'
  | 'MISSING_REQUIREMENT_LEVEL'
  | 'SP_LEVEL_MISMATCH';

/** Stable numeric index (R1-R6) for each rule — persisted with every violation
 * (epic_data_anomaly_violations.rule_index) so stats can be grouped by rule without depending on
 * the rule's text code or message wording. Never renumber an existing code; add new rules at the
 * end. */
export const EPIC_ANOMALY_RULE_INDEX: Record<EpicAnomalyCode, number> = {
  MISSING_START_DATE: 1,
  PENDING_TOO_LONG: 2,
  DATE_OUT_OF_SEQUENCE: 3,
  MISSING_REQUEST_TYPE: 4,
  MISSING_REQUIREMENT_LEVEL: 5,
  SP_LEVEL_MISMATCH: 6,
};

export interface EpicAnomalyViolation {
  code: EpicAnomalyCode;
  /** See EPIC_ANOMALY_RULE_INDEX — same value as EPIC_ANOMALY_RULE_INDEX[code], carried on the
   * violation itself so callers/persistence never need a second lookup. */
  ruleIndex: number;
  /** Actionable Vietnamese message — shown to the user as "what to complete". */
  message: string;
}

export interface EpicAnomalyInput {
  dueDate: string | null;
  /** Resolved Epic complexity (CT-Lv12/CT-Lv34/SP-Lv12/SP-Lv34) — the caller resolves it (see
   * computeEpicComplexity in import-service.ts). Only consulted for rule R6. */
  epicComplexityType: EpicComplexity | null;
  ideaApprovedDate: string | null;
  /** issues.jira_created_at — a "YYYY-MM-DD" date or a full timestamp; only the date part is used. */
  jiraCreatedAt: string | null;
  r4gDate: string | null;
  /** "Phân loại yêu cầu" — epic_request_type raw text. */
  requestType: string | null;
  /** "Requirement Level" — epic_request_level raw text. */
  requirementLevel: string | null;
  startDate: string | null;
  status: string;
  /** TTM-CNTT working-day budget for this Epic's complexity — the caller resolves it (and passes
   * CT-Lv12's budget when the Epic's own type is indeterminate). Only consulted for rule R2. */
  ttmCnttWorkingDays: number | null;
}

/** Rule R2: pending this many × TTM-CNTT budget is treated as stale. */
const PENDING_STALE_RATIO = 0.2;

/** "In Progress" normalizes to DEV in the Epic workflow order. */
const IN_PROGRESS_INDEX = epicWorkflowStatusIndex('DEV');

/** Rule R6: SP-type Epics sitting at Requirement Level 1-2 are a mismatch. */
const SP_MISMATCH_LEVELS = new Set(['1', '2']);

function isBlank(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLocaleLowerCase('en-US');
  return normalized === '' || normalized === 'none';
}

function violation(code: EpicAnomalyCode, message: string): EpicAnomalyViolation {
  return { code, message, ruleIndex: EPIC_ANOMALY_RULE_INDEX[code] };
}

/** A "YYYY-MM-DD" date or a "YYYY-MM-DD ..." timestamp → the "YYYY-MM-DD" part (lexical == chronological). */
function dateOnly(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, 10) : null;
}

export function evaluateEpicDataAnomaly(input: EpicAnomalyInput, now: Date, holidays: HolidaySet): EpicAnomalyViolation[] {
  const violations: EpicAnomalyViolation[] = [];
  const normalizedStatus = normalizeEpicWorkflowStatus(input.status);

  // Rule a — Cancelled / To Do / In PO / Backlog are fully exempt from every anomaly rule.
  if (isCancelledStatus(input.status) || normalizedStatus === 'TO DO' || normalizedStatus === 'IN PO' || normalizedStatus === 'BACKLOG') {
    return violations;
  }

  const pending = isPendingStatus(input.status);
  const statusIndex = epicWorkflowStatusIndex(input.status);
  const created = dateOnly(input.jiraCreatedAt);
  const t0 = dateOnly(input.ideaApprovedDate);
  const t1 = dateOnly(input.startDate);
  const r4g = dateOnly(input.r4gDate);
  const due = dateOnly(input.dueDate);

  if (pending) {
    // R2 — Pending too long: anchor on Start Date (T1); fall back to the Jira creation date when
    // T1 itself is missing (a Pending Epic that never got a Start Date is exactly the stale case
    // this rule exists to catch — the 2026-09-22 rule change dropped the "AND missing T0/T1" gate,
    // so this now fires purely on elapsed time from the anchor).
    const anchor = t1 ?? created;
    if (anchor && input.ttmCnttWorkingDays) {
      const elapsedWorkingDays = diffWorkingDays(new Date(`${anchor}T00:00:00`), now, holidays);
      const threshold = PENDING_STALE_RATIO * input.ttmCnttWorkingDays;
      if (elapsedWorkingDays >= threshold) {
        const anchorLabel = t1 ? 'Start Date (T1)' : 'ngày tạo Jira (Epic Pending chưa có Start Date)';
        violations.push(violation('PENDING_TOO_LONG', `Epic Pending đã quá ${Math.round(threshold)} ngày làm việc (20% chu trình TTM-CNTT) kể từ ${anchorLabel}`));
      }
    }
  } else {
    // R1 — status ≥ In Progress must have a Start Date.
    if (statusIndex >= IN_PROGRESS_INDEX && !t1) {
      violations.push(violation('MISSING_START_DATE', 'Thiếu Start Date (T1) — Epic đã qua giai đoạn In Progress'));
    }
  }

  // R3 — T0 ≤ T1 < R4G ≤ Due, for the values that are present. created vs T0 is NOT checked
  // (a later Idea Approved Date than the Jira creation date is normal); R4G == Due is allowed.
  // An Epic can break more than one of these pairs at once (e.g. T0 > T1 AND R4G > Due) — all
  // such breaks are collected into ONE combined DATE_OUT_OF_SEQUENCE violation rather than one
  // violation per pair, because epic_data_anomaly_violations stores at most one row per
  // (epic_key, rule_code) (see recordEpicDataAnomalyViolations): pushing more than one violation
  // with this same code for the same epic would upsert two rows onto that same conflict target
  // within a single statement, which Postgres rejects outright.
  const dateOrderBreaks: string[] = [];
  if (t0 && t1 && t0 > t1) dateOrderBreaks.push('Ngày duyệt ý tưởng (T0) muộn hơn Start Date (T1)');
  if (t1 && r4g && t1 >= r4g) dateOrderBreaks.push('Start Date (T1) không sớm hơn R4G Date');
  if (r4g && due && r4g > due) dateOrderBreaks.push('R4G Date muộn hơn Due Date');
  if (dateOrderBreaks.length > 0) {
    violations.push(violation('DATE_OUT_OF_SEQUENCE', `Sai thứ tự ngày: ${dateOrderBreaks.join('; ')}`));
  }

  // R4/R5 — classification fields.
  if (isBlank(input.requestType)) violations.push(violation('MISSING_REQUEST_TYPE', 'Thiếu Phân loại yêu cầu'));
  if (isBlank(input.requirementLevel)) violations.push(violation('MISSING_REQUIREMENT_LEVEL', 'Thiếu Requirement Level'));

  // R6 — SP-type Epic (request type not Tính năng mới/Cải tiến/blank) but Requirement Level 1-2.
  const isSpComplexity = (input.epicComplexityType ?? '').startsWith('SP-');
  const requirementLevelNormalized = (input.requirementLevel ?? '').trim();
  if (isSpComplexity && SP_MISMATCH_LEVELS.has(requirementLevelNormalized)) {
    violations.push(violation('SP_LEVEL_MISMATCH', `Epic được đánh giá độ phức tạp Sản phẩm (${input.epicComplexityType}) nhưng Requirement Level = ${requirementLevelNormalized} — không phù hợp với loại yêu cầu Sản phẩm`));
  }

  return violations;
}

export function hasDataAnomaly(input: EpicAnomalyInput, now: Date, holidays: HolidaySet): boolean {
  return evaluateEpicDataAnomaly(input, now, holidays).length > 0;
}

/**
 * Whether Start Date is missing or chronologically nonsense relative to R4G Date — the only
 * condition that makes the TTM-CNTT early/late/fail calculation itself unreliable enough to force
 * alertLevel to 'NONE' rather than risk showing a falsely-clean result (e.g. R4G Date before Start
 * Date would otherwise compute a bogus "on time"). Deliberately much narrower than
 * evaluateEpicDataAnomaly(): a missing Requirement Level, missing T0, or a Pending Epic sitting too
 * long has no bearing on this specific calculation and must never suppress a genuine Cảnh báo
 * sớm/muộn/Fail TTM-CNTT badge — that was the 2026-09 regression this function fixes (rules b/c/d/f
 * being folded into a single "suppress alertLevel" switch hid the alert on most real Epics, which
 * are still missing Requirement Level / Idea Approved Date for unrelated reasons).
 */
export function breaksTtmCnttCalculation(input: Pick<EpicAnomalyInput, 'r4gDate' | 'startDate'>): boolean {
  const t1 = dateOnly(input.startDate);
  const r4g = dateOnly(input.r4gDate);
  return !t1 || Boolean(r4g && r4g < t1);
}

/**
 * Whether Due Date is chronologically nonsense relative to Idea Approved Date (T0) — the only
 * condition that makes the TTM-E2E Fail calculation itself unreliable (resolveTtmE2eRelease
 * already falls back T0 → Jira creation date on its own, so a merely-missing T0 is never a problem
 * here). Same narrow-vs-evaluateEpicDataAnomaly() reasoning as breaksTtmCnttCalculation above —
 * this must never be the full 6-rule anomaly flag, or a missing Requirement Level would hide a
 * genuine Fail TTM-E2E badge.
 */
export function breaksTtmE2eCalculation(input: Pick<EpicAnomalyInput, 'dueDate' | 'ideaApprovedDate'>): boolean {
  const t0 = dateOnly(input.ideaApprovedDate);
  const due = dateOnly(input.dueDate);
  return Boolean(t0 && due && due < t0);
}
