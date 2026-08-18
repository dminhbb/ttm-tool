import { addWorkingDays, toDateKey } from '@/lib/working-days';
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
 * Baseline (target) date for every phase — Design ends at 20%, DEV at 50%, TEST at 80%, PENTEST
 * at 90%, R4GOLIVE at 100% of the Epic's total TTM-CNTT working-day budget, walked sequentially
 * (not each phase's cumulative % rounded independently off the total) so phases stay contiguous
 * even though an individual phase's own share (e.g. 30% of a 15-day budget = 4.5 days) is rarely
 * a whole number:
 *
 * - Start Date is day 1 of the whole timeline — DESIGN's own N-day share ends on the Nth working
 *   day counting Start Date itself as day 1 (so N working days of headroom is `N - 1` steps
 *   forward from Start Date), not "N working days after Start Date".
 * - Every later phase's own share is walked forward from the PREVIOUS phase's baseline — DEV's end
 *   = TEST's start, PENTEST's end = R4GOLIVE's start, by construction (each phase's date becomes
 *   the next phase's starting cursor), stepping the full share's worth of working days forward
 *   from that cursor (no day-1 adjustment there — the cursor date was already the previous phase's
 *   last day, not a fresh day 1).
 * - A fractional day share (e.g. 4.5 days) rounds UP (ceil) for DESIGN/DEV/PENTEST, but rounds DOWN
 *   (floor) for TEST/R4GOLIVE specifically — e.g. a 4.5-day TEST share ends one working day earlier
 *   than a flat 5-day share would. This asymmetry is an explicit business rule, not a bug: it exists
 *   specifically to keep the chained per-phase rounding close to the direct total (see below).
 * - Only working days count throughout: Saturdays, Sundays, and the app's configured holidays are
 *   all skipped (addWorkingDays already encodes this).
 *
 * R4GOLIVE's baseline is TTM-CNTT's own end date by definition (core business rule, confirmed
 * explicitly): it must always equal exactly `startDate + (ttmCnttTotalWorkingDays - 1)` working
 * days — the same day-1-counts-as-day-1 convention as DESIGN's own share above, applied to the
 * whole TTM-CNTT budget at once. Five independently-rounded phase shares (each ceil or floor of a
 * fraction) don't always sum back to exactly that total — e.g. 20/30/30/10/10% of 17 days rounds to
 * 4+6+5+2+1 = 18 raw days, one more than 17. FLOOR_ROUNDED_PHASES keeps that drift small, but to
 * guarantee exactness R4GOLIVE's date is always pinned directly off startDate afterward, rather than
 * trusted from the chained walk — DESIGN/DEV/TEST/PENTEST keep their chained dates unchanged.
 */
const FLOOR_ROUNDED_PHASES: ReadonlySet<TtmPhaseKey> = new Set(['TEST', 'R4GOLIVE']);

export function computeTtmPhaseBaselines(startDate: Date, ttmCnttTotalWorkingDays: number, holidays: HolidaySet): Record<TtmPhaseKey, TtmPhaseBaseline> {
  const result = {} as Record<TtmPhaseKey, TtmPhaseBaseline>;
  let cursor = startDate;
  let cumulativeWorkingDays = 0;
  (Object.keys(TTM_PHASE_PERCENTAGE) as TtmPhaseKey[]).forEach((phase, index) => {
    const isFirstPhase = index === 0;
    const share = ttmCnttTotalWorkingDays * TTM_PHASE_PERCENTAGE[phase];
    const roundedShare = FLOOR_ROUNDED_PHASES.has(phase) ? Math.floor(share) : Math.ceil(share);
    const workingDays = Math.max(0, roundedShare - (isFirstPhase ? 1 : 0));
    const date = addWorkingDays(cursor, workingDays, holidays);
    cumulativeWorkingDays += workingDays;
    result[phase] = { cumulativeWorkingDays, date, workingDays };
    cursor = date;
  });

  const r4goliveWorkingDays = Math.max(0, ttmCnttTotalWorkingDays - 1);
  const r4goliveDate = addWorkingDays(startDate, r4goliveWorkingDays, holidays);
  result.R4GOLIVE = {
    cumulativeWorkingDays: r4goliveWorkingDays,
    date: r4goliveDate,
    workingDays: r4goliveWorkingDays - result.PENTEST.cumulativeWorkingDays,
  };

  return result;
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
  const todayIso = toDateKey(now);
  if (todayIso >= toDateKey(baselineDate)) return 'LATE';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (toDateKey(tomorrow) === toDateKey(baselineDate)) return 'EARLY';
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
