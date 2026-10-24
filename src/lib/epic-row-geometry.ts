import { addWorkingDays, diffWorkingDays, toIsoDate } from '@/lib/scoring/dates';
import { findActivePolicy } from '@/lib/scoring/derive';
import type { DerivedMetrics, EpicComplexity, IsoDate, ScoringContext } from '@/lib/scoring/types';

/**
 * The numbers an Epic row draws that are not verdicts — stripes, elapsed working days, the Release
 * baseline — computed from the Epic's dates, its scorecard's `derived` metrics and the scoring context.
 * Verdicts (alert levels, badges, anomalies, scope) come from the Epic Scoring Service itself; this module
 * only lays the dates out for the screens (Quản trị Epic, TTM Dashboard 2, cache, MCP…), always from one
 * "asOf" date so a row can never disagree with its own scorecard.
 */

export const RELEASE_BASELINE_SOURCE_LABEL = {
  ideaApproved: 'Idea Approved Date (T0)',
  jiraCreated: 'Ngày tạo trên Jira',
} as const;

interface DatesOfEpic {
  r4gDate: string | null;
  startDate: string | null;
}

export interface TtmActualRange {
  fromDate: string | null;
  toDate: string | null;
}

/**
 * Range the "stripe thực tế" (actual, bottom strip) of the TTM-CNTT column draws for. Start is always
 * Start Date (T1), same as the baseline stripe above it. End: R4G Date once `asOf` has reached it (and it
 * is not before Start Date), else `asOf` — the Epic is treated as still ongoing when there is no R4G Date,
 * it is still in the future, or it is chronologically nonsense (before Start Date).
 */
export function resolveTtmActualRange(row: DatesOfEpic, asOf: IsoDate): TtmActualRange {
  const r4gDateIsChronological = Boolean(row.r4gDate && row.startDate && row.r4gDate >= row.startDate);
  const usesR4gDate = Boolean(r4gDateIsChronological && row.r4gDate && row.r4gDate <= asOf);
  return { fromDate: row.startDate, toDate: usesR4gDate ? row.r4gDate : asOf };
}

/** Working days between two dates, never negative; null when either end is unknown. */
export function elapsedWorkingDays(from: IsoDate | null, to: IsoDate | null, ctx: ScoringContext): number | null {
  return from && to ? Math.max(0, diffWorkingDays(from, to, ctx.holidays)) : null;
}

export interface TtmCnttGeometry {
  elapsedWorkingDays: number | null;
  fromDate: string | null;
  fromField: string | null;
  targetWorkingDays: number;
  toField: string | null;
}

/** TTM-CNTT baseline numbers: the policy's From/To fields and budget, and how much of it has elapsed. */
export function cnttGeometry(complexity: EpicComplexity, derived: DerivedMetrics, ctx: ScoringContext): TtmCnttGeometry {
  const policy = findActivePolicy(ctx.ttmPolicies, 'TTM_CNTT', complexity);
  return {
    elapsedWorkingDays: elapsedWorkingDays(derived.cnttFromDate, ctx.asOf, ctx),
    fromDate: derived.cnttFromDate,
    fromField: policy?.fromTtmField ?? null,
    targetWorkingDays: derived.cnttBudgetWorkingDays ?? 0,
    toField: policy?.toTtmField ?? null,
  };
}

export interface TtmE2eGeometry {
  actualToDate: string | null;
  /** T0 + the TTM-E2E budget in working days — the Release cell's baseline. */
  baselineDate: string | null;
  baselineSourceDate: string | null;
  baselineSourceLabel: string | null;
  elapsedWorkingDays: number | null;
  targetWorkingDays: number;
}

/**
 * TTM-E2E strip numbers: T0 is the Idea Approved Date, else the Epic's Jira creation date; the strip runs
 * from T0 to the end date once recorded and reached, else to `asOf`. The Release cell's baseline is
 * T0 + the full budget (N working days), which is what the screens have always drawn there.
 */
export function e2eGeometry(derived: DerivedMetrics, ctx: ScoringContext): TtmE2eGeometry {
  const source = derived.e2eBaselineSourceDate;
  const budget = derived.e2eBudgetWorkingDays ?? 0;
  return {
    actualToDate: derived.e2eActualToDate,
    baselineDate: source && budget ? addWorkingDays(source, budget, ctx.holidays) : null,
    baselineSourceDate: source,
    baselineSourceLabel: source ? (derived.e2eBaselineFromJiraCreated ? RELEASE_BASELINE_SOURCE_LABEL.jiraCreated : RELEASE_BASELINE_SOURCE_LABEL.ideaApproved) : null,
    elapsedWorkingDays: elapsedWorkingDays(source, derived.e2eActualToDate, ctx),
    targetWorkingDays: budget,
  };
}

export { toIsoDate };
