import type { BadgeId } from '../catalog';
import type { DerivedMetrics, EpicFacts, Finding, ScoringContext } from '../types';

export interface RuleInput {
  facts: EpicFacts;
  derived: DerivedMetrics;
  ctx: ScoringContext;
  /** "Sai lệch dữ liệu" (an enabled ALERT badge on the DATA_QUALITY axis — R1, R3–R6) was found.
   * Data quality is checked FIRST (decision 2026-10-01): such an Epic is not judged at all on the
   * TTM axes — no Đạt/Fail/Cảnh báo muộn/Sai Status for TTM-CNTT (QLDA/QA) or TTM-E2E. */
  hasDataAnomaly: boolean;
}

/** Primary rule: reads facts/derived metrics only. */
export type PrimaryRule = (input: RuleInput) => Finding[];

/** Derived rule: also reads the already-resolved primary findings (recommendations). */
export type DerivedRule = (input: RuleInput, active: ReadonlySet<BadgeId>, findings: readonly Finding[]) => Finding[];

export function finding(badge: BadgeId, message: string, evidence: Finding['evidence'] = {}, extra: Partial<Finding> = {}): Finding {
  return { badge, message, evidence, ...extra };
}
