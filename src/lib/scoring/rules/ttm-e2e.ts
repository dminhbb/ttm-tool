import { normalizeWorkflowStatus } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding } from '../types';

/**
 * Axis TTM_E2E — T0 (Idea Approved Date, else Jira creation date) → end date (R4G Date, or Due Date
 * when the TTM_E2E policy's to_ttm_field says so). While the end date isn't recorded yet, the Epic
 * fails from the Target day itself (asOf ≥ Target) — the observable behavior of the live legacy
 * screens, kept as-is.
 */
export const ttmE2eRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  const target = derived.e2eTargetDate;
  const evidence = {
    baselineSourceDate: derived.e2eBaselineSourceDate,
    targetDate: target,
    actualToDate: derived.e2eActualToDate,
    budgetWorkingDays: derived.e2eBudgetWorkingDays,
  };

  if (derived.e2eBaselineFromJiraCreated) {
    findings.push(finding('E2E_BASELINE_FROM_JIRA_CREATED', 'Thiếu Idea Approved Date — T0 tính từ ngày tạo Epic trên Jira.', evidence));
  }
  if (derived.e2eCalcBroken) {
    findings.push(finding('E2E_CALC_BROKEN', 'R4G Date sớm hơn Idea Approved Date — không tính được TTM-E2E.', { ideaApprovedDate: facts.ideaApprovedDate, r4gDate: facts.r4gDate }));
  }
  if (!target || derived.isCancelled) return findings;

  const failed = derived.e2eEndRecorded && derived.e2eEndDate ? derived.e2eEndDate > target : ctx.asOf >= target;

  if (failed) {
    findings.push(finding('E2E_FAIL', `Vượt Target TTM-E2E ${target}.`, evidence));
  } else if (normalizeWorkflowStatus(facts.status) === 'RELEASED' && facts.r4gDate && derived.e2eActualToDate === facts.r4gDate) {
    findings.push(finding('E2E_PASS', `Đạt TTM-E2E: kết thúc ${facts.r4gDate} ≤ Target ${target}.`, evidence));
  }
  return findings;
};
