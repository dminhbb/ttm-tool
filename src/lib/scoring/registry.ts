import { dqR10Rule, dqR1Rule, dqR2Rule, dqR3Rule, dqR4Rule, dqR5Rule, dqR6Rule, dqR8Rule, dqR9Rule } from './rules/data-quality';
import { failReasonDeptRule, failReasonStageRule } from './rules/fail-reason';
import { releaseJustifyGoliveRule, releaseOnTimeRule, releaseStatusMismatchRule, releaseWaitingGoliveRule } from './rules/release';
import { phaseRule, scopeRule } from './rules/scope-phase';
import { ttmCnttGatesRule, ttmCnttLateRule, ttmCnttSep2026Rule } from './rules/ttm-cntt';
import { ttmE2eGatesRule, ttmE2eJuly2026Rule } from './rules/ttm-e2e';
import type { ScoringRule } from './rules/rule-types';
import type { ScoringRuleGroup } from './types';

/**
 * Every Rule object of the Epic Scoring Service (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md), in
 * the order the engine runs them — data quality first (its result gates the TTM verdicts), then TTM-CNTT, TTM-E2E,
 * Release, Scope, Phase. The order only matters for findings of equal precedence on different axes, which keep it.
 *
 * - `core` rules always run;
 * - the others run only when the Epic's Rule Group selected them (a group's selection is stored by rule `id`, which
 *   never changes — see ScoringRule).
 *
 * Add / fix / retire a rule here + in rules/*, give each badge it emits a catalog.ts entry, bump SCORING_CODE_VERSION
 * and run `npm test` (registry.test.ts checks ids, badge ownership and the slot contract).
 */
export const RULES: readonly ScoringRule[] = [
  // ---- Data quality (stage DATA_QUALITY) ----
  dqR8Rule,
  dqR10Rule,
  dqR2Rule,
  dqR1Rule,
  dqR3Rule,
  dqR4Rule,
  dqR5Rule,
  dqR6Rule,
  dqR9Rule,
  // ---- TTM-CNTT ----
  ttmCnttGatesRule,
  ttmCnttSep2026Rule,
  ttmCnttLateRule,
  failReasonStageRule,
  failReasonDeptRule,
  // ---- TTM-E2E ----
  ttmE2eGatesRule,
  ttmE2eJuly2026Rule,
  // ---- Release ----
  releaseWaitingGoliveRule,
  releaseStatusMismatchRule,
  releaseOnTimeRule,
  releaseJustifyGoliveRule,
  // ---- Scope / Phase ----
  scopeRule,
  phaseRule,
];

export const RULE_BY_ID: ReadonlyMap<string, ScoringRule> = new Map(RULES.map((rule) => [rule.id, rule]));

/** Rules that always run (spec §5.2). */
export const CORE_RULES: readonly ScoringRule[] = RULES.filter((rule) => rule.core);

/** Rules a Rule Group can select (spec §5.1) — what the Rule Management screen offers. */
export const SELECTABLE_RULES: readonly ScoringRule[] = RULES.filter((rule) => !rule.core);

/** Id of the default group built in code (a database group always has a positive id). */
export const CODE_DEFAULT_RULE_GROUP_ID = 0;

/**
 * The default group used while no Rule Group is configured (and the selection seeded into the database): every
 * selectable rule with `defaultSelected` — exactly how every Epic was judged before Rule Groups existed.
 */
export const DEFAULT_RULE_GROUP: ScoringRuleGroup = {
  id: CODE_DEFAULT_RULE_GROUP_ID,
  name: 'Default',
  priority: Number.MAX_SAFE_INTEGER,
  isDefault: true,
  enabled: true,
  conditions: {},
  ruleIds: SELECTABLE_RULES.filter((rule) => rule.defaultSelected).map((rule) => rule.id),
};

/** Bump whenever rule code changes, so cached scorecards are recognized as outdated. */
export const SCORING_CODE_VERSION = 'scoring-22';
