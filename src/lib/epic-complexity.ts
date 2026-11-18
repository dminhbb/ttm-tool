import type { EpicComplexityType } from '@/lib/status-alert-rule-types';

/**
 * Epic complexity rule (company rule change, 2026-09) — 4-way classification from epic_request_type
 * + epic_request_level, shared by the import adapter and the "TTM Calculator" screen:
 *   CT: request type ∈ {Tính năng mới, Cải tiến} OR request type is missing/empty ("None")
 *   SP: every other request type (anything not matched to CT above)
 *   Lv12/Lv34: request level ∈ {1, 2} vs {3, 4}
 * A level outside 1-4 (including missing data) defaults the whole Epic to CT-Lv12 — the agreed
 * safe default. Pure: no database, no clock.
 */
const CT_REQUEST_TYPES = new Set(['cải tiến', 'tính năng mới']);
const LV12_LEVELS = new Set(['1', '2']);
const LV34_LEVELS = new Set(['3', '4']);

function normalizeComplexityField(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN');
}

function isBlankComplexityField(normalized: string): boolean {
  return normalized === '' || normalized === 'none';
}

/** 'Loại yêu cầu' (requestType, i.e. epic_request_type) and 'Requirement Level' (requirementLevel,
 * i.e. epic_request_level) — raw text straight from the import source, not yet normalised. */
export function computeEpicComplexity(requestType: string, requirementLevel: string): EpicComplexityType {
  const type = normalizeComplexityField(requestType);
  const level = normalizeComplexityField(requirementLevel);
  const isCtType = CT_REQUEST_TYPES.has(type) || isBlankComplexityField(type);
  const isSpType = !isCtType;
  const isLv34 = LV34_LEVELS.has(level);
  if (isSpType && isLv34) return 'SP-Lv34';
  if (isSpType && LV12_LEVELS.has(level)) return 'SP-Lv12';
  if (isCtType && isLv34) return 'CT-Lv34';
  // CT + Lv12 lands here too, and so does every unmatched/missing level (the default).
  return 'CT-Lv12';
}
