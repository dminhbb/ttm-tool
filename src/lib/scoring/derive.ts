import { addWorkingDays, diffWorkingDays, toIsoDate } from './dates';
import type { DerivedMetrics, EpicComplexity, EpicFacts, IsoDate, PhaseDerived, ScoringContext, ScoringTtmPolicy, TtmPhaseKey } from './types';

/** Canonical Epic workflow (same as ttm-phase-rules.ts). Jira's legacy "In Progress" is DEV. */
export const EPIC_WORKFLOW_ORDER = ['TO DO', 'IN PO', 'DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE', 'MVPDONE', 'RELEASED'] as const;
const STATUS_ALIASES: Record<string, string> = {
  'IN PROGRESS': 'DEV',
  'IN DEV': 'DEV',
  'PEN TEST': 'PENTEST',
  'READY FOR GOLIVE': 'R4GOLIVE',
  'READY4GOLIVE': 'R4GOLIVE',
};

export function normalizeWorkflowStatus(status: string): string {
  const normalized = status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
  return STATUS_ALIASES[normalized] ?? normalized;
}

/** Unknown statuses (Pending, Cancelled, "MVP Done"…) sort after RELEASED — same as legacy. */
export function workflowStatusIndex(status: string): number {
  const index = (EPIC_WORKFLOW_ORDER as readonly string[]).indexOf(normalizeWorkflowStatus(status));
  return index === -1 ? EPIC_WORKFLOW_ORDER.length : index;
}

export const STATUS_INDEX = {
  DESIGN: workflowStatusIndex('DESIGN'),
  DEV: workflowStatusIndex('DEV'),
  R4GOLIVE: workflowStatusIndex('R4GOLIVE'),
  RELEASED: workflowStatusIndex('RELEASED'),
} as const;

export function isCancelledStatus(status: string): boolean {
  return /cancel/i.test(status);
}

export function isPendingStatus(status: string): boolean {
  return /pending/i.test(status);
}

export const PHASE_KEYS: readonly TtmPhaseKey[] = ['DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE'];

export function findActivePolicy(policies: readonly ScoringTtmPolicy[], ttmType: ScoringTtmPolicy['ttmType'], complexity: EpicComplexity): ScoringTtmPolicy | null {
  return policies.find((policy) => policy.isActive && policy.ttmType === ttmType && policy.epicComplexityType === complexity) ?? null;
}

/** Policy "From/To TTM Field" → the Epic's date (same aliases as epic-compliance-engine.ts). */
function fieldDate(facts: EpicFacts, field: string): IsoDate | null {
  const normalized = field.trim().toLocaleUpperCase('en-US').replace(/[ _-]+/g, '');
  if (normalized === 'IDEAAPPROVEDDATE' || normalized === 'IDEAAPPROVED') return facts.ideaApprovedDate;
  if (normalized === 'STARTDATE' || normalized === 'START') return facts.startDate;
  if (normalized === 'R4GDATE' || normalized === 'R4G' || normalized === 'READY4GOLIVEDATE') return facts.r4gDate;
  if (normalized === 'DUEDATE' || normalized === 'DUE') return facts.dueDate;
  return null;
}

/** Late-alert offset for (complexity, status); DEV/TEST/PENTEST inherit "In Progress" when not
 * configured on their own — same lookup as resolveOffsetRule in ttm-rules.ts. */
export function resolveLateOffset(ctx: ScoringContext, complexity: EpicComplexity, status: string): number | null {
  const normalized = status.trim().toLocaleUpperCase('en-US');
  const matches = (ruleStatus: string) => ruleStatus.trim().toLocaleUpperCase('en-US');
  const configured = ctx.statusAlertRules.find((rule) => rule.epicComplexityType === complexity && matches(rule.epicStatus) === normalized);
  if (configured) return configured.lateAlertOffsetDays;
  if (['DEV', 'TEST', 'PENTEST'].includes(normalized)) {
    const inherited = ctx.statusAlertRules.find((rule) => rule.epicComplexityType === complexity && matches(rule.epicStatus) === 'IN PROGRESS');
    if (inherited) return inherited.lateAlertOffsetDays;
  }
  return null;
}

/**
 * Phase baselines — same walk as computeTtmPhaseBaselines (ttm-phase-rules.ts): Start Date is day 1,
 * DESIGN rounds its share UP, DEV/TEST/PENTEST/R4GOLIVE round DOWN, each phase walks forward from
 * the previous phase's date, and R4GOLIVE is pinned to Start + (N − 1) = Target_CNTT.
 */
export function computePhaseBaselines(startDate: IsoDate, budget: number, percentages: Record<TtmPhaseKey, number>, ctx: ScoringContext): Record<TtmPhaseKey, IsoDate> {
  const result = {} as Record<TtmPhaseKey, IsoDate>;
  let cursor = startDate;
  PHASE_KEYS.forEach((phase, index) => {
    const share = budget * percentages[phase];
    const roundedShare = phase === 'DESIGN' ? Math.ceil(share) : Math.floor(share);
    const workingDays = Math.max(0, roundedShare - (index === 0 ? 1 : 0));
    cursor = addWorkingDays(cursor, workingDays, ctx.holidays);
    result[phase] = cursor;
  });
  result.R4GOLIVE = addWorkingDays(startDate, Math.max(0, budget - 1), ctx.holidays);
  return result;
}

function resolveCurrentPhase(statusIndex: number, devDone: boolean, testDone: boolean): TtmPhaseKey {
  if (statusIndex === STATUS_INDEX.DESIGN) return 'DESIGN';
  if (statusIndex >= STATUS_INDEX.R4GOLIVE) return 'R4GOLIVE';
  if (!devDone) return 'DEV';
  if (!testDone) return 'TEST';
  return 'PENTEST';
}

export function deriveMetrics(facts: EpicFacts, ctx: ScoringContext): DerivedMetrics {
  const complexity: EpicComplexity = facts.complexity ?? 'CT-Lv12';
  const statusIndex = workflowStatusIndex(facts.status);
  const isCancelled = isCancelledStatus(facts.status);
  const { holidays } = ctx;

  // ---- TTM-CNTT ----
  const cnttPolicy = findActivePolicy(ctx.ttmPolicies, 'TTM_CNTT', complexity);
  const cnttBudget = cnttPolicy?.workingDays ?? null;
  const cnttFromDate = cnttPolicy ? fieldDate(facts, cnttPolicy.fromTtmField) : null;
  const cnttTargetDate = cnttFromDate && cnttBudget ? addWorkingDays(cnttFromDate, Math.max(0, cnttBudget - 1), holidays) : null;
  const lateOffset = resolveLateOffset(ctx, complexity, facts.status);
  const cnttLateAlertDate = cnttFromDate && lateOffset !== null ? addWorkingDays(cnttFromDate, lateOffset, holidays) : null;
  const cnttCalcBroken = !facts.startDate || Boolean(facts.r4gDate && facts.r4gDate < facts.startDate);

  // ---- TTM-E2E ----
  const e2ePolicy = findActivePolicy(ctx.ttmPolicies, 'TTM_E2E', complexity);
  const e2eBudget = e2ePolicy?.workingDays ?? null;
  const e2eBaselineSourceDate = facts.ideaApprovedDate ?? toIsoDate(facts.jiraCreatedAt);
  // Target_E2E = T0 +wd (N − 1) — T0 is day 1, same convention as Target_CNTT (decision 2026-10-01).
  const e2eTargetDate = e2eBaselineSourceDate && e2eBudget ? addWorkingDays(e2eBaselineSourceDate, Math.max(0, e2eBudget - 1), holidays) : null;
  const endField = (e2ePolicy?.toTtmField ?? 'R4G_DATE').trim().toLocaleUpperCase('en-US').replace(/[ _-]+/g, '');
  const e2eEndDate = endField === 'DUEDATE' ? facts.dueDate : facts.r4gDate;
  const endRecorded = Boolean(e2eEndDate && e2eEndDate <= ctx.asOf && e2eBaselineSourceDate && e2eEndDate >= e2eBaselineSourceDate);
  const e2eActualToDate = endRecorded ? e2eEndDate : ctx.asOf;
  const e2eCalcBroken = Boolean(facts.ideaApprovedDate && facts.r4gDate && facts.r4gDate < facts.ideaApprovedDate);

  // ---- Release ----
  const releaseGraceDeadline = facts.r4gDate ? addWorkingDays(facts.r4gDate, ctx.parameters['release.graceWorkingDays'], holidays) : null;

  // ---- Phases (need T1 + a TTM-CNTT budget) ----
  let phases: DerivedMetrics['phases'] = null;
  if (facts.startDate && cnttBudget) {
    const baselines = computePhaseBaselines(facts.startDate, cnttBudget, ctx.parameters['phase.percentages'], ctx);
    const completion = facts.phaseCompletion;
    const doneOf: Record<TtmPhaseKey, boolean> = {
      DESIGN: completion?.designDone ?? false,
      DEV: completion?.devDone ?? false,
      TEST: completion?.testDone ?? false,
      PENTEST: false,
      R4GOLIVE: completion?.r4goliveDone ?? false,
    };
    const current = resolveCurrentPhase(statusIndex, doneOf.DEV, doneOf.TEST);
    phases = Object.fromEntries(PHASE_KEYS.map((phase): [TtmPhaseKey, PhaseDerived] => [phase, {
      baselineDate: baselines[phase],
      isDone: doneOf[phase],
      isCurrent: phase === current,
    }])) as Record<TtmPhaseKey, PhaseDerived>;
  }

  return {
    complexity,
    statusIndex,
    isCancelled,
    cnttFromDate,
    cnttBudgetWorkingDays: cnttBudget,
    cnttTargetDate,
    cnttLateAlertDate,
    cnttRemainingWorkingDays: cnttTargetDate ? diffWorkingDays(ctx.asOf, cnttTargetDate, holidays) : null,
    cnttCalcBroken,
    e2eBaselineSourceDate,
    e2eBaselineFromJiraCreated: !facts.ideaApprovedDate && Boolean(e2eBaselineSourceDate),
    e2eBudgetWorkingDays: e2eBudget,
    e2eTargetDate,
    e2eEndDate,
    e2eActualToDate,
    e2eEndRecorded: endRecorded,
    e2eCalcBroken,
    releaseGraceDeadline,
    phases,
  };
}
