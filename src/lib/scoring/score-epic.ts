import { BADGE_BY_ID, SUPPRESSIONS } from './catalog';
import type { BadgeId } from './catalog';
import { deriveMetrics, isCancelledStatus } from './derive';
import { DERIVED_RULES, PRIMARY_RULES } from './registry';
import type { RuleInput } from './rules/rule-types';
import type { EpicFacts, EpicScorecard, Finding, IndexMembership, ScoringContext } from './types';

function isEnabled(badge: BadgeId, ctx: ScoringContext): boolean {
  const definition = BADGE_BY_ID.get(badge);
  if (!definition) return false;
  if ('core' in definition && definition.core) return true;
  return ctx.ruleEnabled[badge] ?? definition.defaultEnabled;
}

/** Marks (never removes) findings hidden by an active gate — see SUPPRESSIONS in catalog.ts. */
export function resolveSuppressions(findings: Finding[]): Finding[] {
  const present = new Set(findings.map((item) => item.badge));
  return findings.map((item) => {
    const by = SUPPRESSIONS.filter((rule) => rule.when !== item.badge && present.has(rule.when) && rule.suppress.includes(item.badge)).map((rule) => rule.when);
    return by.length ? { ...item, suppressedBy: by } : item;
  });
}

function activeBadges(findings: readonly Finding[]): Set<BadgeId> {
  return new Set(findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
}

function sortFindings(findings: Finding[]): Finding[] {
  const rank = (item: Finding) => BADGE_BY_ID.get(item.badge)?.precedence ?? 999;
  return [...findings].sort((a, b) => rank(a) - rank(b));
}

/** "Sai lệch dữ liệu" = any active ALERT badge on the DATA_QUALITY axis. */
export function hasDataAnomalyBadge(active: ReadonlySet<BadgeId>): boolean {
  for (const badge of active) {
    const definition = BADGE_BY_ID.get(badge);
    if (definition?.axis === 'DATA_QUALITY' && definition.group === 'ALERT') return true;
  }
  return false;
}

function indexMembership(facts: EpicFacts, active: ReadonlySet<BadgeId>, ctx: ScoringContext): IndexMembership {
  const cancelled = isCancelledStatus(facts.status);
  const anomaly = hasDataAnomalyBadge(active);
  const flags = (counted: boolean) => {
    const eligible = counted && Boolean(facts.r4gDate) && !anomaly;
    return { counted, eligible, pass: eligible && active.has('CNTT_PASS'), fail: counted && active.has('CNTT_FAIL') };
  };
  const qaStatus = ctx.parameters['index.qaStatuses'].includes(facts.status.trim().toUpperCase());
  return {
    ttm: flags(!cancelled && !active.has('SCOPE_CNTT_OUT')),
    qa: flags(!cancelled && qaStatus && !active.has('SCOPE_QA_OUT')),
  };
}

/**
 * The Epic Scoring Service's single entry point: one Epic's facts + a context (asOf, config) → every
 * finding across every axis. Pure — no DB, no system clock.
 */
export function scoreEpic(facts: EpicFacts, ctx: ScoringContext): EpicScorecard {
  const derived = deriveMetrics(facts, ctx);
  const input: RuleInput = { facts, derived, ctx };

  const primary = PRIMARY_RULES.flatMap((rule) => rule(input)).filter((item) => isEnabled(item.badge, ctx));
  const resolved = resolveSuppressions(primary);
  const active = activeBadges(resolved);
  const secondary = DERIVED_RULES.flatMap((rule) => rule(input, active, resolved)).filter((item) => isEnabled(item.badge, ctx));
  const findings = sortFindings([...resolved, ...secondary]);

  return {
    epicKey: facts.epicKey,
    asOf: ctx.asOf,
    rulesetVersion: ctx.rulesetVersion,
    findings,
    indexMembership: indexMembership(facts, activeBadges(findings), ctx),
    derived,
  };
}
