import { BADGE_BY_ID } from './catalog';
import type { FindingGroup } from './catalog';
import { CORE_RULES, SELECTABLE_RULES } from './registry';
import type { RuleCategory, RuleSlot, ScoringRule } from './rules/rule-types';

export { RULE_CATEGORY_LABELS, RULE_CATEGORY_ORDER, RULE_SLOT_LABELS } from './rule-labels';

/**
 * What the Rule Management screen and the "Logic cảnh báo" popup show about each Rule object — plain data (no
 * functions), so it can be sent to the browser. Built from registry.ts; the badges' own wording comes from catalog.ts.
 */
export interface RuleCatalogBadge {
  id: string;
  label: string;
  group: FindingGroup;
  formula: string;
}

export interface RuleCatalogItem {
  id: string;
  name: string;
  summary: string;
  conditions: string;
  parameters: string[];
  history: string[];
  category: RuleCategory;
  core: boolean;
  slot: RuleSlot | null;
  requires: RuleSlot[];
  lifecycle: 'active' | 'deprecated';
  policySet: string | null;
  defaultSelected: boolean;
  emits: RuleCatalogBadge[];
}

function toCatalogItem(rule: ScoringRule): RuleCatalogItem {
  return {
    id: rule.id,
    name: rule.name,
    summary: rule.summary,
    conditions: rule.detail.conditions,
    parameters: [...(rule.detail.parameters ?? [])],
    history: [...(rule.detail.history ?? [])],
    category: rule.category,
    core: rule.core,
    slot: rule.slot ?? null,
    requires: [...(rule.requires ?? [])],
    lifecycle: rule.lifecycle,
    policySet: rule.policySet ?? null,
    defaultSelected: rule.defaultSelected,
    emits: rule.emits.map((badgeId) => {
      const badge = BADGE_BY_ID.get(badgeId);
      return { id: badgeId, label: badge?.label ?? badgeId, group: badge?.group ?? 'NOTE', formula: badge?.formula ?? '' };
    }),
  };
}

/** Rules a group can select, then the rules that always run. */
export function buildRuleCatalog(): RuleCatalogItem[] {
  return [...SELECTABLE_RULES, ...CORE_RULES].map(toCatalogItem);
}
