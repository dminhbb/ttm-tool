/** 4-way Epic complexity/request-type classification (company rule change, 2026-09, request-type
 * mapping revised 2026-09-22) — replaces the old 2-way SIMPLE/COMPLEX. Computed at import time from
 * epic_request_type + epic_request_level (see computeEpicComplexity in import-service.ts):
 * CT = 'Tính năng mới'/'Cải tiến' request type OR blank/missing; SP = every other request type
 * (the complement of CT, not its own whitelist); Lv12/Lv34 = request level 1-2 vs 3-4. A level that
 * doesn't match 1-4 (including missing data) defaults the whole Epic to CT-Lv12. */
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
