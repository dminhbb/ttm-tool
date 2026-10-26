import { BADGE_BY_ID, SUPPRESSIONS } from './catalog';
import type { BadgeId } from './catalog';
import { deriveMetrics, isCancelledStatus } from './derive';
import { RULES } from './registry';
import { matchingRuleGroups, policySetsOf, resolveRuleSelection, slotRuleOf } from './rule-groups';
import { scopeRule } from './rules/scope-phase';
import { finding } from './rules/rule-types';
import type { RuleInput, ScoringRule } from './rules/rule-types';
import type { EpicFacts, EpicScorecard, Finding, IndexMembership, ScoringContext } from './types';

/** A badge not in use yet (`defaultEnabled: false` in catalog.ts) is never emitted. Which rules run is the Rule
 * Group's business (rule-groups.ts) — there is no per-badge switch any more (removed 2026-10-25, spec §9.3). */
function isEnabled(badge: BadgeId): boolean {
  const definition = BADGE_BY_ID.get(badge);
  if (!definition) return false;
  return ('core' in definition && definition.core) || definition.defaultEnabled;
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

/** `hasCnttRule`: the Epic's Rule Group has a TTM-CNTT verdict rule — without one the Epic is outside L02 and out of
 * TTM-CNTT (QLDA) and (QA) (spec 2026-10-25 D6, D13). */
function indexMembership(facts: EpicFacts, active: ReadonlySet<BadgeId>, ctx: ScoringContext, hasCnttRule: boolean): IndexMembership {
  // Cancelled Epics and "Epic ngoại lệ" (black listed / project Time to Market = N) are outside L02 — never counted.
  const outsideL02 = isCancelledStatus(facts.status) || Boolean(facts.ttmExclusion) || !hasCnttRule;
  const anomaly = hasDataAnomalyBadge(active);
  const flags = (counted: boolean) => {
    const eligible = counted && Boolean(facts.r4gDate) && !anomaly;
    return { counted, eligible, pass: eligible && active.has('CNTT_PASS'), fail: counted && active.has('CNTT_FAIL') };
  };
  const qaStatus = ctx.parameters['index.qaStatuses'].includes(facts.status.trim().toUpperCase());
  return {
    ttm: flags(!outsideL02 && !active.has('SCOPE_CNTT_OUT')),
    qa: flags(!outsideL02 && qaStatus && !active.has('SCOPE_QA_OUT')),
  };
}

function evaluateRule(rule: ScoringRule, input: RuleInput): Finding[] {
  return (rule.evaluate?.(input) ?? []).filter((item) => isEnabled(item.badge));
}

/**
 * The Epic Scoring Service's single entry point: one Epic's facts + a context (asOf, config, Rule Groups) → every
 * finding across every axis. Pure — no DB, no system clock.
 *
 * Steps (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §7):
 *   1. "Epic ngoại lệ" → only the Scope rule, no Rule Group;
 *   2. the Epic's matching Rule Groups (rule-groups.ts; layered, Default last) → the rules it runs = core rules + one
 *      rule per slot the groups turn ON (the nearest group naming a slot decides it; OFF disables it), and the
 *      "Bộ ngân sách" its verdict rules read (deriveMetrics);
 *   3. data-quality rules → "Sai lệch dữ liệu", which drops every rule with `gatedByDataAnomaly` (the TTM verdicts);
 *   4. the other rules, plus "Không áp dụng rule TTM-CNTT / TTM-E2E" when no verdict rule applies for a slot;
 *   5. suppressions, then the recommendation step of every rule that runs.
 */
export function scoreEpic(facts: EpicFacts, ctx: ScoringContext): EpicScorecard {
  // "Epic ngoại lệ" (owner rule 2026-10-09) — a black listed Epic or an Epic of a project with Time to
  // Market = N (facts.ttmExclusion) — is not judged at all: no data-quality, TTM-CNTT, TTM-E2E, Release
  // or phase rule runs, so it carries no Sai lệch dữ liệu / Đạt / Fail / cảnh báo / khuyến nghị and is in
  // no index. Only the SCOPE notes remain: the badge saying WHY it is an exception, and where it sits
  // against "Phạm vi dữ liệu cho TTM" (the funnel's L01 is read from that). `derived` (Target, baseline
  // dates) is still returned — those are dates, not verdicts.
  if (facts.ttmExclusion) {
    const derived = deriveMetrics(facts, ctx);
    const findings = sortFindings(evaluateRule(scopeRule, { facts, derived, ctx, hasDataAnomaly: false }));
    return { epicKey: facts.epicKey, asOf: ctx.asOf, rulesetVersion: ctx.rulesetVersion, ruleGroup: null, findings, indexMembership: indexMembership(facts, activeBadges(findings), ctx, true), derived };
  }

  const matching = matchingRuleGroups(facts, ctx.ruleGroups);
  const group = matching[0];
  const { rules: selected, decidedBy } = resolveRuleSelection(matching);
  const selectedIds = new Set(selected.map((rule) => rule.id));
  const rules = RULES.filter((rule) => rule.core || selectedIds.has(rule.id));
  const derived = deriveMetrics(facts, ctx, policySetsOf(selected));
  const baseInput: RuleInput = { facts, derived, ctx, hasDataAnomaly: false };

  // Data quality is evaluated first: its verdict gates every TTM verdict (RuleInput.hasDataAnomaly).
  const dataQuality = rules.filter((rule) => rule.stage === 'DATA_QUALITY').flatMap((rule) => evaluateRule(rule, baseInput));
  const hasDataAnomaly = hasDataAnomalyBadge(new Set(dataQuality.map((item) => item.badge)));
  const input: RuleInput = { ...baseInput, hasDataAnomaly };
  const runs = (rule: ScoringRule) => !(hasDataAnomaly && rule.gatedByDataAnomaly);

  // No verdict rule applies for a slot (turned OFF by a group, or none selected): the Epic is not judged on that axis
  // (D6). Cancelled has its own note.
  const hasCnttRule = Boolean(slotRuleOf(selected, 'TTM_CNTT_VERDICT'));
  const noRuleReason = (slot: 'TTM_CNTT_VERDICT' | 'TTM_E2E_VERDICT') => {
    const decision = decidedBy.get(slot);
    return decision ? `nhóm rule "${decision.group.name}" đã tắt rule này` : `nhóm rule "${group.name}" và các nhóm kế thừa không có rule này`;
  };
  const noRule: Finding[] = [];
  if (!derived.isCancelled && !hasCnttRule) noRule.push(finding('CNTT_NO_RULE', `Không áp dụng rule đánh giá TTM-CNTT (QLDA) — ${noRuleReason('TTM_CNTT_VERDICT')}. Epic không được chấm TTM-CNTT và không tính vào TTM-CNTT (QLDA) / (QA).`));
  if (!derived.isCancelled && !slotRuleOf(selected, 'TTM_E2E_VERDICT')) noRule.push(finding('E2E_NO_RULE', `Không áp dụng rule đánh giá TTM-E2E — ${noRuleReason('TTM_E2E_VERDICT')}. Epic không được chấm TTM-E2E và không tính vào chỉ số TTM-E2E.`));

  const primaryRules = rules.filter((rule) => rule.stage === 'PRIMARY' && runs(rule));
  const primary = [...dataQuality, ...primaryRules.flatMap((rule) => evaluateRule(rule, input)), ...noRule.filter((item) => isEnabled(item.badge))];
  const resolved = resolveSuppressions(primary);
  const active = activeBadges(resolved);
  const secondary = rules.filter(runs).flatMap((rule) => rule.recommend?.(input, active, resolved) ?? []).filter((item) => isEnabled(item.badge));
  const findings = sortFindings([...resolved, ...secondary]);

  return {
    epicKey: facts.epicKey,
    asOf: ctx.asOf,
    rulesetVersion: ctx.rulesetVersion,
    ruleGroup: { id: group.id, name: group.name, isDefault: group.isDefault },
    findings,
    indexMembership: indexMembership(facts, activeBadges(findings), ctx, hasCnttRule),
    derived,
  };
}
