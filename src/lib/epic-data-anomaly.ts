import { diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { isCancelledStatus, isPendingStatus } from '@/lib/issue-status-rules';
import { epicWorkflowStatusIndex, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';

/**
 * Single source of truth for "Epic bị sai lệch dữ liệu" — every screen (Quản trị Epic đầy đủ/rút
 * gọn, Epic in PO), Báo cáo, Dashboard and the alert timeline evaluate anomalies through
 * evaluateEpicDataAnomaly() so the flag and its reason list can never disagree between them.
 * Data-anomaly Epics are NEVER dropped at import — they're all kept and flagged so the owner can
 * complete the missing information (see aggregateBatchData / getEpicAlertRows*).
 *
 * Rules (company spec, 2026-09):
 *  - a. status ∈ {Cancelled, To Do, In PO, Backlog}: EXEMPT from every rule below (a fresh/parked
 *       Epic legitimately has incomplete data — Backlog matches validator.ts's own exemption).
 *  - b. status ≥ Design and no Idea Approved Date (T0) → anomaly.
 *  - c. status ≥ In Progress (DEV) and no Start Date (T1) → anomaly.
 *  - d. status = Pending, working days from the Jira creation date to `now` ≥ 20% of the Epic's
 *       TTM-CNTT working-day budget (CT-Lv12's budget when the Epic's own type can't be resolved),
 *       and it's missing T0 or T1 → anomaly.
 *  - e. date sequence must hold for whichever of these are present:
 *       created ≤ Idea Approved Date ≤ Start Date < R4G Date < Due Date. Any inversion → anomaly
 *       (one violation per bad pair).
 *  - f. missing Phân loại yêu cầu (request type) or Requirement Level → anomaly ("" or "none").
 *  An Epic can carry several violations at once; the caller shows the full list so the user knows
 *  exactly what to fix.
 */
export type EpicAnomalyCode =
  | 'MISSING_IDEA_APPROVED_DATE'
  | 'MISSING_START_DATE'
  | 'PENDING_STALE_MISSING_DATE'
  | 'DATE_OUT_OF_SEQUENCE'
  | 'MISSING_REQUEST_TYPE'
  | 'MISSING_REQUIREMENT_LEVEL';

export interface EpicAnomalyViolation {
  code: EpicAnomalyCode;
  /** Actionable Vietnamese message — shown to the user as "what to complete". */
  message: string;
}

export interface EpicAnomalyInput {
  dueDate: string | null;
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
   * CT-Lv12's budget when the Epic's own type is indeterminate). Only consulted for rule d. */
  ttmCnttWorkingDays: number | null;
}

/** Rule d: pending this many × TTM-CNTT budget without T0/T1 is treated as stale. */
const PENDING_STALE_RATIO = 0.2;

const DESIGN_INDEX = epicWorkflowStatusIndex('DESIGN');
/** "In Progress" normalizes to DEV in the Epic workflow order. */
const IN_PROGRESS_INDEX = epicWorkflowStatusIndex('DEV');

function isBlank(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLocaleLowerCase('en-US');
  return normalized === '' || normalized === 'none';
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
    // Rule d — Pending too long without T0/T1.
    if ((!t0 || !t1) && input.ttmCnttWorkingDays) {
      const elapsedWorkingDays = created ? diffWorkingDays(new Date(`${created}T00:00:00`), now, holidays) : Number.POSITIVE_INFINITY;
      const threshold = PENDING_STALE_RATIO * input.ttmCnttWorkingDays;
      if (elapsedWorkingDays >= threshold) {
        const missing = [!t0 ? 'Ngày duyệt ý tưởng (T0)' : null, !t1 ? 'Start Date (T1)' : null].filter(Boolean).join(' và ');
        violations.push({
          code: 'PENDING_STALE_MISSING_DATE',
          message: `Epic Pending đã quá ${Math.round(threshold)} ngày làm việc (20% chu trình TTM-CNTT) kể từ ngày tạo mà vẫn thiếu ${missing}`,
        });
      }
    }
  } else {
    // Rule b — status ≥ Design must have an Idea Approved Date.
    if (statusIndex >= DESIGN_INDEX && !t0) {
      violations.push({ code: 'MISSING_IDEA_APPROVED_DATE', message: 'Thiếu Ngày duyệt ý tưởng (T0) — Epic đã qua giai đoạn Design' });
    }
    // Rule c — status ≥ In Progress must have a Start Date.
    if (statusIndex >= IN_PROGRESS_INDEX && !t1) {
      violations.push({ code: 'MISSING_START_DATE', message: 'Thiếu Start Date (T1) — Epic đã qua giai đoạn In Progress' });
    }
  }

  // Rule e — created ≤ T0 ≤ T1 < R4G < Due, for the values that are present.
  if (created && t0 && created > t0) violations.push({ code: 'DATE_OUT_OF_SEQUENCE', message: 'Sai thứ tự ngày: Ngày tạo Epic muộn hơn Ngày duyệt ý tưởng (T0)' });
  if (t0 && t1 && t0 > t1) violations.push({ code: 'DATE_OUT_OF_SEQUENCE', message: 'Sai thứ tự ngày: Ngày duyệt ý tưởng (T0) muộn hơn Start Date (T1)' });
  if (t1 && r4g && t1 >= r4g) violations.push({ code: 'DATE_OUT_OF_SEQUENCE', message: 'Sai thứ tự ngày: Start Date (T1) không sớm hơn R4G Date' });
  if (r4g && due && r4g >= due) violations.push({ code: 'DATE_OUT_OF_SEQUENCE', message: 'Sai thứ tự ngày: R4G Date không sớm hơn Due Date' });

  // Rule f — classification fields.
  if (isBlank(input.requestType)) violations.push({ code: 'MISSING_REQUEST_TYPE', message: 'Thiếu Phân loại yêu cầu' });
  if (isBlank(input.requirementLevel)) violations.push({ code: 'MISSING_REQUIREMENT_LEVEL', message: 'Thiếu Requirement Level' });

  return violations;
}

export function hasDataAnomaly(input: EpicAnomalyInput, now: Date, holidays: HolidaySet): boolean {
  return evaluateEpicDataAnomaly(input, now, holidays).length > 0;
}
