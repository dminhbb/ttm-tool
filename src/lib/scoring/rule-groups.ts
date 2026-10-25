import { toIsoDate } from './dates';
import { DEFAULT_RULE_GROUP, RULE_BY_ID } from './registry';
import type { RuleSlot, ScoringRule } from './rules/rule-types';
import { DEFAULT_POLICY_SET } from './types';
import type { EpicFacts, PolicySetSelection, RuleGroupDateField, RuleGroupDateRange, ScoringRuleGroup } from './types';

/**
 * Rule Groups (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §6): which group judges an Epic, and
 * what that group runs. Pure — the groups come in on ScoringContext.ruleGroups.
 */

export const RULE_GROUP_DATE_FIELDS: readonly RuleGroupDateField[] = ['jiraCreatedAt', 'ideaApprovedDate', 'startDate', 'r4gDate', 'dueDate'];

/** Enabled non-default groups by priority (1 first, then id), then the default group last. A list without a default
 * group gets the one built in code (DEFAULT_RULE_GROUP), so a missing configuration never breaks scoring. */
export function orderRuleGroups(groups: readonly ScoringRuleGroup[] | undefined): ScoringRuleGroup[] {
  const list = groups ?? [];
  const ordered = list.filter((group) => !group.isDefault && group.enabled).sort((a, b) => a.priority - b.priority || a.id - b.id);
  return [...ordered, list.find((group) => group.isDefault) ?? DEFAULT_RULE_GROUP];
}

/** One date condition (D3/D4): both ends inclusive, an open end doesn't bound; an Epic without that date doesn't match
 * a bounded condition. */
export function matchesDateRange(value: string | null | undefined, range: RuleGroupDateRange | undefined): boolean {
  if (!range || (!range.from && !range.to)) return true;
  const date = toIsoDate(value);
  if (!date) return false;
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

/** Every date condition of the group holds for the Epic (AND). The default group has none, so it matches everything. */
export function matchesRuleGroup(facts: EpicFacts, group: ScoringRuleGroup): boolean {
  return RULE_GROUP_DATE_FIELDS.every((field) => matchesDateRange(facts[field], group.conditions[field]));
}

/** D2: the highest-priority enabled group whose every condition the Epic meets; otherwise the default group. */
export function resolveRuleGroup(facts: EpicFacts, groups: readonly ScoringRuleGroup[] | undefined): ScoringRuleGroup {
  const ordered = orderRuleGroups(groups);
  return ordered.find((group) => group.isDefault || matchesRuleGroup(facts, group)) ?? ordered[ordered.length - 1];
}

/** The selectable rules a group runs (unknown ids — a rule retired from code — are ignored). */
export function selectedRulesOf(group: ScoringRuleGroup): ScoringRule[] {
  return group.ruleIds.flatMap((id) => {
    const rule = RULE_BY_ID.get(id);
    return rule && !rule.core ? [rule] : [];
  });
}

/** The group's rule filling a slot — the first one if (wrongly) several were stored; the screen blocks that. */
export function slotRuleOf(rules: readonly ScoringRule[], slot: RuleSlot): ScoringRule | null {
  return rules.find((rule) => rule.slot === slot) ?? null;
}

/** "Bộ ngân sách" of the group's verdict rules (spec §17.3); no verdict rule → DEFAULT, for the stripes/phases only. */
export function policySetsOf(rules: readonly ScoringRule[]): PolicySetSelection {
  return {
    cntt: slotRuleOf(rules, 'TTM_CNTT_VERDICT')?.policySet ?? DEFAULT_POLICY_SET,
    e2e: slotRuleOf(rules, 'TTM_E2E_VERDICT')?.policySet ?? DEFAULT_POLICY_SET,
  };
}
