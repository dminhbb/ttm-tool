import type { BadgeId } from '../catalog';
import type { DerivedMetrics, EpicFacts, Finding, ScoringContext } from '../types';

export interface RuleInput {
  facts: EpicFacts;
  derived: DerivedMetrics;
  ctx: ScoringContext;
}

/** Primary rule: reads facts/derived metrics only. */
export type PrimaryRule = (input: RuleInput) => Finding[];

/** Derived rule: also reads the already-resolved primary findings (recommendations). */
export type DerivedRule = (input: RuleInput, active: ReadonlySet<BadgeId>, findings: readonly Finding[]) => Finding[];

export function finding(badge: BadgeId, message: string, evidence: Finding['evidence'] = {}, extra: Partial<Finding> = {}): Finding {
  return { badge, message, evidence, ...extra };
}
