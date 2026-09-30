import { STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding } from '../types';

/**
 * Axis TTM_CNTT. Target_CNTT = From +wd (N − 1) (Start Date is day 1 — decision 2026-09-29, same
 * date as the R4GOLIVE phase baseline and the TTM-CNTT stripe). "Cảnh báo sớm" no longer exists.
 * Verdicts are emitted even when a gate (Cancelled / Không tính được / out of scope) applies — the
 * resolver marks them suppressed instead of dropping them.
 */
export const ttmCnttRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  const { asOf } = ctx;
  const target = derived.cnttTargetDate;
  const evidence = {
    targetDate: target,
    budgetWorkingDays: derived.cnttBudgetWorkingDays,
    remainingWorkingDays: derived.cnttRemainingWorkingDays,
    lateAlertDate: derived.cnttLateAlertDate,
  };

  if (derived.isCancelled) findings.push(finding('CNTT_NOT_APPLICABLE', 'Epic đã Cancelled — không đánh giá TTM-CNTT (QLDA).'));
  if (derived.cnttCalcBroken) {
    findings.push(finding('CNTT_CALC_BROKEN', facts.startDate
      ? 'R4G Date sớm hơn Start Date — không tính được TTM-CNTT (QLDA).'
      : 'Thiếu Start Date (T1) — không tính được TTM-CNTT (QLDA).', { startDate: facts.startDate, r4gDate: facts.r4gDate }));
  }
  if (!target || !derived.cnttFromDate) return findings;

  if (facts.r4gDate) {
    if (facts.r4gDate > target) {
      findings.push(finding('CNTT_FAIL', `R4G Date ${facts.r4gDate} muộn hơn Target TTM-CNTT (QLDA) ${target}.`, evidence));
    } else if (facts.r4gDate <= asOf) {
      if (derived.statusIndex < STATUS_INDEX.R4GOLIVE) {
        findings.push(finding('CNTT_STATUS_MISMATCH', 'R4G Date đã ghi nhận và đúng hạn nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status.', evidence));
      }
      findings.push(finding('CNTT_PASS', `Đạt TTM-CNTT (QLDA): R4G Date ${facts.r4gDate} ≤ Target ${target}.`, evidence));
    }
    return findings;
  }

  if (asOf > target) {
    findings.push(finding('CNTT_FAIL', `Đã quá Target TTM-CNTT (QLDA) ${target} mà chưa có R4G Date.`, evidence));
  } else if (derived.cnttLateAlertDate && asOf >= derived.cnttLateAlertDate) {
    findings.push(finding('CNTT_LATE', `Đã qua mốc cảnh báo muộn ${derived.cnttLateAlertDate}; Target TTM-CNTT (QLDA) ${target}.`, evidence));
  }
  return findings;
};
