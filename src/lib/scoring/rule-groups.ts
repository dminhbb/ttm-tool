import { toIsoDate } from './dates';
import { DEFAULT_RULE_GROUP, RULE_BY_ID, SELECTABLE_RULES } from './registry';
import type { RuleSlot, ScoringRule, VerdictSlot } from './rules/rule-types';
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

/** D2 (revised 2026-10-26): every enabled group whose conditions the Epic meets, highest priority first, then Default
 * (always last, always a match). The first is the Epic's "main" group (the one stored on its scorecard). */
export function matchingRuleGroups(facts: EpicFacts, groups: readonly ScoringRuleGroup[] | undefined): ScoringRuleGroup[] {
  return orderRuleGroups(groups).filter((group) => group.isDefault || matchesRuleGroup(facts, group));
}

/** The Epic's main group: the highest-priority enabled group whose every condition it meets; otherwise Default. */
export function resolveRuleGroup(facts: EpicFacts, groups: readonly ScoringRuleGroup[] | undefined): ScoringRuleGroup {
  return matchingRuleGroups(facts, groups)[0];
}

/** The selectable rules a group turns ON (unknown ids — a rule retired from code — are ignored). */
export function selectedRulesOf(group: ScoringRuleGroup): ScoringRule[] {
  return group.ruleIds.flatMap((id) => {
    const rule = RULE_BY_ID.get(id);
    return rule && !rule.core ? [rule] : [];
  });
}

/** The slot a group's rule id fills; unknown or core ids have none. */
function slotOfRuleId(id: string): RuleSlot | null {
  const rule = RULE_BY_ID.get(id);
  return rule && !rule.core ? rule.slot ?? null : null;
}

/** What a group says about one slot: the rule it turns ON, 'OFF', or undefined (inherit). */
function groupDecisionFor(group: ScoringRuleGroup, slot: RuleSlot): ScoringRule | 'OFF' | undefined {
  const on = selectedRulesOf(group).find((rule) => rule.slot === slot);
  if (on) return on;
  return (group.offRuleIds ?? []).some((id) => slotOfRuleId(id) === slot) ? 'OFF' : undefined;
}

export interface RuleSelection {
  /** The rules that judge the Epic — one per slot at most, from the nearest matching group that decides the slot. */
  rules: ScoringRule[];
  /** Which group decided each slot (ON or OFF), for explanations. */
  decidedBy: Map<RuleSlot, { group: ScoringRuleGroup; state: 'ON' | 'OFF' }>;
}

/**
 * Rules of an Epic across its matching groups (spec 2026-10-26 D2/D5): per slot, walk the groups from the highest
 * priority down; the first group that names the slot decides it — ON with its rule, or OFF (the slot is not applied,
 * even if a lower group or Default turns it on). A slot no matching group names is not applied (Default names the
 * slots it runs).
 */
export function resolveRuleSelection(matching: readonly ScoringRuleGroup[]): RuleSelection {
  const decidedBy: RuleSelection['decidedBy'] = new Map();
  const rules: ScoringRule[] = [];
  const slots = new Set(SELECTABLE_SLOTS);
  for (const slot of slots) {
    for (const group of matching) {
      const decision = groupDecisionFor(group, slot);
      if (decision === undefined) continue;
      decidedBy.set(slot, { group, state: decision === 'OFF' ? 'OFF' : 'ON' });
      if (decision !== 'OFF') rules.push(decision);
      break;
    }
  }
  return { rules, decidedBy };
}

/** Every slot of a selectable rule, in registry order. */
const SELECTABLE_SLOTS: RuleSlot[] = [...new Set(SELECTABLE_RULES.flatMap((rule) => (rule.slot ? [rule.slot] : [])))];

/** The rule filling a slot among the rules that judge an Epic. */
export function slotRuleOf(rules: readonly ScoringRule[], slot: RuleSlot | VerdictSlot): ScoringRule | null {
  return rules.find((rule) => rule.slot === slot) ?? null;
}

/** "Bộ ngân sách" of the group's verdict rules (spec §17.3); no verdict rule → DEFAULT, for the stripes/phases only. */
export function policySetsOf(rules: readonly ScoringRule[]): PolicySetSelection {
  return {
    cntt: slotRuleOf(rules, 'TTM_CNTT_VERDICT')?.policySet ?? DEFAULT_POLICY_SET,
    e2e: slotRuleOf(rules, 'TTM_E2E_VERDICT')?.policySet ?? DEFAULT_POLICY_SET,
  };
}
