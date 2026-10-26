import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BADGE_BY_ID, BADGES } from '../catalog';
import type { BadgeId } from '../catalog';
import { addWorkingDays } from '../dates';
import { deriveMetrics, findActivePolicy } from '../derive';
import { CORE_RULES, DEFAULT_RULE_GROUP, RULE_BY_ID, RULES, SELECTABLE_RULES } from '../registry';
import { matchesDateRange, orderRuleGroups, policySetsOf, resolveRuleGroup } from '../rule-groups';
import { makeTtmCnttRule } from '../rules/ttm-cntt';
import { SLOT_BADGES } from '../rules/rule-types';
import type { VerdictSlot } from '../rules/rule-types';
import { scoreEpic } from '../score-epic';
import type { EpicFacts, ScoringContext, ScoringRuleGroup, ScoringTtmPolicy } from '../types';
import { makeContext, makeFacts, POLICIES } from './fixtures';

const NO_HOLIDAYS = { holidays: new Set<string>(), workdays: new Set<string>() };

function group(overrides: Partial<ScoringRuleGroup> = {}): ScoringRuleGroup {
  return { id: 1, name: 'G1', priority: 1, isDefault: false, enabled: true, conditions: {}, ruleIds: DEFAULT_RULE_GROUP.ruleIds, ...overrides };
}

function withoutRules(...ids: string[]): string[] {
  return DEFAULT_RULE_GROUP.ruleIds.filter((id) => !ids.includes(id));
}

/** A non-default group that turns these rules OFF and says nothing else about the rest (the rest is inherited). */
function off(...ids: string[]): Pick<ScoringRuleGroup, 'ruleIds' | 'offRuleIds'> {
  return { ruleIds: [], offRuleIds: ids };
}

function activeOf(facts: EpicFacts, ctx: ScoringContext): Set<BadgeId> {
  return new Set(scoreEpic(facts, ctx).findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
}

/** Badges the engine itself emits (no rule owns them). */
const ENGINE_BADGES: readonly BadgeId[] = ['CNTT_NO_RULE', 'E2E_NO_RULE'];

describe('rule registry (spec 2026-10-25 §4–5)', () => {
  it('ids are unique, lower-case kebab, and stable for the two named variants', () => {
    const ids = RULES.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
    assert.ok(RULE_BY_ID.has('ttm-cntt-sep-2026'));
    assert.ok(RULE_BY_ID.has('ttm-e2e-july-2026'));
  });

  it('every badge has exactly one owner: one rule, or the engine', () => {
    const owners = new Map<BadgeId, string[]>();
    for (const rule of RULES) for (const badge of rule.emits) owners.set(badge, [...(owners.get(badge) ?? []), rule.id]);
    for (const badge of BADGES) {
      const ruleOwners = owners.get(badge.id) ?? [];
      if (ENGINE_BADGES.includes(badge.id)) assert.equal(ruleOwners.length, 0, badge.id);
      else assert.equal(ruleOwners.length, 1, `${badge.id}: ${ruleOwners.join(', ') || 'no owner'}`);
    }
    for (const badge of owners.keys()) assert.ok(BADGE_BY_ID.has(badge), `unknown badge ${badge}`);
  });

  it('a core gate badge is never owned by a selectable rule', () => {
    for (const rule of SELECTABLE_RULES) {
      for (const badge of rule.emits) assert.ok(!('core' in BADGE_BY_ID.get(badge)! && BADGE_BY_ID.get(badge)!.core), `${rule.id} owns core badge ${badge}`);
    }
  });

  it('every selectable rule fills a slot, core rules fill none (2026-10-26)', () => {
    for (const rule of SELECTABLE_RULES) assert.ok(rule.slot, `${rule.id} has no slot`);
    for (const rule of CORE_RULES) assert.equal(rule.slot, undefined, rule.id);
  });

  it('rules sharing a slot are variants: they emit the same badges', () => {
    const bySlot = new Map<string, string>();
    for (const rule of SELECTABLE_RULES) {
      const key = [...rule.emits].sort().join(',');
      const seen = bySlot.get(rule.slot!);
      if (seen !== undefined) assert.equal(seen, key, `${rule.id} differs from the other rules of ${rule.slot}`);
      bySlot.set(rule.slot!, key);
    }
  });

  it('slot contract: every verdict rule emits exactly its slot badges, is selectable and gated by "Sai lệch dữ liệu"', () => {
    for (const rule of RULES.filter((item) => item.slot && item.slot in SLOT_BADGES)) {
      assert.deepEqual([...rule.emits].sort(), [...SLOT_BADGES[rule.slot as VerdictSlot]].sort(), rule.id);
      assert.equal(rule.core, false, rule.id);
      assert.equal(rule.gatedByDataAnomaly, true, rule.id);
      assert.ok(rule.policySet, rule.id);
    }
  });

  it('owner decisions of 2026-10-25: the 5 extra rules always run; the listed ones are selectable', () => {
    for (const id of ['ttm-cntt-late', 'ttm-e2e-gates', 'release-status-mismatch', 'release-on-time', 'phase']) assert.equal(RULE_BY_ID.get(id)?.core, true, id);
    const selectable = ['ttm-cntt-sep-2026', 'ttm-e2e-july-2026', 'dq-r1', 'dq-r2', 'dq-r3', 'dq-r4', 'dq-r5', 'dq-r6', 'dq-r8', 'dq-r9', 'dq-r10',
      'fail-reason-stage', 'fail-reason-dept', 'release-justify-golive', 'release-waiting-golive'];
    assert.deepEqual(SELECTABLE_RULES.map((rule) => rule.id).sort(), [...selectable].sort());
    assert.ok(CORE_RULES.every((rule) => !rule.slot));
  });

  it('the default group built in code selects every rule, one per slot', () => {
    assert.deepEqual([...DEFAULT_RULE_GROUP.ruleIds].sort(), SELECTABLE_RULES.map((rule) => rule.id).sort());
    for (const slot of new Set(SELECTABLE_RULES.map((rule) => rule.slot))) {
      assert.equal(SELECTABLE_RULES.filter((rule) => rule.slot === slot && DEFAULT_RULE_GROUP.ruleIds.includes(rule.id)).length, 1, String(slot));
    }
  });
});

describe('Rule Group resolution (§6.2)', () => {
  it('date range: both ends inclusive, open ends, a missing date never matches a bounded range (D3, D4)', () => {
    const range = { from: '2026-09-01', to: '2026-09-30' };
    assert.ok(matchesDateRange('2026-09-01', range));
    assert.ok(matchesDateRange('2026-09-30', range));
    assert.ok(!matchesDateRange('2026-08-31', range));
    assert.ok(!matchesDateRange('2026-10-01', range));
    assert.ok(matchesDateRange('2030-01-01', { from: '2026-09-01', to: null }));
    assert.ok(matchesDateRange('2020-01-01', { from: null, to: '2026-09-01' }));
    assert.ok(!matchesDateRange(null, { from: '2026-09-01', to: null }));
    assert.ok(matchesDateRange(null, { from: null, to: null }));
    assert.ok(matchesDateRange(null, undefined));
    assert.ok(matchesDateRange('2026-09-01T08:30:00+07:00', range), 'timestamps compare by their date');
  });

  it('every condition must hold (AND)', () => {
    const g = group({ conditions: { startDate: { from: '2026-08-01', to: null }, r4gDate: { from: '2026-09-01', to: null } } });
    assert.equal(resolveRuleGroup(makeFacts({ r4gDate: '2026-09-05' }), [g]).id, 1);
    assert.equal(resolveRuleGroup(makeFacts({ r4gDate: '2026-08-25' }), [g]).isDefault, true);
    assert.equal(resolveRuleGroup(makeFacts({ r4gDate: null }), [g]).isDefault, true, 'no R4G Date → not in the group');
  });

  it('highest priority wins; disabled groups are skipped; no match → default (D2)', () => {
    const wide = group({ id: 1, name: 'wide', priority: 2 });
    const narrow = group({ id: 2, name: 'narrow', priority: 1, conditions: { startDate: { from: '2026-08-01', to: null } } });
    assert.equal(resolveRuleGroup(makeFacts(), [wide, narrow]).name, 'narrow');
    assert.equal(resolveRuleGroup(makeFacts({ startDate: '2026-07-01' }), [wide, narrow]).name, 'wide');
    assert.equal(resolveRuleGroup(makeFacts(), [wide, { ...narrow, enabled: false }]).name, 'wide');
    assert.equal(resolveRuleGroup(makeFacts(), [{ ...wide, enabled: false }]).isDefault, true);
  });

  it('the default group always comes last; without one the code default is used', () => {
    const dbDefault = group({ id: 9, name: 'Default', isDefault: true, priority: 0, ruleIds: withoutRules('dq-r2') });
    const ordered = orderRuleGroups([dbDefault, group({ id: 3, priority: 5 })]);
    assert.deepEqual(ordered.map((item) => item.id), [3, 9]);
    assert.equal(orderRuleGroups(undefined)[0], DEFAULT_RULE_GROUP);
    assert.equal(resolveRuleGroup(makeFacts({ startDate: null }), [group({ conditions: { startDate: { from: '2026-01-01', to: null } } })]), DEFAULT_RULE_GROUP);
  });
});

describe('engine with Rule Groups (§7)', () => {
  const asOf = '2026-09-01'; // fixture Epic: no R4G Date, past Target_CNTT 2026-08-21 and Target_E2E → Fail on both

  it('the scorecard names its group; an "Epic ngoại lệ" has none', () => {
    assert.deepEqual(scoreEpic(makeFacts(), makeContext()).ruleGroup, { id: 0, name: 'Default', isDefault: true });
    const g = group({ name: 'Sep-2026' });
    assert.deepEqual(scoreEpic(makeFacts(), makeContext({ ruleGroups: [g] })).ruleGroup, { id: 1, name: 'Sep-2026', isDefault: false });
    assert.equal(scoreEpic(makeFacts({ ttmExclusion: 'BLACK_LISTED' }), makeContext({ ruleGroups: [g] })).ruleGroup, null);
  });

  it('a rule the group turns OFF does not run, even though Default turns it on (plus the core ones)', () => {
    const facts = makeFacts({ requestType: '' });
    assert.ok(activeOf(facts, makeContext()).has('ANOMALY_R4_MISSING_REQUEST_TYPE'));
    const active = activeOf(facts, makeContext({ ruleGroups: [group({ ...off('dq-r4') })] }));
    assert.ok(!active.has('ANOMALY_R4_MISSING_REQUEST_TYPE'));
    assert.ok(!active.has('REC_FILL_REQUEST_TYPE'));
    assert.ok(active.has('CNTT_FAIL'), 'without the anomaly the Epic is judged again');
    assert.ok(active.has('PHASE_LATE') || active.has('PHASE_CURRENT'), 'core phase rule still runs');
  });

  it('group that turns the TTM-CNTT rule OFF: "Không áp dụng rule TTM-CNTT", no verdict, out of L02 (D6, D13)', () => {
    const ctx = makeContext({ asOf, ruleGroups: [group({ ...off('ttm-cntt-sep-2026') })] });
    const card = scoreEpic(makeFacts({ status: 'MVP DONE', r4gDate: '2026-08-25' }), ctx);
    const active = new Set(card.findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
    assert.ok(active.has('CNTT_NO_RULE'));
    assert.ok(!active.has('CNTT_FAIL') && !active.has('CNTT_PASS'));
    assert.ok(!active.has('REC_MISSING_FAIL_REASON') && !active.has('REC_MISSING_RESPONSIBLE_DEPARTMENT'));
    assert.equal(card.indexMembership.ttm.counted, false);
    assert.equal(card.indexMembership.qa.counted, false);
    assert.ok(active.has('E2E_FAIL'), 'TTM-E2E is still judged');
  });

  it('"Cảnh báo muộn" (always runs) is hidden when the group has no TTM-CNTT rule', () => {
    const lateDate = addWorkingDays('2026-08-03', 13, NO_HOLIDAYS);
    assert.ok(activeOf(makeFacts(), makeContext({ asOf: lateDate })).has('CNTT_LATE'));
    const ctx = makeContext({ asOf: lateDate, ruleGroups: [group({ ...off('ttm-cntt-sep-2026') })] });
    assert.ok(!activeOf(makeFacts(), ctx).has('CNTT_LATE'));
  });

  it('group that turns the TTM-E2E rule OFF: "Không áp dụng rule TTM-E2E", no E2E verdict; TTM-CNTT unaffected', () => {
    const active = activeOf(makeFacts(), makeContext({ asOf, ruleGroups: [group({ ...off('ttm-e2e-july-2026') })] }));
    assert.ok(active.has('E2E_NO_RULE'));
    assert.ok(!active.has('E2E_FAIL') && !active.has('E2E_PASS'));
    assert.ok(active.has('CNTT_FAIL'));
    assert.ok(!active.has('CNTT_NO_RULE'));
  });

  it('a Cancelled Epic gets no "Không áp dụng rule" note (it already has "Không áp dụng")', () => {
    const active = activeOf(makeFacts({ status: 'Cancelled' }), makeContext({ ruleGroups: [group({ ...off(...DEFAULT_RULE_GROUP.ruleIds) })] }));
    assert.ok(!active.has('CNTT_NO_RULE') && !active.has('E2E_NO_RULE'));
  });

  it('"Sai lệch dữ liệu" drops every verdict rule, whichever variant the group runs (§4.3)', () => {
    const facts = makeFacts({ requestType: '' }); // R4
    const active = activeOf(facts, makeContext({ asOf }));
    assert.ok(active.has('ANOMALY_R4_MISSING_REQUEST_TYPE'));
    for (const badge of ['CNTT_FAIL', 'CNTT_PASS', 'CNTT_LATE', 'E2E_FAIL', 'E2E_PASS'] as const) assert.ok(!active.has(badge), badge);
  });
});

describe('"Bộ ngân sách" (§17)', () => {
  const POLICIES_2027: ScoringTtmPolicy[] = [
    ...POLICIES,
    { epicComplexityType: 'CT-Lv12', fromTtmField: 'START_DATE', isActive: true, toTtmField: 'R4G_DATE', ttmType: 'TTM_CNTT', workingDays: 12, policySet: '2027' },
  ];

  it('a set holds only the rows that differ; a missing row is inherited from DEFAULT', () => {
    assert.equal(findActivePolicy(POLICIES_2027, 'TTM_CNTT', 'CT-Lv12', '2027')?.workingDays, 12);
    assert.equal(findActivePolicy(POLICIES_2027, 'TTM_CNTT', 'CT-Lv12')?.workingDays, 15);
    assert.equal(findActivePolicy(POLICIES_2027, 'TTM_CNTT', 'SP-Lv12', '2027')?.workingDays, 30, 'inherited');
    assert.equal(findActivePolicy(POLICIES_2027, 'TTM_E2E', 'CT-Lv12', '2027')?.workingDays, 20, 'inherited');
  });

  it('the verdict rules of the group pick the set; Target and phase baselines follow it', () => {
    const variant2027 = makeTtmCnttRule({ id: 'ttm-cntt-2027', name: 'TTM-CNTT 2027', summary: '', policySet: '2027' });
    assert.deepEqual(policySetsOf([variant2027]), { cntt: '2027', e2e: 'DEFAULT' });
    assert.deepEqual(policySetsOf([]), { cntt: 'DEFAULT', e2e: 'DEFAULT' });
    const ctx = makeContext({ ttmPolicies: POLICIES_2027 });
    const d2026 = deriveMetrics(makeFacts(), ctx);
    const d2027 = deriveMetrics(makeFacts(), ctx, policySetsOf([variant2027]));
    assert.equal(d2026.cnttTargetDate, '2026-08-21');
    assert.equal(d2027.cnttTargetDate, addWorkingDays('2026-08-03', 11, NO_HOLIDAYS));
    assert.equal(d2027.cnttPolicySet, '2027');
    assert.equal(d2027.phases?.R4GOLIVE.baselineDate, d2027.cnttTargetDate);
    assert.equal(d2027.e2eTargetDate, d2026.e2eTargetDate, 'TTM-E2E keeps the DEFAULT budget');
  });

  it('slot contract on a budget-only variant: same verdicts, its own Target', () => {
    const variant = makeTtmCnttRule({ id: 'ttm-cntt-2027', name: 'TTM-CNTT 2027', summary: '', policySet: '2027' });
    const ctx = makeContext({ ttmPolicies: POLICIES_2027, asOf: '2026-08-25' });
    const derived = deriveMetrics(makeFacts(), ctx, policySetsOf([variant]));
    // No R4G Date and past the 12-day Target (2026-08-18) → Fail; the 15-day rule would still be on time.
    assert.deepEqual(variant.evaluate!({ facts: makeFacts(), derived, ctx, hasDataAnomaly: false }).map((item) => item.badge), ['CNTT_FAIL']);
    // R4G Date reached and on time → Đạt only once asOf reaches it.
    const onTime = makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-08-14' });
    const reached = variant.evaluate!({ facts: onTime, derived: deriveMetrics(onTime, ctx, policySetsOf([variant])), ctx, hasDataAnomaly: false });
    assert.deepEqual(reached.map((item) => item.badge), ['CNTT_PASS']);
  });
});

describe('layered Rule Groups (2026-10-26)', () => {
  const asOf = '2026-09-01';
  const facts = makeFacts({ requestType: '' }); // R4 anomaly while dq-r4 applies
  const r4 = 'ANOMALY_R4_MISSING_REQUEST_TYPE' as const;
  const sep = { startDate: { from: '2026-08-01', to: null } } as const;

  it('a rule the group does not name is inherited from Default (Kế thừa)', () => {
    const inheriting = group({ ruleIds: [], offRuleIds: [], conditions: sep });
    assert.ok(activeOf(facts, makeContext({ asOf, ruleGroups: [inheriting] })).has(r4), 'dq-r4 comes from Default');
    assert.deepEqual(scoreEpic(facts, makeContext({ asOf, ruleGroups: [inheriting] })).ruleGroup, { id: 1, name: 'G1', isDefault: false });
  });

  it('OFF wins over a lower group and Default that turn the rule ON; ON in a higher group beats a lower OFF', () => {
    const lowerOff = group({ id: 2, name: 'lower', priority: 2, ...off('dq-r4') });
    const higherOn = group({ id: 1, name: 'higher', priority: 1, ruleIds: ['dq-r4'], offRuleIds: [] });
    assert.ok(!activeOf(facts, makeContext({ asOf, ruleGroups: [lowerOff] })).has(r4));
    assert.ok(activeOf(facts, makeContext({ asOf, ruleGroups: [higherOn, lowerOff] })).has(r4), 'higher group turns it ON again');
    const higherOff = group({ id: 1, name: 'higher', priority: 1, ...off('dq-r4') });
    const lowerOn = group({ id: 2, name: 'lower', priority: 2, ruleIds: ['dq-r4'], offRuleIds: [] });
    assert.ok(!activeOf(facts, makeContext({ asOf, ruleGroups: [higherOff, lowerOn] })).has(r4), 'the higher group decides');
  });

  it('a group the Epic does not match, or a disabled one, says nothing', () => {
    const elsewhere = group({ ...off('dq-r4'), conditions: { startDate: { from: '2030-01-01', to: null } } });
    assert.ok(activeOf(facts, makeContext({ asOf, ruleGroups: [elsewhere] })).has(r4));
    assert.ok(activeOf(facts, makeContext({ asOf, ruleGroups: [group({ ...off('dq-r4'), enabled: false })] })).has(r4));
  });

  it('the two groups of the owner example: rule 1 for R4G < 1/9, rule 2 for Due > 1/10 — an Epic in both gets both', () => {
    const early = group({ id: 1, name: 'early', priority: 1, ...off('dq-r1'), conditions: { r4gDate: { from: null, to: '2026-08-31' } } });
    const late = group({ id: 2, name: 'late', priority: 2, ...off('dq-r4'), conditions: { dueDate: { from: '2026-10-02', to: null } } });
    const both = makeFacts({ requestType: '', startDate: null, r4gDate: '2026-08-20', dueDate: '2026-10-15' });
    const active = activeOf(both, makeContext({ asOf, ruleGroups: [early, late] }));
    assert.ok(!active.has(r4), 'late group still applies although the Epic also sits in the earlier group');
    assert.ok(!active.has('ANOMALY_R1_MISSING_START_DATE'), 'early group applies too');
    assert.equal(scoreEpic(both, makeContext({ asOf, ruleGroups: [early, late] })).ruleGroup?.name, 'early', 'the scorecard names the highest-priority group');
  });

  it('CNTT_NO_RULE names the group that turned the verdict rule OFF', () => {
    const card = scoreEpic(makeFacts(), makeContext({ asOf, ruleGroups: [group({ name: 'Tắt CNTT', ...off('ttm-cntt-sep-2026') })] }));
    const note = card.findings.find((item) => item.badge === 'CNTT_NO_RULE');
    assert.ok(note?.message.includes('Tắt CNTT'));
  });

  it('Default never uses the OFF list; an unlisted Default rule simply does not apply', () => {
    const dbDefault = group({ id: 9, name: 'Default', isDefault: true, priority: 0, ruleIds: withoutRules('dq-r4') });
    assert.ok(!activeOf(facts, makeContext({ asOf, ruleGroups: [dbDefault] })).has(r4));
  });
});
