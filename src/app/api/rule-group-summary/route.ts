import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { describeConditions } from '@/lib/rule-group-config';
import type { RuleGroupSummaryItem } from '@/lib/rule-group-config';
import { loadRuleGroups } from '@/lib/rule-group-service';
import { DEFAULT_RULE_GROUP } from '@/lib/scoring/registry';
import { orderRuleGroups } from '@/lib/scoring/rule-groups';

/**
 * Read-only view of the Rule Groups in force, for the "Logic cảnh báo" popup — every signed-in user (the popup's
 * own "Xem" is the permission matrix's help_alert_logic). Editing stays on Rule Management (SUPERADMIN).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const groups = await loadRuleGroups();
    // Disabled groups too (shown as "Tắt"); orderRuleGroups would drop them.
    const configured = groups.length ? groups : [DEFAULT_RULE_GROUP];
    const enabledOrder = orderRuleGroups(configured);
    const ordered = [
      ...configured.filter((group) => !group.isDefault).sort((a, b) => a.priority - b.priority || a.id - b.id),
      ...configured.filter((group) => group.isDefault),
    ];
    const items: RuleGroupSummaryItem[] = ordered.map((group) => ({
      name: group.name,
      isDefault: group.isDefault,
      enabled: group.isDefault || group.enabled,
      priority: group.isDefault ? null : enabledOrder.indexOf(group) + 1 || null,
      conditions: group.isDefault ? 'Epic không khớp nhóm nào ở trên' : describeConditions(group.conditions),
      ruleIds: [...group.ruleIds].sort(),
    }));
    return NextResponse.json({ groups: items });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in rule-group-summary GET:', error);
    return NextResponse.json({ error: 'Không thể tải danh sách nhóm rule.' }, { status: 500 });
  }
}
