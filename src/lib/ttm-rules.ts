import { addWorkingDays, diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';

export type EpicComplexity = 'SIMPLE' | 'COMPLEX';
export type AlertLevel = 'NONE' | 'EARLY' | 'LATE' | 'FAIL';

const ALERTED_STATUSES = new Set(['Design', 'In Progress']);

interface OffsetRule {
  earlyOffset: number;
  lateOffset: number;
  failOffset: number;
}

// BRD 03 §3 — working-day offsets from T1 (Start Date), by complexity and status.
const OFFSET_RULES: Record<EpicComplexity, Record<'Design' | 'In Progress', OffsetRule>> = {
  SIMPLE: {
    Design: { earlyOffset: 2, lateOffset: 3, failOffset: 15 },
    'In Progress': { earlyOffset: 12, lateOffset: 13, failOffset: 15 },
  },
  COMPLEX: {
    Design: { earlyOffset: 5, lateOffset: 6, failOffset: 30 },
    'In Progress': { earlyOffset: 19, lateOffset: 20, failOffset: 30 },
  },
};

export interface TtmAlertInput {
  complexity: EpicComplexity | null;
  currentDate: Date;
  holidays?: HolidaySet;
  r4gDate: Date | null;
  startDate: Date | null;
  status: string;
  targetR4gDate: Date | null;
}

export interface TtmAlertResult {
  daysRemaining: number | null;
  earlyAlertDate: Date | null;
  failDate: Date | null;
  lateAlertDate: Date | null;
  level: AlertLevel;
  targetR4gDate: Date | null;
}

/**
 * MVP1 only covers TTM-CNTT (T1 → R4G) for Epics in Design / In Progress.
 * When Target R4G Date isn't entered manually on Jira, it's derived as
 * T1 + failOffset working days, per BRD 03 §3.
 */
export function computeTtmAlert(input: TtmAlertInput): TtmAlertResult {
  const complexity = input.complexity ?? 'SIMPLE';
  const rule = ALERTED_STATUSES.has(input.status)
    ? OFFSET_RULES[complexity][input.status as 'Design' | 'In Progress']
    : null;

  if (!input.startDate || !rule) {
    return { daysRemaining: null, earlyAlertDate: null, failDate: null, lateAlertDate: null, level: 'NONE', targetR4gDate: input.targetR4gDate };
  }

  const holidays = input.holidays ?? new Set<string>();
  const earlyAlertDate = addWorkingDays(input.startDate, rule.earlyOffset, holidays);
  const lateAlertDate = addWorkingDays(input.startDate, rule.lateOffset, holidays);
  const failDate = addWorkingDays(input.startDate, rule.failOffset, holidays);
  const targetR4gDate = input.targetR4gDate ?? failDate;

  if (input.r4gDate) {
    const level: AlertLevel = input.r4gDate.getTime() > targetR4gDate.getTime() ? 'FAIL' : 'NONE';
    return { daysRemaining: null, earlyAlertDate, failDate, lateAlertDate, level, targetR4gDate };
  }

  const now = input.currentDate.getTime();
  let level: AlertLevel = 'NONE';
  if (now > targetR4gDate.getTime()) level = 'FAIL';
  else if (now >= lateAlertDate.getTime()) level = 'LATE';
  else if (now >= earlyAlertDate.getTime()) level = 'EARLY';

  const daysRemaining = diffWorkingDays(input.currentDate, targetR4gDate, holidays);

  return { daysRemaining, earlyAlertDate, failDate, lateAlertDate, level, targetR4gDate };
}

export const ALERT_LABELS: Record<AlertLevel, string> = {
  NONE: '',
  EARLY: 'Cảnh báo sớm',
  LATE: 'Cảnh báo muộn',
  FAIL: 'Fail TTM-CNTT',
};
