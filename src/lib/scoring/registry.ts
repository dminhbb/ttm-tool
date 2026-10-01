import { dataQualityRule } from './rules/data-quality';
import { recommendationsRule } from './rules/recommendations';
import { releaseRule } from './rules/release';
import { phaseRule, scopeRule } from './rules/scope-phase';
import { ttmCnttRule } from './rules/ttm-cntt';
import { ttmE2eRule } from './rules/ttm-e2e';
import type { DerivedRule, PrimaryRule } from './rules/rule-types';

/**
 * Every rule the service runs — add or remove a rule here. Individual badges are switched on/off
 * via scoring_rule_settings (see BadgeDefinition.defaultEnabled / core in catalog.ts).
 */
export const PRIMARY_RULES: readonly PrimaryRule[] = [ttmCnttRule, ttmE2eRule, releaseRule, dataQualityRule, scopeRule, phaseRule];

/** Run after the resolver, on the resolved primary findings. */
export const DERIVED_RULES: readonly DerivedRule[] = [recommendationsRule];

/** Bump whenever rule code changes, so cached scorecards are recognized as outdated. */
export const SCORING_CODE_VERSION = 'scoring-3';
