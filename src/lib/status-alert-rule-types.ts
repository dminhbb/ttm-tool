/** 4-way Epic complexity/request-type classification (company rule change, 2026-09) — replaces the
 * old 2-way SIMPLE/COMPLEX. Computed at import time from epic_request_type + epic_request_level
 * (see computeEpicComplexity in import-service.ts): CT = 'Tính năng mới'/'Cải tiến' request type,
 * SP = 'Sản phẩm/dịch vụ/quy trình mới'/'Sản phẩm'; Lv12/Lv34 = request level 1-2 vs 3-4. Any
 * request type/level combination that doesn't match one of the 4 rules (including missing data)
 * defaults to CT-Lv12. */
export const EPIC_COMPLEXITY_TYPES = ['CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34'] as const;
export const DEFAULT_EPIC_STATUSES = ['Design', 'In Progress'] as const;

export type EpicComplexityType = (typeof EPIC_COMPLEXITY_TYPES)[number];

export const EPIC_COMPLEXITY_LABELS: Record<EpicComplexityType, string> = {
  'CT-Lv12': 'CT-Lv12 — Tính năng mới/Cải tiến, mức 1-2',
  'CT-Lv34': 'CT-Lv34 — Tính năng mới/Cải tiến, mức 3-4',
  'SP-Lv12': 'SP-Lv12 — Sản phẩm/DV/quy trình mới, mức 1-2',
  'SP-Lv34': 'SP-Lv34 — Sản phẩm/DV/quy trình mới, mức 3-4',
};

export interface StatusAlertRule {
  createdAt: string;
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  id: number;
  isActive: boolean;
  lateAlertOffsetDays: number;
  updatedAt: string;
}

export interface StatusAlertRuleInput {
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  isActive: boolean;
  lateAlertOffsetDays: number;
}
