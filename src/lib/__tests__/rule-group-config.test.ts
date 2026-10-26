import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectRuleGroupConflicts, emptyConditions, groupsMayOverlap, ruleStateOf, validateRuleGroups } from '../rule-group-config';
import type { RuleGroupDraft } from '../rule-group-config';
import { DEFAULT_RULE_GROUP } from '../scoring/registry';
import { buildRuleCatalog } from '../scoring/rule-catalog';

const catalog = buildRuleCatalog();

function draft(key: string, overrides: Partial<RuleGroupDraft> = {}): RuleGroupDraft {
  return { key, id: null, name: key, isDefault: false, enabled: true, conditions: emptyConditions(), ruleIds: [], offRuleIds: [], ttmApplied: null, ...overrides };
}

const defaultDraft = draft('default', { id: 1, name: 'Default', isDefault: true, ruleIds: [...DEFAULT_RULE_GROUP.ruleIds] });

function range(field: keyof RuleGroupDraft['conditions'], from: string | null, to: string | null): RuleGroupDraft['conditions'] {
  return { ...emptyConditions(), [field]: { from, to } };
}

describe('Rule Group states (Kế thừa / Bật / Tắt)', () => {
  it('a rule is ON, OFF or inherited', () => {
    const group = draft('a', { ruleIds: ['dq-r1'], offRuleIds: ['dq-r2'] });
    assert.equal(ruleStateOf(group, 'dq-r1'), 'ON');
    assert.equal(ruleStateOf(group, 'dq-r2'), 'OFF');
    assert.equal(ruleStateOf(group, 'dq-r3'), 'INHERIT');
  });

  it('date ranges of two groups overlap when every field intersects (an open end is unbounded)', () => {
    assert.ok(groupsMayOverlap(draft('a'), draft('b')), 'no conditions on either side');
    assert.ok(groupsMayOverlap(draft('a', { conditions: range('r4gDate', null, '2026-08-31') }), draft('b', { conditions: range('dueDate', '2026-10-01', null) })), 'different fields');
    assert.ok(groupsMayOverlap(draft('a', { conditions: range('r4gDate', null, '2026-09-30') }), draft('b', { conditions: range('r4gDate', '2026-09-30', null) })), 'inclusive ends touch');
    assert.ok(!groupsMayOverlap(draft('a', { conditions: range('r4gDate', null, '2026-08-31') }), draft('b', { conditions: range('r4gDate', '2026-09-01', null) })));
  });
});

describe('conflicts between groups before a save (2026-10-26)', () => {
  it('same slot, different outcome, overlapping Epics → one conflict naming both groups', () => {
    const high = draft('high', { name: 'Cao', ruleIds: ['dq-r4'] });
    const low = draft('low', { name: 'Thấp', offRuleIds: ['dq-r4'] });
    const conflicts = detectRuleGroupConflicts([high, low, defaultDraft], catalog);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].higherKey, 'high');
    assert.equal(conflicts[0].lowerKey, 'low');
    assert.ok(conflicts[0].message.includes('"Cao" (#1)') && conflicts[0].message.includes('"Thấp" (#2)'));
  });

  it('no conflict when the groups agree, cannot meet, are disabled, or only one names the slot', () => {
    const agree = [draft('a', { ruleIds: ['dq-r4'] }), draft('b', { ruleIds: ['dq-r4'] }), defaultDraft];
    assert.deepEqual(detectRuleGroupConflicts(agree, catalog), []);
    const apart = [
      draft('a', { ruleIds: ['dq-r4'], conditions: range('r4gDate', null, '2026-08-31') }),
      draft('b', { offRuleIds: ['dq-r4'], conditions: range('r4gDate', '2026-09-01', null) }),
      defaultDraft,
    ];
    assert.deepEqual(detectRuleGroupConflicts(apart, catalog), []);
    assert.deepEqual(detectRuleGroupConflicts([draft('a', { ruleIds: ['dq-r4'] }), draft('b', { offRuleIds: ['dq-r4'], enabled: false }), defaultDraft], catalog), []);
    assert.deepEqual(detectRuleGroupConflicts([draft('a', { ruleIds: ['dq-r4'] }), draft('b', { offRuleIds: ['dq-r1'] }), defaultDraft], catalog), []);
  });

  it('overriding Default is never a conflict', () => {
    assert.deepEqual(detectRuleGroupConflicts([draft('a', { offRuleIds: ['dq-r4'] }), defaultDraft], catalog), []);
  });
});

describe('validation of layered groups', () => {
  it('a valid layered configuration has no errors', () => {
    const { errors } = validateRuleGroups([draft('a', { name: 'A', offRuleIds: ['dq-r4'] }), defaultDraft], catalog);
    assert.deepEqual(errors, []);
  });

  it('refuses a rule both ON and OFF, an OFF list on Default, and a core rule turned OFF', () => {
    const both = validateRuleGroups([draft('a', { name: 'A', ruleIds: ['dq-r4'], offRuleIds: ['dq-r4'] }), defaultDraft], catalog).errors;
    assert.ok(both.some((issue) => issue.message.includes('vừa Bật vừa Tắt')));
    const onDefault = validateRuleGroups([draft('a', { name: 'A' }), { ...defaultDraft, offRuleIds: ['dq-r4'] }], catalog).errors;
    assert.ok(onDefault.some((issue) => issue.message.includes('Default không có trạng thái Tắt')));
    const core = validateRuleGroups([draft('a', { name: 'A', offRuleIds: ['phase'] }), defaultDraft], catalog).errors;
    assert.ok(core.some((issue) => issue.message.includes('luôn chạy')));
  });

  it('warns when a group turns the TTM-CNTT rule OFF, and when it names no rule at all', () => {
    const off = validateRuleGroups([draft('a', { name: 'A', offRuleIds: ['ttm-cntt-sep-2026'] }), defaultDraft], catalog).warnings;
    assert.ok(off.some((issue) => issue.message.startsWith('Tắt rule TTM-CNTT')));
    const empty = validateRuleGroups([draft('a', { name: 'A' }), defaultDraft], catalog).warnings;
    assert.ok(empty.some((issue) => issue.message.includes('tất cả Kế thừa')));
  });
});
