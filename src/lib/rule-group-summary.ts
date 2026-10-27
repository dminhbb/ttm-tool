import 'server-only';
import { describeConditions } from '@/lib/rule-group-config';
import type { RuleGroupSummaryItem } from '@/lib/rule-group-config';
import { loadRuleGroups } from '@/lib/rule-group-service';
import { DEFAULT_RULE_GROUP } from '@/lib/scoring/registry';
import { orderRuleGroups } from '@/lib/scoring/rule-groups';

/**
 * The Rule Groups in force as the "Logic cảnh báo" popup lists them (section 10) — shared by
 * GET /api/rule-group-summary (every signed-in user) and the MCP tool get_alert_logic.
 */
export async function listRuleGroupSummary(): Promise<RuleGroupSummaryItem[]> {
  const groups = await loadRuleGroups();
  // Disabled groups too (shown as "Tắt"); orderRuleGroups would drop them.
  const configured = groups.length ? groups : [DEFAULT_RULE_GROUP];
  const enabledOrder = orderRuleGroups(configured);
  const ordered = [
    ...configured.filter((group) => !group.isDefault).sort((a, b) => a.priority - b.priority || a.id - b.id),
    ...configured.filter((group) => group.isDefault),
  ];
  return ordered.map((group) => ({
    name: group.name,
    isDefault: group.isDefault,
    enabled: group.isDefault || group.enabled,
    priority: group.isDefault ? null : enabledOrder.indexOf(group) + 1 || null,
    conditions: group.isDefault ? 'Epic không khớp nhóm nào ở trên' : describeConditions(group.conditions, group.ttmApplied),
    ruleIds: [...group.ruleIds].sort(),
    offRuleIds: [...(group.offRuleIds ?? [])].sort(),
  }));
}
