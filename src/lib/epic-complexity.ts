import type { EpicComplexityType } from '@/lib/status-alert-rule-types';
import { isMisclassifiedEpicComplexity, MISCLASSIFIED_EPIC_COMPLEXITIES } from '@/lib/status-alert-rule-types';

/**
 * Epic "Loại Epic" rule (company rule change 2026-09, expanded 2026-11-23) — 9 valid combinations from
 * epic_request_type + epic_request_level, shared by the import adapter, the Scoring Service and the
 * "TTM Calculator" screen:
 *
 *   Request type → code:   Cải tiến → CT, Tính năng mới → TNM, Sản phẩm → SP, Hệ thống mới → HTM,
 *                          Quy trình → QT, Dịch vụ → DV, Giải pháp nền tảng → GPNT;
 *                          missing/empty ("None") → CT.
 *   Legacy/synonym types → SP: "Sản phẩm/dịch vụ/quy trình mới", "Sản phẩm mới", "Phát triển mới"
 *                          (khớp text parser — owner 2026-11-23).
 *   Requirement level:     {1, 2} → Lv12, {3, 4} → Lv34; outside 1-4 (including missing) → Lv12.
 *
 * CT and TNM combine freely (CT-Lv12 / CT-Lv34, TNM-Lv12 / TNM-Lv34). The other request types (Sản
 * phẩm / Hệ thống mới / Quy trình / Dịch vụ / Giải pháp nền tảng) only exist at Lv34, so their Lv12
 * combination is "Phân loại sai Epic" (a data error — HTM-Lv12, SP-Lv12, QT-Lv12, DV-Lv12, GPNT-Lv12),
 * still returned so the Scoring Service (R6) and the config screens can detect it.
 *
 * Pure: no database, no clock.
 */
const REQUEST_TYPE_TO_CODE: Record<string, string> = {
  'cải tiến': 'CT',
  'tính năng mới': 'TNM',
  'sản phẩm': 'SP',
  'hệ thống mới': 'HTM',
  'quy trình': 'QT',
  'dịch vụ': 'DV',
  'giải pháp nền tảng': 'GPNT',
  // Từ đồng nghĩa / giá trị legacy (dữ liệu cũ của Jira) → Sản phẩm, khớp với text parser
  // (toCalculatorRequestType trong ttm-calculator-text.ts) vốn coi các cụm này là "Sản phẩm".
  'sản phẩm/dịch vụ/quy trình mới': 'SP',
  'sản phẩm mới': 'SP',
  'phát triển mới': 'SP',
};
const LV34_LEVELS = new Set(['3', '4']);

/** Lowercase + NFC (Jira / crawl text may arrive decomposed, NFD) + trim + collapse inner whitespace runs. */
function normalizeComplexityField(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN');
}

/** 'Loại yêu cầu' (requestType, i.e. epic_request_type) and 'Requirement Level' (requirementLevel,
 * i.e. epic_request_level) — raw text straight from the import source. Note: this compares the request
 * type lowercased + NFC + whitespace-collapsed but NOT diacritic-stripped (the Jira / crawl values carry Vietnamese
 * diacritics); the TTM Calculator's text parser does its own diacritic-normalised recognition first. */
export function computeEpicComplexity(requestType: string, requirementLevel: string): EpicComplexityType {
  const type = normalizeComplexityField(requestType);
  const level = normalizeComplexityField(requirementLevel);
  const code = REQUEST_TYPE_TO_CODE[type] ?? 'CT';
  const isLv34 = LV34_LEVELS.has(level);
  const levelSuffix = isLv34 ? 'Lv34' : 'Lv12';
  return `${code}-${levelSuffix}` as EpicComplexityType;
}

export { isMisclassifiedEpicComplexity, MISCLASSIFIED_EPIC_COMPLEXITIES };

/** Vietnamese names for the request-type codes, used when explaining a Loại Epic to the user. */
export const REQUEST_TYPE_CODE_NAMES: Record<string, string> = {
  CT: 'Cải tiến',
  TNM: 'Tính năng mới',
  SP: 'Sản phẩm',
  HTM: 'Hệ thống mới',
  QT: 'Quy trình',
  DV: 'Dịch vụ',
  GPNT: 'Giải pháp nền tảng',
};

/** "Level 1 hoặc Level 2" / "Level 3 hoặc Level 4" from a Lv12/Lv34 suffix (defaults to Lv12 text). */
export function complexityLevelToHuman(levelSuffix: string): string {
  return levelSuffix === 'Lv34' ? 'Level 3 hoặc Level 4' : 'Level 1 hoặc Level 2';
}

/** Expand a Loại Epic code like `TNM-Lv12` → `TNM (Tính năng mới) — Level 1 hoặc Level 2`. */
export function complexityToHuman(code: string): string {
  const [typeCode, levelSuffix] = code.split('-');
  const typeName = REQUEST_TYPE_CODE_NAMES[typeCode] ?? typeCode ?? code;
  return `${typeCode} (${typeName}) — ${complexityLevelToHuman(levelSuffix ?? '')}`;
}

/** The 9 valid "Phân loại Epic" combinations, in display order (used to list them for the user). */
export const VALID_EPIC_COMPLEXITIES_LIST: readonly string[] = [
  'CT-Lv12', 'CT-Lv34', 'TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34',
];
