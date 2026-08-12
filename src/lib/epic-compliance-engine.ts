import { addWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { computeTtmAlert, resolveOffsetRule } from '@/lib/ttm-rules';
import type { AlertLevel, OffsetRule } from '@/lib/ttm-rules';
import { findActiveTtmPolicy } from '@/lib/ttm-policy-service';
import type { TtmPolicy } from '@/lib/ttm-policy-types';
import type { StatusAlertRule } from '@/lib/status-alert-rule-types';
import type { BaselineMilestone, ComplianceFinding, ComplianceIssueInput, ComplianceIssueResult, ComplianceState, TtmBaseline } from '@/lib/epic-compliance-types';

const RELEASED_STATUS = /released/i;
const R4G_STATUS = /ready\s*for\s*golive|r4g/i;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function toDateString(value: Date | null): string | null { return value ? value.toISOString().slice(0, 10) : null; }
function fieldDate(input: ComplianceIssueInput, field: string): Date | null {
  const normalized = field.trim().toLocaleUpperCase('en-US').replace(/[ _-]+/g, '');
  if (['IDEAAPPROVEDDATE', 'IDEAAPPROVED'].includes(normalized)) return toDate(input.ideaApprovedDate);
  if (['STARTDATE', 'START'].includes(normalized)) return toDate(input.startDate);
  if (['R4GDATE', 'R4G', 'READY4GOLIVEDATE'].includes(normalized)) return toDate(input.r4gDate);
  if (['DUEDATE', 'DUE'].includes(normalized)) return toDate(input.dueDate);
  return null;
}
function ttmBaseline(input: ComplianceIssueInput, policy: TtmPolicy | null, holidays: HolidaySet): TtmBaseline {
  if (!policy) return { fromDate: null, fromField: null, targetDate: null, toField: null, workingDays: null };
  const from = fieldDate(input, policy.fromTtmField);
  return { fromDate: toDateString(from), fromField: policy.fromTtmField, targetDate: toDateString(from ? addWorkingDays(from, policy.workingDays, holidays) : null), toField: policy.toTtmField, workingDays: policy.workingDays };
}
function makeRuleMilestone(startDate: Date | null, rule: OffsetRule | null, holidays: HolidaySet): BaselineMilestone | null {
  if (!startDate || !rule) return null;
  return { date: null, earlyAlertDate: toDateString(addWorkingDays(startDate, rule.earlyOffset, holidays)), lateAlertDate: toDateString(addWorkingDays(startDate, rule.lateOffset, holidays)), rule };
}
function addHierarchyFindings(input: ComplianceIssueInput, findings: ComplianceFinding[]): void {
  if (input.issueType === 'STORY' && !input.epicKey) findings.push({ code: 'MISSING_EPIC_LINK', message: 'Story chưa có Epic Link.', severity: 'WARNING' });
  if (input.issueType === 'SUBTASK') {
    if (!input.parentKey) findings.push({ code: 'MISSING_PARENT', message: 'Subtask chưa có Story cha.', severity: 'WARNING' });
    if (!input.epicKey) findings.push({ code: 'MISSING_EPIC_LINK', message: 'Subtask chưa xác định Epic gốc.', severity: 'WARNING' });
  }
}
function stateFromAlert(level: AlertLevel): ComplianceState { return level === 'FAIL' ? 'NON_COMPLIANT' : level === 'EARLY' || level === 'LATE' ? 'AT_RISK' : 'COMPLIANT'; }

/** Pure rule engine; TTM deadlines come only from active TTM policies. */
export function evaluateIssueCompliance(input: ComplianceIssueInput, evaluatedAt: Date, holidays: HolidaySet, statusAlertRules: StatusAlertRule[], ttmPolicies: TtmPolicy[] = []): ComplianceIssueResult {
  const findings: ComplianceFinding[] = [];
  addHierarchyFindings(input, findings);
  const emptyTtm: TtmBaseline = { fromDate: null, fromField: null, targetDate: null, toField: null, workingDays: null };
  if (input.issueType !== 'EPIC') return { alertLevel: 'NONE', baseline: { design: null, inProgress: null, r4g: null, released: null }, compliance: findings.length ? 'AT_RISK' : 'NOT_APPLICABLE', findings, issueKey: input.issueKey, issueType: input.issueType, status: input.status, ttm: { cntt: emptyTtm, e2e: emptyTtm } };

  const complexity = input.epicComplexityType ?? 'SIMPLE';
  const startDate = toDate(input.startDate);
  const r4gDate = toDate(input.r4gDate);
  const dueDate = toDate(input.dueDate);
  const cntt = ttmBaseline(input, findActiveTtmPolicy(ttmPolicies, 'TTM_CNTT', complexity), holidays);
  const e2e = ttmBaseline(input, findActiveTtmPolicy(ttmPolicies, 'TTM_E2E', complexity), holidays);
  if (!cntt.workingDays) findings.push({ code: 'NO_ACTIVE_TTM_CNTT_POLICY', message: 'Chưa có tiêu chí TTM-CNTT active cho loại Epic này.', severity: 'ERROR' });
  if (!cntt.fromDate) findings.push({ code: 'MISSING_TTM_CNTT_FROM_DATE', message: 'Epic thiếu ngày bắt đầu theo tiêu chí TTM-CNTT.', severity: 'ERROR' });
  if (!e2e.workingDays) findings.push({ code: 'NO_ACTIVE_TTM_E2E_POLICY', message: 'Chưa có tiêu chí TTM-E2E active cho loại Epic này.', severity: 'WARNING' });
  if (!e2e.fromDate) findings.push({ code: 'MISSING_TTM_E2E_FROM_DATE', message: 'Epic thiếu ngày bắt đầu theo tiêu chí TTM-E2E.', severity: 'WARNING' });
  if (R4G_STATUS.test(input.status) && !r4gDate) findings.push({ code: 'MISSING_R4G_DATE', message: 'Epic ở trạng thái R4G nhưng chưa có R4G Date.', severity: 'WARNING' });
  if (RELEASED_STATUS.test(input.status) && !dueDate) findings.push({ code: 'MISSING_DUE_DATE', message: 'Epic đã Released nhưng chưa có Due Date.', severity: 'WARNING' });
  const targetR4gDate = toDate(cntt.targetDate);
  const targetReleaseDate = toDate(e2e.targetDate);
  if (r4gDate && targetR4gDate && r4gDate > targetR4gDate) findings.push({ code: 'R4G_AFTER_TARGET', message: 'R4G Date muộn hơn baseline TTM-CNTT.', severity: 'ERROR' });
  if (dueDate && targetReleaseDate && dueDate > targetReleaseDate) findings.push({ code: 'RELEASE_AFTER_TARGET', message: 'Due Date muộn hơn baseline TTM-E2E.', severity: 'WARNING' });
  const computed = computeTtmAlert({ complexity, currentDate: evaluatedAt, holidays, r4gDate, startDate: toDate(cntt.fromDate), status: input.status, statusAlertRules, targetR4gDate });
  if (resolveOffsetRule(complexity, input.status, statusAlertRules) === null && cntt.fromDate && !r4gDate && !RELEASED_STATUS.test(input.status)) findings.push({ code: 'NO_ACTIVE_STATUS_RULE', message: 'Status hiện tại chưa có rule cảnh báo active.', severity: 'INFO' });
  return { alertLevel: computed.level, baseline: { design: makeRuleMilestone(startDate, resolveOffsetRule(complexity, 'Design', statusAlertRules), holidays), inProgress: makeRuleMilestone(startDate, resolveOffsetRule(complexity, 'In Progress', statusAlertRules), holidays), r4g: { date: cntt.targetDate }, released: { date: e2e.targetDate } }, compliance: !cntt.fromDate ? 'NOT_EVALUABLE' : stateFromAlert(computed.level), findings, issueKey: input.issueKey, issueType: input.issueType, status: input.status, ttm: { cntt, e2e } };
}
