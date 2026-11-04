import { finding } from './rule-types';
import type { ScoringRule } from './rule-types';
import type { EpicFacts, IsoDate } from '../types';

/**
 * "Start sớm" (owner 2026-11-04): the crawl tool's Epic_Real_Start_Date (the earliest start among the Epic's
 * Stories' subtasks — CSV V16.1, issues.epic_real_start_date) is earlier than the Epic's Start Date (T1). Only an
 * Epic that has its Start Date (no "Thiếu Start Date") is checked; an Epic with "Sai lệch dữ liệu" still gets it
 * (owner 2026-11-04) — it is a hint to review T1, not a verdict. score-epic.ts then also judges TTM-CNTT (QLDA)
 * again from that real start date (scorecard.earlyStart), read by the report "Báo cáo Epic start sớm".
 */

const DAY_MS = 86_400_000;

/** Calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export function calendarDaysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The Epic started earlier than its Start Date says: both dates known and Epic_Real_Start_Date < Start Date. */
export function earlyStartDateOf(facts: Pick<EpicFacts, 'epicRealStartDate' | 'startDate'>): IsoDate | null {
  const real = facts.epicRealStartDate;
  return real && facts.startDate && real < facts.startDate ? real : null;
}

export const earlyStartRule: ScoringRule = {
  id: 'early-start',
  name: 'Start sớm',
  summary: 'Ngày bắt đầu thực tế do crawl tool tính (Epic_Real_Start_Date — subtask start sớm nhất của các Story) sớm hơn Start Date của Epic.',
  detail: {
    conditions: 'Chỉ xét Epic có Start Date (không vi phạm "Thiếu Start Date") và có Epic_Real_Start_Date. Epic Sai lệch dữ liệu vẫn được xét. Epic có khuyến nghị này được chấm lại TTM-CNTT (QLDA) với Start Date = Epic_Real_Start_Date cho "Báo cáo Epic start sớm" (không đổi kết quả chính thức).',
    history: ['04/11/2026: rule mới (chủ sở hữu) — trường Epic_Real_Start_Date của crawl tool V16.1.'],
  },
  category: 'TTM_CNTT',
  stage: 'PRIMARY',
  core: false,
  slot: 'EARLY_START',
  emits: ['REC_EARLY_START'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  recommend: ({ facts, derived }, active) => {
    const real = earlyStartDateOf(facts);
    // A Cancelled Epic is not judged on TTM-CNTT (QLDA) at all.
    if (!real || !facts.startDate || derived.isCancelled || active.has('ANOMALY_R1_MISSING_START_DATE')) return [];
    const daysEarly = calendarDaysBetween(real, facts.startDate);
    return [finding(
      'REC_EARLY_START',
      `Epic bắt đầu thực tế ${real} (Epic_Real_Start_Date), sớm hơn Start Date ${facts.startDate} ${daysEarly} ngày — rà soát lại Start Date trên Jira.`,
      { startDate: facts.startDate, realStartDate: real, daysEarly },
    )];
  },
};
