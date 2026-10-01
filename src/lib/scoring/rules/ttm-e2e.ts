import { STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding } from '../types';

/**
 * Axis TTM_E2E — T0 (Idea Approved Date, else Jira creation date) → end date (R4G Date, or Due Date
 * when the TTM_E2E policy's to_ttm_field says so — "Tiêu chí Time to Market"). Rule of 2026-10-01,
 * same shape as TTM-CNTT: Target_E2E = T0 +wd (N − 1); Fail when the end date is past Target, or
 * there is none yet and asOf is past Target; Đạt when the end date is recorded, already reached
 * (≤ asOf) and ≤ Target — a status still below R4GOLIVE keeps the pass and adds "Sai Status". An Epic
 * with "Sai lệch dữ liệu" is not judged at all.
 */
export const ttmE2eRule: PrimaryRule = ({ facts, derived, ctx, hasDataAnomaly }) => {
  const findings: Finding[] = [];
  const target = derived.e2eTargetDate;
  const end = derived.e2eEndDate;
  const evidence = {
    baselineSourceDate: derived.e2eBaselineSourceDate,
    targetDate: target,
    endDate: end,
    budgetWorkingDays: derived.e2eBudgetWorkingDays,
  };

  if (derived.e2eBaselineFromJiraCreated) {
    findings.push(finding('E2E_BASELINE_FROM_JIRA_CREATED', 'Thiếu Idea Approved Date — T0 tính từ ngày tạo Epic trên Jira.', evidence));
  }
  if (derived.e2eCalcBroken) {
    findings.push(finding('E2E_CALC_BROKEN', 'R4G Date sớm hơn Idea Approved Date — không tính được TTM-E2E.', { ideaApprovedDate: facts.ideaApprovedDate, r4gDate: facts.r4gDate }));
  }
  if (!target || derived.isCancelled || hasDataAnomaly) return findings;

  if (end) {
    if (end > target) {
      findings.push(finding('E2E_FAIL', `Ngày kết thúc TTM-E2E ${end} muộn hơn Target ${target}.`, evidence));
    } else if (end <= ctx.asOf && derived.e2eBaselineSourceDate && end >= derived.e2eBaselineSourceDate) {
      findings.push(finding('E2E_PASS', `Đạt TTM-E2E: kết thúc ${end} ≤ Target ${target}.`, evidence));
      if (derived.statusIndex < STATUS_INDEX.R4GOLIVE) {
        findings.push(finding('E2E_STATUS_MISMATCH', 'TTM-E2E đã đạt theo ngày ghi nhận nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status.', evidence));
      }
    }
    return findings;
  }
  if (ctx.asOf > target) findings.push(finding('E2E_FAIL', `Đã quá Target TTM-E2E ${target} mà chưa có ngày kết thúc.`, evidence));
  return findings;
};
