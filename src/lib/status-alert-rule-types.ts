/**
 * Epic "Loại Epic" — request-type × requirement-level combination (company rule change 2026-09, expanded
 * 2026-11-23 to 9 valid combinations + 5 "Phân loại sai Epic"; 2026-11-23: Tính năng mới Lv12 (TNM-Lv12)
 * trở thành hợp lệ). Computed at import time from epic_request_type + epic_request_level (see
 * computeEpicComplexity in epic-complexity.ts). Cải tiến (CT) hợp lệ ở cả Lv12 và Lv34; Tính năng mới
 * (TNM) hợp lệ ở cả Lv12 và Lv34; các loại còn lại (Sản phẩm / Hệ thống mới / Quy trình / Dịch vụ / Giải
 * pháp nền tảng) chỉ tồn tại ở Lv34 nên tổ hợp Lv12 của chúng là sai dữ liệu (nhóm "Phân loại sai Epic")
 * — vẫn giữ trong enum để Scoring Service (R6) và các màn hình cấu hình phát hiện và gắn cờ.
 */
export const EPIC_COMPLEXITY_TYPES = [
  // 9 valid combinations.
  'CT-Lv12', 'CT-Lv34', 'TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34',
  // 5 "Phân loại sai Epic" combinations (non-CT, non-TNM types only exist at Lv34).
  'HTM-Lv12', 'SP-Lv12', 'QT-Lv12', 'DV-Lv12', 'GPNT-Lv12',
] as const;
export const DEFAULT_EPIC_STATUSES = ['Design', 'In Progress'] as const;

export type EpicComplexityType = (typeof EPIC_COMPLEXITY_TYPES)[number];

/** The set of every stored/readable Loại Epic (14 values: 9 valid + 5 "Phân loại sai Epic"). */
export const VALID_EPIC_COMPLEXITIES: ReadonlySet<string> = new Set(EPIC_COMPLEXITY_TYPES);

/** The 5 combinations of the "Phân loại sai Epic" group (R6). */
export const MISCLASSIFIED_EPIC_COMPLEXITIES = [
  'HTM-Lv12', 'SP-Lv12', 'QT-Lv12', 'DV-Lv12', 'GPNT-Lv12',
] as const satisfies readonly EpicComplexityType[];
export type MisclassifiedEpicComplexity = (typeof MISCLASSIFIED_EPIC_COMPLEXITIES)[number];

/** True when a Loại Epic is in the "Phân loại sai Epic" group (a non-CT/non-TNM request type wrongly at Lv12). */
export function isMisclassifiedEpicComplexity(code: string | null | undefined): code is MisclassifiedEpicComplexity {
  return (MISCLASSIFIED_EPIC_COMPLEXITIES as readonly string[]).includes(code ?? '');
}

export const EPIC_COMPLEXITY_LABELS: Record<EpicComplexityType, string> = {
  'CT-Lv12': 'CT-Lv12 — Tính năng mới/Cải tiến, mức 1-2',
  'CT-Lv34': 'CT-Lv34 — Tính năng mới/Cải tiến, mức 3-4',
  'TNM-Lv12': 'TNM-Lv12 — Tính năng mới, mức 1-2',
  'TNM-Lv34': 'TNM-Lv34 — Tính năng mới, mức 3-4',
  'HTM-Lv34': 'HTM-Lv34 — Hệ thống mới, mức 3-4',
  'SP-Lv34': 'SP-Lv34 — Sản phẩm, mức 3-4',
  'QT-Lv34': 'QT-Lv34 — Quy trình, mức 3-4',
  'DV-Lv34': 'DV-Lv34 — Dịch vụ, mức 3-4',
  'GPNT-Lv34': 'GPNT-Lv34 — Giải pháp nền tảng, mức 3-4',
  'HTM-Lv12': 'HTM-Lv12 — Phân loại sai Epic (Hệ thống mới chỉ ở mức 3-4)',
  'SP-Lv12': 'SP-Lv12 — Phân loại sai Epic (Sản phẩm chỉ ở mức 3-4)',
  'QT-Lv12': 'QT-Lv12 — Phân loại sai Epic (Quy trình chỉ ở mức 3-4)',
  'DV-Lv12': 'DV-Lv12 — Phân loại sai Epic (Dịch vụ chỉ ở mức 3-4)',
  'GPNT-Lv12': 'GPNT-Lv12 — Phân loại sai Epic (Giải pháp nền tảng chỉ ở mức 3-4)',
};

export interface StatusAlertRule {
  createdAt: string;
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  id: number;
  isActive: boolean;
  /** ≈ working days at the DEFAULT budget when last saved (informational). */
  lateAlertOffsetDays: number;
  /** Late alert = % of the Epic's TTM-CNTT budget (spec §17.6). */
  lateAlertPercent: number;
  updatedAt: string;
}

export interface StatusAlertRuleInput {
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  isActive: boolean;
  lateAlertPercent: number;
}
