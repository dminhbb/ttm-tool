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

export const RULE_SLOT_LABELS: Record<RuleSlot, string> = {
  TTM_CNTT_VERDICT: 'TTM-CNTT (QLDA)',
  TTM_E2E_VERDICT: 'TTM-E2E',
};

/** Display order of the categories on the screen. */
export const RULE_CATEGORY_ORDER: readonly RuleCategory[] = ['TTM_CNTT', 'TTM_E2E', 'DATA_QUALITY', 'FAIL_REASON', 'RELEASE', 'PHASE', 'SCOPE'];
