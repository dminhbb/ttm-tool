import { addWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { computeTtmAlert, resolveOffsetRule } from '@/lib/ttm-rules';
import type { AlertLevel, EpicComplexity, OffsetRule } from '@/lib/ttm-rules';
import type { StatusAlertRule } from '@/lib/status-alert-rule-types';
import type { BaselineMilestone, ComplianceFinding, ComplianceIssueInput, ComplianceIssueResult, ComplianceState } from '@/lib/epic-compliance-types';

const TTM_E2E_TARGET_DAYS: Record<EpicComplexity, number> = { SIMPLE: 30, COMPLEX: 50 };
const TTM_CNTT_TARGET_DAYS: Record<EpicComplexity, number> = { SIMPLE: 15, COMPLEX: 30 };
const RELEASED_STATUS = /released/i;
const R4G_STATUS = /ready\s*for\s*golive|r4g/i;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function makeRuleMilestone(startDate: Date | null, rule: OffsetRule | null, holidays: HolidaySet): BaselineMilestone | null {
  if (!startDate || !rule) return null;
  return {
    date: toDateString(addWorkingDays(startDate, rule.failOffset, holidays)),
    earlyAlertDate: toDateString(addWorkingDays(startDate, rule.earlyOffset, holidays)),
    lateAlertDate: toDateString(addWorkingDays(startDate, rule.lateOffset, holidays)),
    rule,
  };
}

function addHierarchyFindings(input: ComplianceIssueInput, findings: ComplianceFinding[]): void {
  if (input.issueType === 'STORY' && !input.epicKey) {
    findings.push({ code: 'MISSING_EPIC_LINK', message: 'Story chưa có Epic Link.', severity: 'WARNING' });
  }
  if (input.issueType === 'SUBTASK') {
    if (!input.parentKey) findings.push({ code: 'MISSING_PARENT', message: 'Subtask chưa có Story cha.', severity: 'WARNING' });
    if (!input.epicKey) findings.push({ code: 'MISSING_EPIC_LINK', message: 'Subtask chưa xác định Epic gốc.', severity: 'WARNING' });
  }
}

function stateFromAlert(alertLevel: AlertLevel): ComplianceState {
  if (alertLevel === 'FAIL') return 'NON_COMPLIANT';
  if (alertLevel === 'EARLY' || alertLevel === 'LATE') return 'AT_RISK';
  return 'COMPLIANT';
}

/**
 * Pure centralized rule engine. Consumers provide the active configured rules and
 * holidays; no API/page may duplicate its baseline or compliance calculations.
 */
export function evaluateIssueCompliance(
  input: ComplianceIssueInput,
  evaluatedAt: Date,
  holidays: HolidaySet,
  statusAlertRules: StatusAlertRule[],
): ComplianceIssueResult {
  const findings: ComplianceFinding[] = [];
  addHierarchyFindings(input, findings);

  if (input.issueType !== 'EPIC') {
    return {
      alertLevel: 'NONE',
      baseline: { design: null, inProgress: null, r4g: null, released: null },
      compliance: findings.length > 0 ? 'AT_RISK' : 'NOT_APPLICABLE',
      findings,
      issueKey: input.issueKey,
      issueType: input.issueType,
      status: input.status,
    };
  }

  const complexity = input.epicComplexityType ?? 'SIMPLE';
  const startDate = toDate(input.startDate);
  const ideaApprovedDate = toDate(input.ideaApprovedDate);
  const r4gDate = toDate(input.r4gDate);
  const dueDate = toDate(input.dueDate);
  const designRule = resolveOffsetRule(complexity, 'Design', statusAlertRules);
  const inProgressRule = resolveOffsetRule(complexity, 'In Progress', statusAlertRules);
  const configuredTargetOffset = Math.max(
    TTM_CNTT_TARGET_DAYS[complexity],
    ...statusAlertRules
      .filter((rule) => rule.epicComplexityType === complexity)
      .map((rule) => rule.failOffsetDays),
  );
  const targetR4gDate = startDate ? addWorkingDays(startDate, configuredTargetOffset, holidays) : null;
  const releaseTargetDate = ideaApprovedDate ? addWorkingDays(ideaApprovedDate, TTM_E2E_TARGET_DAYS[complexity], holidays) : null;

  if (!startDate) {
    findings.push({ code: 'MISSING_START_DATE', message: 'Epic thiếu Start Date (T1), chưa thể tính TTM-CNTT.', severity: 'ERROR' });
  }
  if (!ideaApprovedDate) {
    findings.push({ code: 'MISSING_IDEA_APPROVED_DATE', message: 'Epic thiếu ngày duyệt ý tưởng (T0), chưa thể tính baseline Released.', severity: 'WARNING' });
  }
  if (R4G_STATUS.test(input.status) && !r4gDate) {
    findings.push({ code: 'MISSING_R4G_DATE', message: 'Epic đã ở trạng thái R4G nhưng chưa có R4G Date.', severity: 'WARNING' });
  }
  if (RELEASED_STATUS.test(input.status) && !dueDate) {
    findings.push({ code: 'MISSING_DUE_DATE', message: 'Epic đã Released nhưng chưa có Due Date.', severity: 'WARNING' });
  }
  if (r4gDate && targetR4gDate && r4gDate.getTime() > targetR4gDate.getTime()) {
    findings.push({ code: 'R4G_AFTER_TARGET', message: 'R4G Date muộn hơn baseline TTM-CNTT.', severity: 'ERROR' });
  }
  if (dueDate && releaseTargetDate && dueDate.getTime() > releaseTargetDate.getTime()) {
    findings.push({ code: 'RELEASE_AFTER_TARGET', message: 'Due Date muộn hơn baseline TTM-E2E.', severity: 'WARNING' });
  }

  const currentRule = resolveOffsetRule(complexity, input.status, statusAlertRules);
  const computed = computeTtmAlert({
    complexity,
    currentDate: evaluatedAt,
    holidays,
    r4gDate,
    startDate,
    status: input.status,
    statusAlertRules,
    targetR4gDate,
  });
  const alertLevel = computed.level;
  const compliance = !startDate
    ? 'NOT_EVALUABLE'
    : stateFromAlert(alertLevel);

  if (currentRule === null && startDate && !r4gDate && !RELEASED_STATUS.test(input.status)) {
    findings.push({ code: 'NO_ACTIVE_STATUS_RULE', message: 'Status hiện tại chưa có rule cảnh báo active; chỉ đánh giá baseline R4G.', severity: 'INFO' });
  }

  return {
    alertLevel,
    baseline: {
      design: makeRuleMilestone(startDate, designRule, holidays),
      inProgress: makeRuleMilestone(startDate, inProgressRule, holidays),
      r4g: { date: toDateString(targetR4gDate) },
      released: { date: toDateString(releaseTargetDate) },
    },
    compliance,
    findings,
    issueKey: input.issueKey,
    issueType: input.issueType,
    status: input.status,
  };
}
