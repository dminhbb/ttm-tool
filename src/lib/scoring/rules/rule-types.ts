import type { BadgeId } from '../catalog';
import type { DerivedMetrics, EpicFacts, Finding, ScoringContext } from '../types';

export interface RuleInput {
  facts: EpicFacts;
  derived: DerivedMetrics;
  ctx: ScoringContext;
  /** "Sai lệch dữ liệu" (an enabled ALERT badge on the DATA_QUALITY axis — R1, R3–R6, R8, R9, R10) was found.
   * Data quality is checked FIRST (decision 2026-10-01): such an Epic is not judged at all on the
   * TTM axes — no Đạt/Fail/Cảnh báo muộn/Sai Status for TTM-CNTT (QLDA/QA) or TTM-E2E. The engine enforces it
   * (rules with `gatedByDataAnomaly`), so a rule doesn't have to check it itself. */
  hasDataAnomaly: boolean;
}

/** Primary step: reads facts/derived metrics only. */
export type PrimaryRule = (input: RuleInput) => Finding[];

/** Recommendation step: also reads the already-resolved primary findings. */
export type DerivedRule = (input: RuleInput, active: ReadonlySet<BadgeId>, findings: readonly Finding[]) => Finding[];

export function finding(badge: BadgeId, message: string, evidence: Finding['evidence'] = {}, extra: Partial<Finding> = {}): Finding {
  return { badge, message, evidence, ...extra };
}

/**
 * A position a Rule Group fills with at most ONE rule (spec 2026-10-25 §4.3, extended 2026-10-26 to every selectable
 * rule): the verdict slots (TTM-CNTT, TTM-E2E) and one slot per other rule (a data-quality R-rule, a fail-reason
 * check, a release check…). A rule that has variants shares its slot with them; every rule of a slot emits the same
 * badges with the same meaning, so the funnel, the indexes and the filters never need to know which variant judged an
 * Epic. A group declares each slot ON (with a rule), OFF or leaves it to inherit from the next group
 * (rule-groups.ts resolveRuleSelection).
 */
export type RuleSlot =
  | 'TTM_CNTT_VERDICT'
  | 'TTM_E2E_VERDICT'
  | 'DQ_R1' | 'DQ_R2' | 'DQ_R3' | 'DQ_R4' | 'DQ_R5' | 'DQ_R6' | 'DQ_R8' | 'DQ_R9' | 'DQ_R10'
  | 'FAIL_REASON_STAGE'
  | 'FAIL_REASON_DEPT'
  | 'RELEASE_WAITING_GOLIVE'
  | 'RELEASE_JUSTIFY_GOLIVE';

/** The slots that hold a Đạt / Fail verdict. */
export type VerdictSlot = 'TTM_CNTT_VERDICT' | 'TTM_E2E_VERDICT';

/** Verdict badges every rule of a verdict slot must emit (and nothing else) — checked by the registry tests. */
export const SLOT_BADGES: Record<VerdictSlot, readonly BadgeId[]> = {
  TTM_CNTT_VERDICT: ['CNTT_PASS', 'CNTT_FAIL', 'CNTT_STATUS_MISMATCH'],
  TTM_E2E_VERDICT: ['E2E_PASS', 'E2E_FAIL', 'E2E_STATUS_MISMATCH'],
};

/** How the Rule Management screen groups the rules. */
export type RuleCategory = 'DATA_QUALITY' | 'TTM_CNTT' | 'TTM_E2E' | 'RELEASE' | 'PHASE' | 'FAIL_REASON' | 'SCOPE';

/** Which step a rule's `evaluate` runs in: data quality first (its result gates the TTM verdicts), then the rest. */
export type RuleStage = 'DATA_QUALITY' | 'PRIMARY';

export interface RuleDetail {
  /** Conditions of application: statuses, exemptions, what the rule needs. */
  conditions: string;
  /** Tunable parameters the rule reads (scoring_parameters keys / config screens). */
  parameters?: readonly string[];
  /** Logic changes, newest last, e.g. "14/10/2026: chỉ xét Epic đã có R4G Date". */
  history?: readonly string[];
}

/**
 * A Rule object (spec 2026-10-25 §4): one unit of judging logic that emits a known set of badges. Its formula per
 * badge lives in catalog.ts (the badge's `formula`); the rule adds what the Rule Management screen and the
 * "Logic cảnh báo" popup show about the rule as a whole.
 *
 * `id` is stored in the database (a Rule Group's selection) and never changes (D11): a rule without variants has a
 * short id (`dq-r1`), a variant carries the month it took effect (`ttm-cntt-sep-2026`). Fixing a rule in place keeps
 * its id and every group selecting it gets the fix (D17); a rule meant for one period of Epics only is a new variant.
 */
export interface ScoringRule {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly detail: RuleDetail;
  readonly category: RuleCategory;
  readonly stage: RuleStage;
  /** Always runs, whatever the Rule Group selected (spec §5.2); not offered on the Rule Management screen. */
  readonly core: boolean;
  /** Every selectable (non-core) rule has one; a core rule has none. */
  readonly slot?: RuleSlot;
  /** Every badge the rule may emit (evaluate + recommend). */
  readonly emits: readonly BadgeId[];
  /** Slots the rule needs in the same group to have any effect (a warning on the screen, never a block). */
  readonly requires?: readonly RuleSlot[];
  /** Part of the default group built in code / seeded into the database. */
  readonly defaultSelected: boolean;
  /** 'deprecated': keeps running where already selected, can't be newly selected. */
  readonly lifecycle: 'active' | 'deprecated';
  /** Verdict rules: the "Bộ ngân sách" (TTM budgets) the Epic's Target is computed from (spec §17). */
  readonly policySet?: string;
  /** The engine drops this rule's findings when the Epic has "Sai lệch dữ liệu" (spec §4.3). */
  readonly gatedByDataAnomaly: boolean;
  readonly evaluate?: PrimaryRule;
  readonly recommend?: DerivedRule;
}
