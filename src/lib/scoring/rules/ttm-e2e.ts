import { isReopenedStatus, STATUS_INDEX } from '../derive';
import { DEFAULT_POLICY_SET } from '../types';
import { finding } from './rule-types';
import type { ScoringRule } from './rule-types';
import type { DerivedMetrics, Finding } from '../types';

/**
 * Axis TTM_E2E — T0 (Idea Approved Date, else Jira creation date) → end date (R4G Date, or Due Date
 * when the TTM_E2E policy's to_ttm_field says so — "Tiêu chí Time to Market"). Rule of 2026-10-01,
 * same shape as TTM-CNTT: Target_E2E = T0 +wd (N − 1); Fail when the end date is past Target, or
 * there is none yet and asOf is past Target; Đạt when the end date is recorded, already reached
 * (≤ asOf) and ≤ Target — a status still below R4GOLIVE keeps the pass and adds "Sai Status". An Epic
 * with "Sai lệch dữ liệu" is not judged at all.
 *
 * Split into Rule objects (spec 2026-10-25): the notes and "Bổ sung T0" always run; Đạt / Fail / Sai Status are the
 * TTM_E2E_VERDICT slot, one variant per "chuẩn" (makeTtmE2eRule).
 */

function e2eEvidence(derived: DerivedMetrics): Finding['evidence'] {
  return {
    baselineSourceDate: derived.e2eBaselineSourceDate,
    targetDate: derived.e2eTargetDate,
    endDate: derived.e2eEndDate,
    budgetWorkingDays: derived.e2eBudgetWorkingDays,
  };
}

/** Core notes — "Baseline từ ngày tạo Jira" and "Không tính được" (R4G before T0) — plus the "Bổ sung T0" recommendation. */
export const ttmE2eGatesRule: ScoringRule = {
  id: 'ttm-e2e-gates',
  name: 'TTM-E2E — Baseline / Không tính được / Bổ sung T0',
  summary: 'Thiếu Idea Approved Date thì T0 lấy ngày tạo Jira (kèm khuyến nghị bổ sung T0); R4G Date sớm hơn T0 thì không tính được TTM-E2E.',
  detail: { conditions: 'Luôn chạy. "Không tính được" che mọi badge TTM-E2E khác. Khuyến nghị "Bổ sung T0" không áp dụng cho Epic Cancelled.' },
  category: 'TTM_E2E',
  stage: 'PRIMARY',
  core: true,
  emits: ['E2E_BASELINE_FROM_JIRA_CREATED', 'E2E_CALC_BROKEN', 'REC_FILL_IDEA_APPROVED_DATE'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts, derived }) => {
    const findings: Finding[] = [];
    if (derived.e2eBaselineFromJiraCreated) {
      findings.push(finding('E2E_BASELINE_FROM_JIRA_CREATED', 'Thiếu Idea Approved Date — T0 tính từ ngày tạo Epic trên Jira.', e2eEvidence(derived)));
    }
    if (derived.e2eCalcBroken) {
      findings.push(finding('E2E_CALC_BROKEN', 'R4G Date sớm hơn Idea Approved Date — không tính được TTM-E2E.', { ideaApprovedDate: facts.ideaApprovedDate, r4gDate: facts.r4gDate }));
    }
    return findings;
  },
  recommend: ({ derived }, active) => (active.has('E2E_BASELINE_FROM_JIRA_CREATED') && !derived.isCancelled
    ? [finding('REC_FILL_IDEA_APPROVED_DATE', 'Bổ sung Idea Approved Date (T0) để TTM-E2E tính đúng mốc gốc.', {}, { relatedTo: ['E2E_BASELINE_FROM_JIRA_CREATED'] })]
    : []),
};

export interface TtmE2eVariant {
  id: string;
  name: string;
  summary: string;
  /** "Bộ ngân sách" whose TTM_E2E budgets give this variant's Target (spec §17). */
  policySet: string;
  history?: readonly string[];
}

/** A TTM_E2E_VERDICT variant: Đạt / Fail TTM-E2E + "Sai Status". */
export function makeTtmE2eRule(variant: TtmE2eVariant): ScoringRule {
  return {
    id: variant.id,
    name: variant.name,
    summary: variant.summary,
    detail: {
      conditions: 'Không Sai lệch dữ liệu, không Cancelled, tính được Target (có T0 hoặc ngày tạo Jira, có ngân sách cho loại Epic). Đạt cần ngày kết thúc đã tới và không sớm hơn T0. Status chưa lên R4GOLIVE vẫn Đạt, kèm "Sai Status" (trừ Reopened). Không áp "Phạm vi dữ liệu cho TTM".',
      parameters: [`Tiêu chí Time to Market — TTM_E2E (bộ ngân sách ${variant.policySet}; ngày kết thúc theo to_ttm_field)`],
      history: variant.history,
    },
    category: 'TTM_E2E',
    stage: 'PRIMARY',
    core: false,
    slot: 'TTM_E2E_VERDICT',
    emits: ['E2E_FAIL', 'E2E_PASS', 'E2E_STATUS_MISMATCH'],
    defaultSelected: variant.policySet === DEFAULT_POLICY_SET,
    lifecycle: 'active',
    policySet: variant.policySet,
    gatedByDataAnomaly: true,
    evaluate: ({ facts, derived, ctx }) => {
      const target = derived.e2eTargetDate;
      const end = derived.e2eEndDate;
      if (!target || derived.isCancelled) return [];
      const evidence = e2eEvidence(derived);
      if (!end) return ctx.asOf > target ? [finding('E2E_FAIL', `Đã quá Target TTM-E2E ${target} mà chưa có ngày kết thúc.`, evidence)] : [];
      const findings: Finding[] = [];
      if (end > target) {
        findings.push(finding('E2E_FAIL', `Ngày kết thúc TTM-E2E ${end} muộn hơn Target ${target}.`, evidence));
      } else if (end <= ctx.asOf && derived.e2eBaselineSourceDate && end >= derived.e2eBaselineSourceDate) {
        findings.push(finding('E2E_PASS', `Đạt TTM-E2E: kết thúc ${end} ≤ Target ${target}.`, evidence));
        // Not for Reopened: the Epic went live and was taken back into work on purpose (2026-10-05).
        if (derived.statusIndex < STATUS_INDEX.R4GOLIVE && !isReopenedStatus(facts.status)) {
          findings.push(finding('E2E_STATUS_MISMATCH', 'TTM-E2E đã đạt theo ngày ghi nhận nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status.', evidence));
        }
      }
      return findings;
    },
  };
}

/** The TTM-E2E rule in force since 07/2026 (owner naming, 2026-10-25). */
export const ttmE2eJuly2026Rule = makeTtmE2eRule({
  id: 'ttm-e2e-july-2026',
  name: 'TTM-E2E — chuẩn 07/2026',
  summary: 'Đạt khi ngày kết thúc (R4G Date, hoặc Due Date theo policy) đã tới và ≤ Target_E2E = T0 +wd (N − 1); Fail khi muộn hơn Target, hoặc chưa có ngày kết thúc mà đã quá Target.',
  policySet: DEFAULT_POLICY_SET,
  history: [
    '01/10/2026: Target_E2E = T0 +wd (N − 1); bỏ điều kiện Released; status chưa lên R4GOLIVE vẫn Đạt, kèm "Sai Status".',
    '05/10/2026: mẫu số = Đạt + Fail (cùng công thức TTM-CNTT).',
  ],
});
