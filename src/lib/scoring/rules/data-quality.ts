import { diffWorkingDays, toIsoDate } from '../dates';
import { isCancelledStatus, isPendingStatus, normalizeWorkflowStatus, STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding, ScoringContext } from '../types';

/** Cancelled + the configurable list (default To Do / In PO / Backlog) skip every data-quality rule. */
export function isExemptFromDataQuality(status: string, ctx: ScoringContext): boolean {
  if (isCancelledStatus(status)) return true;
  const normalized = normalizeWorkflowStatus(status);
  return ctx.parameters['anomaly.exemptStatuses'].some((exempt) => normalizeWorkflowStatus(exempt) === normalized);
}

function isBlank(value: string | null): boolean {
  const normalized = (value ?? '').trim().toLocaleLowerCase('en-US');
  return normalized === '' || normalized === 'none';
}

/**
 * Axis DATA_QUALITY — former anomaly rules R1–R6 (same stable numbering; R7 moved to the RELEASE
 * axis). R1/R3–R6 are ALERT ("Sai lệch dữ liệu"); R2 "Pending lâu" is a RECOMMENDATION since
 * 2026-09-29 and no longer counts as a data anomaly.
 */
export const dataQualityRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  if (isExemptFromDataQuality(facts.status, ctx)) return findings;
  const { holidays } = ctx;
  const t0 = facts.ideaApprovedDate;
  const t1 = facts.startDate;
  const r4g = facts.r4gDate;
  const due = facts.dueDate;

  if (isPendingStatus(facts.status)) {
    // R2 — anchored on T1, falling back to the Jira creation date when T1 is missing.
    const anchor = t1 ?? toIsoDate(facts.jiraCreatedAt);
    const budget = derived.cnttBudgetWorkingDays;
    if (anchor && budget) {
      const elapsed = diffWorkingDays(anchor, ctx.asOf, holidays);
      const threshold = ctx.parameters['anomaly.pendingStaleRatio'] * budget;
      if (elapsed >= threshold) {
        findings.push(finding('ANOMALY_R2_PENDING_TOO_LONG', `Epic Pending đã ${elapsed} ngày làm việc (ngưỡng ${Math.round(threshold)} ngày = ${Math.round(ctx.parameters['anomaly.pendingStaleRatio'] * 100)}% chu trình TTM-CNTT) kể từ ${t1 ? 'Start Date (T1)' : 'ngày tạo Jira'} — cân nhắc tiếp tục hoặc huỷ Epic.`, { anchorDate: anchor, elapsedWorkingDays: elapsed, thresholdWorkingDays: threshold }));
      }
    }
  } else if (derived.statusIndex >= STATUS_INDEX.DEV && !t1) {
    findings.push(finding('ANOMALY_R1_MISSING_START_DATE', 'Thiếu Start Date (T1) — Epic đã qua giai đoạn In Progress.'));
  }

  const breaks: string[] = [];
  if (t0 && t1 && t0 > t1) breaks.push('Ngày duyệt ý tưởng (T0) muộn hơn Start Date (T1)');
  if (t1 && r4g && t1 >= r4g) breaks.push('Start Date (T1) không sớm hơn R4G Date');
  if (r4g && due && r4g > due) breaks.push('R4G Date muộn hơn Due Date');
  if (breaks.length) findings.push(finding('ANOMALY_R3_DATE_OUT_OF_SEQUENCE', `Sai thứ tự ngày: ${breaks.join('; ')}`, { ideaApprovedDate: t0, startDate: t1, r4gDate: r4g, dueDate: due }));

  if (isBlank(facts.requestType)) findings.push(finding('ANOMALY_R4_MISSING_REQUEST_TYPE', 'Thiếu Phân loại yêu cầu'));
  if (isBlank(facts.requirementLevel)) findings.push(finding('ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', 'Thiếu Requirement Level'));

  const level = (facts.requirementLevel ?? '').trim();
  if ((facts.complexity ?? '').startsWith('SP-') && ctx.parameters['anomaly.spMismatchLevels'].includes(level)) {
    findings.push(finding('ANOMALY_R6_SP_LEVEL_MISMATCH', `Epic được đánh giá độ phức tạp Sản phẩm (${facts.complexity}) nhưng Requirement Level = ${level} — không phù hợp với loại yêu cầu Sản phẩm`));
  }
  return findings;
};
