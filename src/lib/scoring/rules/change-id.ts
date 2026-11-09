import { finding } from './rule-types';
import type { ScoringRule } from './rule-types';
import type { EpicFacts } from '../types';

/**
 * "Thiếu Change ID" (owner 2026-11-09): an Epic with an R4G Date must carry the Change ID of its golive change —
 * from R4G Date 01/07/2026 the one of the AMT tool (CSV Change_ID_AMT), before that either field (Change_ID or
 * Change_ID_AMT). A recommendation on the Release axis (owner 2026-11-09, first an alert): it changes no TTM verdict, scope
 * or index; the Epics are listed on "Chuẩn hoá dữ liệu" (data-normalization.ts).
 */

/** From this R4G Date on, only Change_ID_AMT counts. */
export const CHANGE_ID_AMT_FROM = '2026-07-01';

/** Blank, "None" (what Jira sends for an empty field) or "NULL" = no Change ID. */
export function hasChangeIdValue(value: string | null | undefined): boolean {
  const text = value?.trim().toLocaleUpperCase('en-US') ?? '';
  return text !== '' && text !== 'NONE' && text !== 'NULL';
}

/** Which field the Epic is missing, or null when it has what its R4G Date requires (or has no R4G Date). */
export function missingChangeIdOf(facts: Pick<EpicFacts, 'r4gDate' | 'changeId' | 'changeIdAmt'>): 'AMT' | 'ANY' | null {
  if (!facts.r4gDate) return null;
  if (facts.r4gDate >= CHANGE_ID_AMT_FROM) return hasChangeIdValue(facts.changeIdAmt) ? null : 'AMT';
  return hasChangeIdValue(facts.changeId) || hasChangeIdValue(facts.changeIdAmt) ? null : 'ANY';
}

export const missingChangeIdRule: ScoringRule = {
  id: 'missing-change-id',
  name: 'Thiếu Change ID',
  summary: 'Epic đã có R4G Date nhưng chưa có Change ID: R4G Date từ 01/07/2026 cần Change_ID_AMT; trước đó cần Change_ID hoặc Change_ID_AMT.',
  detail: {
    conditions: 'Chỉ xét Epic đã có R4G Date, không Cancelled. Giá trị trống, "None" hoặc "NULL" coi như chưa có. Là khuyến nghị trên trục Release — không đổi kết quả Đạt / Fail, phạm vi hay chỉ số TTM; Epic được liệt kê ở màn "Chuẩn hoá dữ liệu".',
    history: ['09/11/2026: rule mới (chủ sở hữu) — trường Change_ID, Change_ID_AMT của file CSV; cùng ngày đổi từ Cảnh báo sang Khuyến nghị.'],
  },
  category: 'RELEASE',
  stage: 'PRIMARY',
  core: false,
  slot: 'MISSING_CHANGE_ID',
  emits: ['REC_MISSING_CHANGE_ID'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts, derived }) => {
    if (derived.isCancelled) return [];
    const missing = missingChangeIdOf(facts);
    if (!missing) return [];
    const message = missing === 'AMT'
      ? `Epic có R4G Date ${facts.r4gDate} (từ 01/07/2026) nhưng chưa có Change ID trên AMT (Change_ID_AMT) — bổ sung trên Jira.`
      : `Epic có R4G Date ${facts.r4gDate} nhưng chưa có Change ID (Change_ID hoặc Change_ID_AMT) — bổ sung trên Jira.`;
    return [finding('REC_MISSING_CHANGE_ID', message, { r4gDate: facts.r4gDate, required: missing === 'AMT' ? 'Change_ID_AMT' : 'Change_ID hoặc Change_ID_AMT' })];
  },
};
