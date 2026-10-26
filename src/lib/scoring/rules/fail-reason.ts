import { finding } from './rule-types';
import type { RuleInput, ScoringRule } from './rule-types';
import type { BadgeId } from '../catalog';

/**
 * "Thiếu lý do Fail TTM" (owner rule 2026-10-14): only a Fail TTM-CNTT whose R4G Date is later than the Target — not
 * one still missing its R4G Date — is asked for the failing stage and the department mainly responsible. Two Rule
 * objects (spec 2026-10-25), both need a TTM-CNTT verdict rule in the same group.
 */

function failedWithLateR4g({ facts, derived }: RuleInput, active: ReadonlySet<BadgeId>): boolean {
  return active.has('CNTT_FAIL') && Boolean(facts.r4gDate && derived.cnttTargetDate && facts.r4gDate > derived.cnttTargetDate);
}

function isBlankText(value: string | null | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '' || normalized === 'none';
}

export const failReasonStageRule: ScoringRule = {
  id: 'fail-reason-stage',
  name: 'Thiếu lý do Fail TTM (khâu fail)',
  summary: 'Fail TTM-CNTT (QLDA) với R4G Date muộn hơn Target nhưng chưa ghi lý do ở khâu nào (BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT, Lý do khác).',
  detail: { conditions: 'Cần rule TTM-CNTT đang áp dụng cho Epic. Chỉ xét Epic đã có R4G Date (Fail vì chưa có R4G Date mà quá Target không bị cảnh báo).', history: ['14/10/2026: chỉ xét Epic đã có R4G Date.'] },
  category: 'FAIL_REASON',
  stage: 'PRIMARY',
  core: false,
  slot: 'FAIL_REASON_STAGE',
  emits: ['REC_MISSING_FAIL_REASON'],
  requires: ['TTM_CNTT_VERDICT'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  recommend: (input, active) => {
    const { facts, derived } = input;
    const reasons = [facts.khauBa, facts.khauCo, facts.khauDev, facts.khauPmSm, facts.khauPo, facts.khauPentest, facts.khauSa, facts.khauSitUat, facts.noteLyDoKhac];
    if (!failedWithLateR4g(input, active) || !reasons.every(isBlankText)) return [];
    return [finding('REC_MISSING_FAIL_REASON', 'Fail TTM chưa có thông tin khâu fail — bổ sung trên Jira.', { r4gDate: facts.r4gDate, targetDate: derived.cnttTargetDate }, { relatedTo: ['CNTT_FAIL'] })];
  },
};

export const failReasonDeptRule: ScoringRule = {
  id: 'fail-reason-dept',
  name: 'Thiếu phòng chịu TN chính',
  summary: 'Fail TTM-CNTT (QLDA) với R4G Date muộn hơn Target nhưng trường "Phòng chịu trách nhiệm chính" còn trống hoặc "None".',
  detail: { conditions: 'Cần rule TTM-CNTT đang áp dụng cho Epic. Chỉ xét Epic đã có R4G Date.', history: ['14/10/2026: rule mới (trường main_fail_dept).'] },
  category: 'FAIL_REASON',
  stage: 'PRIMARY',
  core: false,
  slot: 'FAIL_REASON_DEPT',
  emits: ['REC_MISSING_RESPONSIBLE_DEPARTMENT'],
  requires: ['TTM_CNTT_VERDICT'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  recommend: (input, active) => {
    const { facts, derived } = input;
    if (!failedWithLateR4g(input, active) || !isBlankText(facts.responsibleDepartment)) return [];
    return [finding('REC_MISSING_RESPONSIBLE_DEPARTMENT', 'Fail TTM chưa có phòng chịu trách nhiệm chính — bổ sung trên Jira.', { r4gDate: facts.r4gDate, targetDate: derived.cnttTargetDate }, { relatedTo: ['CNTT_FAIL'] })];
  },
};
