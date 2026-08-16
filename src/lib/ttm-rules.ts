import { addWorkingDays, diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import type { StatusAlertRule } from '@/lib/status-alert-rule-types';

export type EpicComplexity = 'SIMPLE' | 'COMPLEX';
export type AlertLevel = 'NONE' | 'EARLY' | 'LATE' | 'FAIL';

const ALERTED_STATUSES = new Set(['DESIGN', 'IN PROGRESS']);

function normalizeStatusForMatch(status: string): string {
  return status.trim().toLocaleUpperCase('en-US');
}

export interface OffsetRule {
  earlyOffset: number;
  lateOffset: number;
}

// BRD 03 §3 — working-day offsets from T1 (Start Date), by complexity and status.
export const OFFSET_RULES: Record<EpicComplexity, Record<'Design' | 'In Progress', OffsetRule>> = {
  SIMPLE: {
    Design: { earlyOffset: 2, lateOffset: 3 },
    'In Progress': { earlyOffset: 12, lateOffset: 13 },
  },
  COMPLEX: {
    Design: { earlyOffset: 5, lateOffset: 6 },
    'In Progress': { earlyOffset: 19, lateOffset: 20 },
  },
};

/**
 * Resolves the effective early/late offset rule for a given complexity + status. Status matching
 * is case/whitespace-normalized (core logic: Jira status text and manually-created placeholder
 * issues — see data-completion-service.ts — aren't guaranteed to share one exact casing), so a
 * status like "IN PROGRESS" matches a rule configured as "In Progress".
 */
export function resolveOffsetRule(
  complexity: EpicComplexity,
  status: string,
  statusAlertRules?: StatusAlertRule[],
): OffsetRule | null {
  const normalizedStatus = normalizeStatusForMatch(status);
  if (statusAlertRules) {
    const configured = statusAlertRules.find((item) => item.epicComplexityType === complexity && normalizeStatusForMatch(item.epicStatus) === normalizedStatus);
    if (configured) return { earlyOffset: configured.earlyAlertOffsetDays, lateOffset: configured.lateAlertOffsetDays };
    // Epic 15 expands the legacy In Progress stage. Unless a phase-specific rule is
    // configured, DEV/TEST/PENTEST inherit the existing In Progress warning offsets.
    const inherited = ['DEV', 'TEST', 'PENTEST'].includes(normalizedStatus)
      ? statusAlertRules.find((item) => item.epicComplexityType === complexity && normalizeStatusForMatch(item.epicStatus) === 'IN PROGRESS')
      : undefined;
    return inherited
      ? { earlyOffset: inherited.earlyAlertOffsetDays, lateOffset: inherited.lateAlertOffsetDays }
      : null;
  }
  return ALERTED_STATUSES.has(normalizedStatus) ? OFFSET_RULES[complexity][(normalizedStatus === 'DESIGN' ? 'Design' : 'In Progress')] : null;
}

export interface TtmAlertInput {
  complexity: EpicComplexity | null;
  currentDate: Date;
  holidays?: HolidaySet;
  r4gDate: Date | null;
  startDate: Date | null;
  status: string;
  statusAlertRules?: StatusAlertRule[];
  targetR4gDate: Date | null;
}

export interface TtmAlertResult {
  daysRemaining: number | null;
  earlyAlertDate: Date | null;
  lateAlertDate: Date | null;
  level: AlertLevel;
  targetR4gDate: Date | null;
}

/**
 * MVP1 only covers TTM-CNTT (T1 → R4G) for Epics in Design / In Progress.
 * The target date is supplied by the active TTM-CNTT policy (From/To + working days).
 */
export function computeTtmAlert(input: TtmAlertInput): TtmAlertResult {
  const complexity = input.complexity ?? 'SIMPLE';
  const rule = resolveOffsetRule(complexity, input.status, input.statusAlertRules);

  if (!input.startDate || !rule || !input.targetR4gDate) {
    return { daysRemaining: null, earlyAlertDate: null, lateAlertDate: null, level: 'NONE', targetR4gDate: input.targetR4gDate };
  }

  const holidays = input.holidays ?? new Set<string>();
  const earlyAlertDate = addWorkingDays(input.startDate, rule.earlyOffset, holidays);
  const lateAlertDate = addWorkingDays(input.startDate, rule.lateOffset, holidays);
  const targetR4gDate = input.targetR4gDate;

  if (input.r4gDate) {
    const level: AlertLevel = input.r4gDate.getTime() > targetR4gDate.getTime() ? 'FAIL' : 'NONE';
    return { daysRemaining: null, earlyAlertDate, lateAlertDate, level, targetR4gDate };
  }

  const now = input.currentDate.getTime();
  let level: AlertLevel = 'NONE';
  if (now > targetR4gDate.getTime()) level = 'FAIL';
  else if (now >= lateAlertDate.getTime()) level = 'LATE';
  else if (now >= earlyAlertDate.getTime()) level = 'EARLY';

  const daysRemaining = diffWorkingDays(input.currentDate, targetR4gDate, holidays);

  return { daysRemaining, earlyAlertDate, lateAlertDate, level, targetR4gDate };
}

export const ALERT_LABELS: Record<AlertLevel, string> = {
  NONE: '',
  EARLY: 'Cảnh báo sớm',
  LATE: 'Cảnh báo muộn',
  FAIL: 'Fail TTM-CNTT',
};
