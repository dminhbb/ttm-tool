import { diffWorkingDays, toIsoDate } from '../dates';
import { isCancelledStatus, isPendingStatus, normalizeWorkflowStatus, STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding, ScoringContext } from '../types';

/** Cancelled + the configurable list (default To Do / In PO / Backlog) skip the data-quality rules —
 * except R8, which only Cancelled skips (see dataQualityRule). */
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
 * axis) plus R8/R9 (R4G Date vs status, added 2026-10-04). R1/R3–R6/R8/R9 are ALERT ("Sai lệch dữ
 * liệu"); R2 "Pending lâu" is a RECOMMENDATION since 2026-09-29 and no longer counts as a data
 * anomaly. Rule change 2026-10-04: R1 starts at DESIGN (was DEV), R5 only applies past DESIGN.
 * Rule change 2026-10-05: R8 only once the R4G Date has been reached (a future one is a plan), and
 * the workflow knows Pilot / Done / Reopened (derive.ts), so R9 no longer hits unrecognized statuses;
 * R8 also applies to the exempt statuses (To Do / In PO / Backlog); R1 also applies to Pending.
 */
export const dataQualityRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  const r4g = facts.r4gDate;
  // R8 — an R4G Date already reached means status ≥ R4GOLIVE. It applies to the exempt statuses too
  // (To Do / In PO / Backlog — owner rule 2026-10-05), only not to Cancelled: every Epic whose R4G
  // Date has passed while its status is still behind is "Sai lệch dữ liệu". An R4G Date still in the
  // future is a planned date (allowed to be entered ahead): no anomaly, and the Epic stays "chưa kết
  // luận" until asOf reaches it.
  // (Backlog is exempt but not a workflow step — it counts as "chưa tới R4GOLIVE" like To Do / In PO.)
  const exempt = isExemptFromDataQuality(facts.status, ctx);
  if (r4g && r4g <= ctx.asOf && (derived.statusIndex < STATUS_INDEX.R4GOLIVE || exempt) && !isCancelledStatus(facts.status)) {
    findings.push(finding('ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', `R4G Date (${r4g}) đã tới nhưng status Epic (${facts.status}) chưa tới R4GOLIVE`, { r4gDate: r4g, status: facts.status }));
  }
  if (exempt) return findings;
  const { holidays } = ctx;
  const t0 = facts.ideaApprovedDate;
  const t1 = facts.startDate;
  const due = facts.dueDate;
  const pending = isPendingStatus(facts.status);

  if (pending) {
    // R2 — anchored on T1, falling back to the Jira creation date when T1 is missing.
    const anchor = t1 ?? toIsoDate(facts.jiraCreatedAt);
    const budget = derived.cnttBudgetWorkingDays;
    if (anchor && budget) {
      const elapsed = diffWorkingDays(anchor, ctx.asOf, holidays);
      const threshold = ctx.parameters['anomaly.pendingStaleRatio'] * budget;
      if (elapsed >= threshold) {
        findings.push(finding('ANOMALY_R2_PENDING_TOO_LONG', `Epic Pending đã ${elapsed} ngày làm việc (ngưỡng ${Math.round(threshold)} ngày = ${Math.round(ctx.parameters['anomaly.pendingStaleRatio'] * 100)}% chu trình TTM-CNTT (QLDA)) kể từ ${t1 ? 'Start Date (T1)' : 'ngày tạo Jira'} — cân nhắc tiếp tục hoặc huỷ Epic.`, { anchorDate: anchor, elapsedWorkingDays: elapsed, thresholdWorkingDays: threshold }));
      }
    }
  }
  // R1 — every status from Design on must have a Start Date. Pending / Reopened rank level with In
  // Progress, so they are included (Pending since 2026-10-05: without it a Pending Epic with no Start
  // Date had no Target and could never be judged on TTM-CNTT).
  if (derived.statusIndex >= STATUS_INDEX.DESIGN && !t1) {
    findings.push(finding('ANOMALY_R1_MISSING_START_DATE', 'Thiếu Start Date (T1) — Epic đã từ giai đoạn Design trở đi.'));
  }

  const breaks: string[] = [];
  if (t0 && t1 && t0 > t1) breaks.push('Ngày duyệt ý tưởng (T0) muộn hơn Start Date (T1)');
  if (t1 && r4g && t1 >= r4g) breaks.push('Start Date (T1) không sớm hơn R4G Date');
  if (r4g && due && r4g > due) breaks.push('R4G Date muộn hơn Due Date');
  if (breaks.length) findings.push(finding('ANOMALY_R3_DATE_OUT_OF_SEQUENCE', `Sai thứ tự ngày: ${breaks.join('; ')}`, { ideaApprovedDate: t0, startDate: t1, r4gDate: r4g, dueDate: due }));

  if (isBlank(facts.requestType)) findings.push(finding('ANOMALY_R4_MISSING_REQUEST_TYPE', 'Thiếu Phân loại yêu cầu'));
  // R5 — only once the Epic is past DESIGN (the level is still being settled during Design).
  if (isBlank(facts.requirementLevel) && derived.statusIndex > STATUS_INDEX.DESIGN) findings.push(finding('ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', 'Thiếu Requirement Level'));

  const level = (facts.requirementLevel ?? '').trim();
  if ((facts.complexity ?? '').startsWith('SP-') && ctx.parameters['anomaly.spMismatchLevels'].includes(level)) {
    findings.push(finding('ANOMALY_R6_SP_LEVEL_MISMATCH', `Epic được đánh giá độ phức tạp Sản phẩm (${facts.complexity}) nhưng Requirement Level = ${level} — không phù hợp với loại yêu cầu Sản phẩm`));
  }

  // R9 — the other direction of R8: a status at R4GOLIVE or later needs an R4G Date. Limited to the
  // workflow's own statuses (R4GOLIVE … RELEASED), so an unrecognized status is never flagged.
  if (!r4g && derived.statusIndex >= STATUS_INDEX.R4GOLIVE && derived.statusIndex <= STATUS_INDEX.RELEASED) {
    findings.push(finding('ANOMALY_R9_MISSING_R4G_DATE', `Status Epic (${facts.status}) đã từ R4GOLIVE trở lên nhưng chưa có R4G Date`, { status: facts.status }));
  }
  return findings;
};
