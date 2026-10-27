import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALERT_LOGIC_SECTIONS, buildAlertLogicSummary } from '../alert-logic-summary';
import type { RuleGroupSummaryItem } from '../rule-group-config';
import { BADGE_LIST } from '../scoring/catalog';
import { buildRuleCatalog } from '../scoring/rule-catalog';
import { MCP_TOOL_FEATURES } from '../feature-access';

const groups: RuleGroupSummaryItem[] = [
  { name: 'Ngoại lệ', isDefault: false, enabled: true, priority: 1, conditions: 'TTM-applied = Ngoại lệ', ruleIds: ['ttm-cntt-except-plan'], offRuleIds: ['dq-r1'] },
  { name: 'Default', isDefault: true, enabled: true, priority: null, conditions: 'Epic không khớp nhóm nào ở trên', ruleIds: ['ttm-cntt-sep-2026', 'dq-r11'], offRuleIds: [] },
];

describe('get_alert_logic — the "Logic cảnh báo" popup as data (2026-10-27)', () => {
  it('returns every section by default, built from the same catalogs the popup renders', () => {
    const summary = buildAlertLogicSummary({ ruleGroups: groups });
    assert.equal(summary.badges?.length, BADGE_LIST.length);
    assert.equal(summary.ruleObjects?.length, buildRuleCatalog().length);
    for (const key of ['nguyenTac', 'kyHieu', 'findingGroups', 'axes', 'chiSo', 'nhomRuleDangApDung'] as const) assert.ok(summary[key], key);
    assert.ok(summary.badgeBiChe && summary.badgeBiChe.length > 0);
  });

  it('sections and badgeIds narrow the answer', () => {
    const only = buildAlertLogicSummary({ ruleGroups: [], sections: ['badges'], badgeIds: ['ANOMALY_R11_EXCEPT_PLAN_INVALID', 'CNTT_FAIL'] });
    assert.deepEqual(only.badges?.map((badge) => badge.id).sort(), ['ANOMALY_R11_EXCEPT_PLAN_INVALID', 'CNTT_FAIL']);
    assert.equal('ruleObjects' in only, false);
    assert.equal('nhomRuleDangApDung' in only, false);
    const r11 = only.badges?.find((badge) => badge.id === 'ANOMALY_R11_EXCEPT_PLAN_INVALID');
    assert.ok(r11?.congThuc.includes('except-TTM-plan'));
  });

  it('the Rule Groups in force name the rules instead of ids, and list what Default leaves off', () => {
    const summary = buildAlertLogicSummary({ ruleGroups: groups, sections: ['nhomRule'] });
    const [exception, standard] = summary.nhomRuleDangApDung?.nhom ?? [];
    assert.ok(exception.batRule[0].includes('Kế hoạch ngoại lệ TTM'));
    assert.ok(exception.tatRule?.some((name) => name.startsWith('R1')));
    assert.ok(standard.khongBatTrongDefault?.some((name) => name.includes('Kế hoạch ngoại lệ TTM')), 'the plan rule is not default-selected');
  });

  it('every section name is accepted and the tool is tied to the popup\'s matrix feature', () => {
    for (const section of ALERT_LOGIC_SECTIONS) assert.ok(buildAlertLogicSummary({ ruleGroups: groups, sections: [section] }).screen);
    assert.deepEqual(MCP_TOOL_FEATURES.get_alert_logic.featureKeys, ['help_alert_logic']);
  });
});
