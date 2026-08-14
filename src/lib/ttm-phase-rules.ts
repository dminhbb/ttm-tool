import { addWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';

/**
 * Core TTM-CNTT phase-division rule (added on top of the existing T1 → R4G Date TTM-CNTT
 * window). TTM-CNTT total = the active TTM_CNTT policy's working-day budget for the Epic's
 * complexity (From TTM Field = START_DATE, To TTM Field = R4G_DATE, per "Cấu hình cảnh báo").
 * Each phase's working-day allotment is that total's percentage, rounded to whole days
 * independently — percentages intentionally don't require rounded parts to re-sum to the total.
 */
export const TTM_PHASE_PERCENTAGE = {
  DESIGN: 0.20,
  DEV: 0.30,
  TEST: 0.30,
  PENTEST: 0.10,
  R4GOLIVE: 0.10,
} as const;

export type TtmPhaseKey = keyof typeof TTM_PHASE_PERCENTAGE;

/** Canonical workflow for Epic 15. Jira's legacy `In Progress` is treated as DEV. */
export const EPIC_WORKFLOW_STATUS_ORDER = ['TO DO', 'IN PO', 'DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE', 'MVPDONE', 'RELEASED'] as const;

const STATUS_ALIASES: Record<string, (typeof EPIC_WORKFLOW_STATUS_ORDER)[number]> = {
  'IN PROGRESS': 'DEV',
  'IN DEV': 'DEV',
  'PEN TEST': 'PENTEST',
  'READY FOR GOLIVE': 'R4GOLIVE',
  'READY4GOLIVE': 'R4GOLIVE',
};

export function normalizeEpicWorkflowStatus(status: string): string {
  const normalized = status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
  return STATUS_ALIASES[normalized] ?? normalized;
}

export function epicWorkflowStatusIndex(status: string): number {
  const index = EPIC_WORKFLOW_STATUS_ORDER.indexOf(normalizeEpicWorkflowStatus(status) as (typeof EPIC_WORKFLOW_STATUS_ORDER)[number]);
  return index === -1 ? EPIC_WORKFLOW_STATUS_ORDER.length : index;
}

export interface TtmPhaseBaseline {
  cumulativeWorkingDays: number;
  date: Date;
  workingDays: number;
}

/**
 * Baseline (target) date for every phase, as a cumulative offset in working days from T1 —
 * Design ends at 20%, DEV at 50%, TEST at 80%, PENTEST at 90%, R4GOLIVE at 100% of the Epic's
 * total TTM-CNTT working-day budget.
 */
export function computeTtmPhaseBaselines(startDate: Date, ttmCnttTotalWorkingDays: number, holidays: HolidaySet): Record<TtmPhaseKey, TtmPhaseBaseline> {
  let cumulative = 0;
  let previousCumulative = 0;
  const result = {} as Record<TtmPhaseKey, TtmPhaseBaseline>;
  (Object.keys(TTM_PHASE_PERCENTAGE) as TtmPhaseKey[]).forEach((phase) => {
    cumulative = phase === 'R4GOLIVE'
      ? ttmCnttTotalWorkingDays
      : Math.round(ttmCnttTotalWorkingDays * (Object.keys(TTM_PHASE_PERCENTAGE) as TtmPhaseKey[])
        .slice(0, (Object.keys(TTM_PHASE_PERCENTAGE) as TtmPhaseKey[]).indexOf(phase) + 1)
        .reduce((total, item) => total + TTM_PHASE_PERCENTAGE[item], 0));
    const workingDays = cumulative - previousCumulative;
    previousCumulative = cumulative;
    result[phase] = { cumulativeWorkingDays: cumulative, date: addWorkingDays(startDate, cumulative, holidays), workingDays };
  });
  return result;
}
