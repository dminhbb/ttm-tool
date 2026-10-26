import type { RuleCategory, RuleSlot } from './rules/rule-types';

/** Display labels of the Rule object categories / slots — a leaf module (types only) so the browser can import it
 * without pulling in the rule code. */
export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  TTM_CNTT: 'TTM-CNTT (QLDA)',
  TTM_E2E: 'TTM-E2E',
  DATA_QUALITY: 'Chất lượng dữ liệu',
  FAIL_REASON: 'Lý do Fail TTM',
  RELEASE: 'Release',
  PHASE: 'Pha',
  SCOPE: 'Phạm vi',
};

/** Slot labels: the verdict slots by axis, every other slot by the name of its rule. */
export const RULE_SLOT_LABELS: Record<RuleSlot, string> = {
  TTM_CNTT_VERDICT: 'TTM-CNTT (QLDA)',
  TTM_E2E_VERDICT: 'TTM-E2E',
  DQ_R1: 'R1 — Thiếu Start Date',
  DQ_R2: 'R2 — Pending lâu',
  DQ_R3: 'R3 — Sai thứ tự ngày',
  DQ_R4: 'R4 — Thiếu Phân loại yêu cầu',
  DQ_R5: 'R5 — Thiếu Requirement Level',
  DQ_R6: 'R6 — SP nhưng Level thấp',
  DQ_R8: 'R8 — Có R4G Date nhưng chưa R4GOLIVE',
  DQ_R9: 'R9 — Thiếu R4G Date',
  DQ_R10: 'R10 — R4G Date ở tương lai',
  FAIL_REASON_STAGE: 'Thiếu lý do Fail TTM (khâu fail)',
  FAIL_REASON_DEPT: 'Thiếu phòng chịu TN chính',
  RELEASE_WAITING_GOLIVE: 'Chờ golive',
  RELEASE_JUSTIFY_GOLIVE: 'Giải trình Golive',
};

/** Display order of the categories on the screen. */
export const RULE_CATEGORY_ORDER: readonly RuleCategory[] = ['TTM_CNTT', 'TTM_E2E', 'DATA_QUALITY', 'FAIL_REASON', 'RELEASE', 'PHASE', 'SCOPE'];
