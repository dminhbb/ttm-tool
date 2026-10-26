import { isReopenedStatus, STATUS_INDEX } from '../derive';
import { DEFAULT_POLICY_SET, LEGACY_30D_POLICY_SET } from '../types';
import { finding } from './rule-types';
import type { ScoringRule } from './rule-types';
import type { DerivedMetrics, Finding } from '../types';

/**
 * Axis TTM_CNTT. Target_CNTT = From +wd (N − 1) (Start Date is day 1 — decision 2026-09-29, same
 * date as the R4GOLIVE phase baseline and the TTM-CNTT stripe). "Cảnh báo sớm" no longer exists.
 * Verdicts are emitted even when a gate (Cancelled / Không tính được / out of scope) applies — the
 * resolver marks them suppressed instead of dropping them.
 *
 * Split into Rule objects (spec 2026-10-25): the gates and "Cảnh báo muộn" always run; Đạt / Fail / Sai Status are
 * the TTM_CNTT_VERDICT slot, one variant per "chuẩn" (makeTtmCnttRule).
 */

function cnttEvidence(derived: DerivedMetrics): Finding['evidence'] {
  return {
    targetDate: derived.cnttTargetDate,
    budgetWorkingDays: derived.cnttBudgetWorkingDays,
    remainingWorkingDays: derived.cnttRemainingWorkingDays,
    lateAlertDate: derived.cnttLateAlertDate,
  };
}

/** Core gates — "Không áp dụng" (Cancelled) and "Không tính được" (no T1 / R4G before T1). */
export const ttmCnttGatesRule: ScoringRule = {
  id: 'ttm-cntt-gates',
  name: 'TTM-CNTT (QLDA) — Không áp dụng / Không tính được',
  summary: 'Epic Cancelled hoặc thiếu Start Date / R4G Date sớm hơn Start Date thì không đánh giá TTM-CNTT (QLDA).',
  detail: { conditions: 'Luôn chạy. Khi có một trong hai ghi nhận này, mọi badge TTM-CNTT (QLDA) khác bị che.' },
  category: 'TTM_CNTT',
  stage: 'PRIMARY',
  core: true,
  emits: ['CNTT_NOT_APPLICABLE', 'CNTT_CALC_BROKEN'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts, derived }) => {
    const findings: Finding[] = [];
    if (derived.isCancelled) findings.push(finding('CNTT_NOT_APPLICABLE', 'Epic đã Cancelled — không đánh giá TTM-CNTT (QLDA).'));
    if (derived.cnttCalcBroken) {
      findings.push(finding('CNTT_CALC_BROKEN', facts.startDate
        ? 'R4G Date sớm hơn Start Date — không tính được TTM-CNTT (QLDA).'
        : 'Thiếu Start Date (T1) — không tính được TTM-CNTT (QLDA).', { startDate: facts.startDate, r4gDate: facts.r4gDate }));
    }
    return findings;
  },
};

export interface TtmCnttVariant {
  id: string;
  name: string;
  summary: string;
  /** "Bộ ngân sách" whose TTM_CNTT budgets give this variant's Target (spec §17). */
  policySet: string;
  history?: readonly string[];
}

/**
 * A TTM_CNTT_VERDICT variant: Đạt / Fail TTM-CNTT (QLDA) + "Sai Status". Variants that differ only by budget are one
 * call each — the logic below is the rule of 2026-09/10; a variant with different logic gets its own function.
 */
export function makeTtmCnttRule(variant: TtmCnttVariant): ScoringRule {
  return {
    id: variant.id,
    name: variant.name,
    summary: variant.summary,
    detail: {
      conditions: 'Không Sai lệch dữ liệu, không Cancelled, tính được Target (có Start Date, có ngân sách cho loại Epic). R4G Date ở tương lai không được chấm (đó là Sai lệch dữ liệu R8 / R10). Status chưa lên R4GOLIVE vẫn Đạt, kèm "Sai Status" (trừ Reopened).',
      parameters: [`Tiêu chí Time to Market — TTM_CNTT (bộ ngân sách ${variant.policySet})`],
      history: variant.history,
    },
    category: 'TTM_CNTT',
    stage: 'PRIMARY',
    core: false,
    slot: 'TTM_CNTT_VERDICT',
    emits: ['CNTT_FAIL', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'],
    defaultSelected: variant.policySet === DEFAULT_POLICY_SET,
    lifecycle: 'active',
    policySet: variant.policySet,
    gatedByDataAnomaly: true,
    evaluate: ({ facts, derived, ctx }) => {
      const target = derived.cnttTargetDate;
      if (!target || !derived.cnttFromDate) return [];
      const evidence = cnttEvidence(derived);
      if (!facts.r4gDate) {
        return ctx.asOf > target ? [finding('CNTT_FAIL', `Đã quá Target TTM-CNTT (QLDA) ${target} mà chưa có R4G Date.`, evidence)] : [];
      }
      const findings: Finding[] = [];
      if (facts.r4gDate > target) {
        findings.push(finding('CNTT_FAIL', `R4G Date ${facts.r4gDate} muộn hơn Target TTM-CNTT (QLDA) ${target}.`, evidence));
      } else if (facts.r4gDate <= ctx.asOf) {
        // On time and already reached → Đạt. A status still below R4GOLIVE doesn't take the pass away
        // (decision 2026-10-01); it adds the "Sai Status" recommendation next to it. A future-dated
        // R4G Date gets neither until asOf reaches it — and only gets here with R8 / R10 switched off:
        // since 2026-10-09 every future R4G Date is "Sai lệch dữ liệu" (data-quality.ts).
        findings.push(finding('CNTT_PASS', `Đạt TTM-CNTT (QLDA): R4G Date ${facts.r4gDate} ≤ Target ${target}.`, evidence));
        // Not for Reopened: the Epic went live and was taken back into work on purpose (2026-10-05).
        if (derived.statusIndex < STATUS_INDEX.R4GOLIVE && !isReopenedStatus(facts.status)) {
          findings.push(finding('CNTT_STATUS_MISMATCH', 'R4G Date đã ghi nhận và đúng hạn nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status.', evidence));
        }
      }
      return findings;
    },
  };
}

/** The TTM-CNTT (QLDA) rule in force since 09/2026 (owner naming, 2026-10-25). */
export const ttmCnttSep2026Rule = makeTtmCnttRule({
  id: 'ttm-cntt-sep-2026',
  name: 'TTM-CNTT (QLDA) — chuẩn 09/2026',
  summary: 'Đạt khi R4G Date đã tới và ≤ Target_CNTT = Start Date +wd (N − 1); Fail khi R4G Date muộn hơn Target, hoặc chưa có R4G Date mà đã quá Target.',
  policySet: DEFAULT_POLICY_SET,
  history: [
    '29/09/2026: Target_CNTT = Start Date +wd (N − 1); bỏ "Cảnh báo sớm".',
    '01/10/2026: status chưa lên R4GOLIVE vẫn Đạt, kèm "Sai Status"; Sai lệch dữ liệu được xét trước.',
    '04/10/2026: Fail gồm cả Epic chưa có R4G Date mà đã quá Target (vào mẫu số).',
  ],
});

/**
 * Same logic as `ttm-cntt-sep-2026`, with the budgets of the set "legacy-30d" (Tiêu chí Time to Market → Bộ ngân sách):
 * Tính năng mới/Cải tiến mức 3-4 (CT-Lv34) get 30 working days instead of 25; every other Epic type inherits DEFAULT.
 * Owner 2026-10-26: used by the Rule Groups of Epics with Start Date < 01/09/2026 or R4G Date < 01/10/2026.
 */
export const ttmCnttLegacy30dRule = makeTtmCnttRule({
  id: 'ttm-cntt-legacy-30d',
  name: 'TTM-CNTT (QLDA) — Target 30 ngày (Tính năng mới/Cải tiến L3-L4, Epic cũ)',
  summary: 'Như chuẩn 09/2026 nhưng Target_CNTT dùng bộ ngân sách "legacy-30d": Tính năng mới/Cải tiến mức 3-4 (CT-Lv34) = 30 ngày làm việc; các loại Epic khác kế thừa bộ Mặc định.',
  policySet: LEGACY_30D_POLICY_SET,
  history: ['26/10/2026: biến thể mới theo yêu cầu chủ sở hữu (Start Date < 01/09/2026 hoặc R4G Date < 01/10/2026 → 30 ngày).'],
});

/** "Cảnh báo muộn" — always runs (owner decision 2026-10-25); read off the Epic's own TTM-CNTT Target. */
export const ttmCnttLateRule: ScoringRule = {
  id: 'ttm-cntt-late',
  name: 'Cảnh báo muộn TTM-CNTT (QLDA)',
  summary: 'Chưa có R4G Date, đã qua mốc cảnh báo muộn của status hiện tại nhưng chưa quá Target_CNTT.',
  detail: {
    conditions: 'Luôn chạy. Không Sai lệch dữ liệu; bị che khi Epic Cancelled, Không tính được, Ngoài phạm vi TTM-CNTT (QLDA) hoặc nhóm rule không có rule TTM-CNTT.',
    parameters: ['Cấu hình cảnh báo — mốc cảnh báo muộn theo (loại Epic, status); DEV / TEST / PENTEST kế thừa In Progress'],
  },
  category: 'TTM_CNTT',
  stage: 'PRIMARY',
  core: true,
  emits: ['CNTT_LATE'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: true,
  evaluate: ({ facts, derived, ctx }) => {
    const target = derived.cnttTargetDate;
    if (!target || !derived.cnttFromDate || facts.r4gDate || ctx.asOf > target) return [];
    if (!derived.cnttLateAlertDate || ctx.asOf < derived.cnttLateAlertDate) return [];
    return [finding('CNTT_LATE', `Đã qua mốc cảnh báo muộn ${derived.cnttLateAlertDate}; Target TTM-CNTT (QLDA) ${target}.`, cnttEvidence(derived))];
  },
};
