import { addWorkingDays, diffWorkingDays, emptyHolidaySet } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import type { EpicComplexityType, StatusAlertRule } from '@/lib/status-alert-rule-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';

/** Alias of EpicComplexityType (status-alert-rule-types.ts) — kept as its own exported name since
 * most of this codebase imports "EpicComplexity" from here, not from status-alert-rule-types.ts. */
export type EpicComplexity = EpicComplexityType;
export type AlertLevel = 'NONE' | 'EARLY' | 'LATE' | 'FAIL';

const ALERTED_STATUSES = new Set(['DESIGN', 'IN PROGRESS']);

function normalizeStatusForMatch(status: string): string {
  return status.trim().toLocaleUpperCase('en-US');
}

export interface OffsetRule {
  earlyOffset: number;
  lateOffset: number;
}

// BRD 03 §3 — working-day offsets from T1 (Start Date), by complexity and status. Only used as a
// fallback when the caller doesn't pass DB-loaded statusAlertRules (see resolveOffsetRule below) —
// Lv12/Lv34 values mirror the old SIMPLE/COMPLEX defaults until the admin configures the 4 new
// types for real via "Cấu hình cảnh báo".
export const OFFSET_RULES: Record<EpicComplexity, Record<'Design' | 'In Progress', OffsetRule>> = {
  'CT-Lv12': {
    Design: { earlyOffset: 2, lateOffset: 3 },
    'In Progress': { earlyOffset: 12, lateOffset: 13 },
  },
  'CT-Lv34': {
    Design: { earlyOffset: 5, lateOffset: 6 },
    'In Progress': { earlyOffset: 19, lateOffset: 20 },
  },
  'SP-Lv12': {
    Design: { earlyOffset: 2, lateOffset: 3 },
    'In Progress': { earlyOffset: 12, lateOffset: 13 },
  },
  'SP-Lv34': {
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
 *
 * FAIL (the target R4G date has already passed, or R4G Date landed after it) is an objective fact
 * about the Epic missing its deadline — it doesn't depend on a status-specific early/late offset
 * rule being configured, so it still applies to statuses like Pending that have no such rule (e.g.
 * work paused mid-flight doesn't reset the clock). Cancelled is the one exception: abandoned work
 * never "fails" TTM. EARLY/LATE, by contrast, genuinely need a configured rule for the status.
 */
export function computeTtmAlert(input: TtmAlertInput): TtmAlertResult {
  const complexity = input.complexity ?? 'CT-Lv12';
  const rule = resolveOffsetRule(complexity, input.status, input.statusAlertRules);

  if (!input.startDate || !input.targetR4gDate || isCancelledStatus(input.status)) {
    return { daysRemaining: null, earlyAlertDate: null, lateAlertDate: null, level: 'NONE', targetR4gDate: input.targetR4gDate };
  }

  const holidays = input.holidays ?? emptyHolidaySet();
  const earlyAlertDate = rule ? addWorkingDays(input.startDate, rule.earlyOffset, holidays) : null;
  const lateAlertDate = rule ? addWorkingDays(input.startDate, rule.lateOffset, holidays) : null;
  const targetR4gDate = input.targetR4gDate;

  if (input.r4gDate) {
    const level: AlertLevel = input.r4gDate.getTime() > targetR4gDate.getTime() ? 'FAIL' : 'NONE';
    return { daysRemaining: null, earlyAlertDate, lateAlertDate, level, targetR4gDate };
  }

  const now = input.currentDate.getTime();
  let level: AlertLevel = 'NONE';
  if (now > targetR4gDate.getTime()) level = 'FAIL';
  else if (lateAlertDate && now >= lateAlertDate.getTime()) level = 'LATE';
  else if (earlyAlertDate && now >= earlyAlertDate.getTime()) level = 'EARLY';

  const daysRemaining = diffWorkingDays(input.currentDate, targetR4gDate, holidays);

  return { daysRemaining, earlyAlertDate, lateAlertDate, level, targetR4gDate };
}

export const ALERT_LABELS: Record<AlertLevel, string> = {
  NONE: '',
  EARLY: 'Cảnh báo sớm',
  LATE: 'Cảnh báo muộn',
  FAIL: 'Fail TTM-CNTT',
};
