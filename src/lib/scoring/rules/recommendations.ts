import { STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { DerivedRule } from './rule-types';
import type { Finding } from '../types';

/** Recommendations derived from the resolved (active) primary findings. */
export const recommendationsRule: DerivedRule = ({ facts, derived }, active, findings) => {
  const out: Finding[] = [];
  const brokenForMissingT1 = active.has('CNTT_CALC_BROKEN') && !facts.startDate && !derived.isCancelled && derived.statusIndex >= STATUS_INDEX.DESIGN && derived.statusIndex <= STATUS_INDEX.RELEASED;
  if (active.has('ANOMALY_R1_MISSING_START_DATE') || brokenForMissingT1) {
    out.push(finding('REC_FILL_START_DATE', 'Bổ sung Start Date (T1) trên Jira.', {}, { relatedTo: active.has('ANOMALY_R1_MISSING_START_DATE') ? ['ANOMALY_R1_MISSING_START_DATE'] : ['CNTT_CALC_BROKEN'] }));
  }
  const brokenForOrder = (active.has('CNTT_CALC_BROKEN') && Boolean(facts.startDate)) || active.has('E2E_CALC_BROKEN');
  if (active.has('ANOMALY_R3_DATE_OUT_OF_SEQUENCE') || brokenForOrder) {
    out.push(finding('REC_FIX_DATE_ORDER', 'Kiểm tra lại thứ tự các mốc ngày (T0, Start Date, R4G Date, Due Date) trên Jira.', {}, { relatedTo: ['ANOMALY_R3_DATE_OUT_OF_SEQUENCE'] }));
  }
  if (active.has('ANOMALY_R4_MISSING_REQUEST_TYPE')) out.push(finding('REC_FILL_REQUEST_TYPE', 'Bổ sung Phân loại yêu cầu trên Jira.', {}, { relatedTo: ['ANOMALY_R4_MISSING_REQUEST_TYPE'] }));
  if (active.has('ANOMALY_R5_MISSING_REQUIREMENT_LEVEL')) out.push(finding('REC_FILL_REQUIREMENT_LEVEL', 'Bổ sung Requirement Level trên Jira.', {}, { relatedTo: ['ANOMALY_R5_MISSING_REQUIREMENT_LEVEL'] }));
  if (active.has('ANOMALY_R6_SP_LEVEL_MISMATCH')) out.push(finding('REC_REVIEW_SP_LEVEL', 'Rà soát lại Phân loại yêu cầu / Requirement Level.', {}, { relatedTo: ['ANOMALY_R6_SP_LEVEL_MISMATCH'] }));
  if (active.has('ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE')) out.push(finding('REC_FIX_R4G_STATUS', 'Chuyển status Epic sang R4GOLIVE, hoặc kiểm tra lại R4G Date trên Jira.', {}, { relatedTo: ['ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE'] }));
  if (active.has('ANOMALY_R10_R4G_DATE_IN_FUTURE')) out.push(finding('REC_CLEAR_FUTURE_R4G_DATE', 'Xoá R4G Date khai báo trước trên Jira (ghi ngày dự kiến ở trường thông tin khác); chỉ ghi R4G Date khi Epic thực tế đạt R4GOLIVE.', {}, { relatedTo: ['ANOMALY_R10_R4G_DATE_IN_FUTURE'] }));
  if (active.has('ANOMALY_R9_MISSING_R4G_DATE')) out.push(finding('REC_FILL_R4G_DATE', 'Bổ sung R4G Date trên Jira.', {}, { relatedTo: ['ANOMALY_R9_MISSING_R4G_DATE'] }));
  if (active.has('E2E_BASELINE_FROM_JIRA_CREATED') && !derived.isCancelled) {
    out.push(finding('REC_FILL_IDEA_APPROVED_DATE', 'Bổ sung Idea Approved Date (T0) để TTM-E2E tính đúng mốc gốc.', {}, { relatedTo: ['E2E_BASELINE_FROM_JIRA_CREATED'] }));
  }
  if (active.has('RELEASE_JUSTIFY_GOLIVE')) {
    out.push(finding('REC_PREPARE_GOLIVE_JUSTIFICATION', 'Chuẩn bị nội dung giải trình Golive trễ hạn.', {}, { relatedTo: ['RELEASE_JUSTIFY_GOLIVE'] }));
  }
  const currentPhase = findings.find((item) => item.badge === 'PHASE_CURRENT' && !item.suppressedBy)?.subject;
  if (currentPhase && findings.some((item) => item.badge === 'PHASE_LATE' && item.subject === currentPhase && !item.suppressedBy)) {
    out.push(finding('REC_ACCELERATE_PHASE', `Đẩy nhanh pha ${currentPhase} đang trễ baseline.`, {}, { relatedTo: ['PHASE_LATE'], subject: currentPhase }));
  }
  return out;
};
