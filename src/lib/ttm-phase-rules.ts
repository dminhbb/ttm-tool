import { addWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import type { AlertLevel } from '@/lib/ttm-rules';

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

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Epic 15's uniform per-phase alert rule, applied independently to every one of the five phase
 * columns (DESIGN/DEV/TEST/PENTEST/R4GOLIVE), calendar-date based (not working-day based, unlike
 * the baseline itself):
 * - A phase with no basis to record completion yet (no actual/milestone date) is late once today
 *   reaches its own baseline, one calendar day early the day before that, else not due yet.
 * - A phase that already has a recorded completion date isn't "due" anymore — comparing that date
 *   against the baseline (on time vs late) is a separate, presentation-layer concern (see
 *   phaseCellColorClass in epic-alerts-15/page.tsx), not something this function decides.
 */
export function computePhaseAlertLevel(baselineDate: Date, now: Date, isDone: boolean): AlertLevel {
  if (isDone) return 'NONE';
  const todayIso = toDateOnlyIso(now);
  if (todayIso >= toDateOnlyIso(baselineDate)) return 'LATE';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (toDateOnlyIso(tomorrow) === toDateOnlyIso(baselineDate)) return 'EARLY';
  return 'NONE';
}

export type ComponentPhaseKey = 'DEV' | 'TEST' | 'PENTEST';

export interface ComponentPhaseAlerts {
  currentComponent: ComponentPhaseKey;
  dev: AlertLevel;
  pentest: AlertLevel;
  test: AlertLevel;
}

/**
 * DEV/TEST/PENTEST alert levels (each independent, per computePhaseAlertLevel — a phase blocked
 * behind an earlier, not-yet-done phase still goes LATE once its own baseline passes, since DEV's
 * baseline always falls before TEST's, which always falls before PENTEST's), plus which of the
 * three is Epic 15's "giai đoạn hiện tại" (current phase) — the first not yet satisfying its
 * completion rule (DEV_DONE / TEST_DONE — see epic-milestone-history-service.ts; PENTEST has no
 * completion rule yet, so it's the fallback once TEST is done).
 */
export function computeComponentPhaseAlerts(
  baselines: Record<TtmPhaseKey, TtmPhaseBaseline>,
  devDone: boolean,
  testDone: boolean,
  now: Date,
): ComponentPhaseAlerts {
  const currentComponent: ComponentPhaseKey = !devDone ? 'DEV' : !testDone ? 'TEST' : 'PENTEST';

  return {
    currentComponent,
    dev: computePhaseAlertLevel(baselines.DEV.date, now, devDone),
    // PENTEST has no completion rule yet, so its alert always tracks its own baseline.
    pentest: computePhaseAlertLevel(baselines.PENTEST.date, now, false),
    test: computePhaseAlertLevel(baselines.TEST.date, now, testDone),
  };
}
