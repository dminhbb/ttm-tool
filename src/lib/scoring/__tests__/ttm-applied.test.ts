import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BadgeId } from '../catalog';
import { addWorkingDays } from '../dates';
import { DEFAULT_RULE_GROUP } from '../registry';
import { scoreEpic } from '../score-epic';
import { exceptPlanProblem, normalizeTtmApplied, parseExceptPlanDate } from '../ttm-applied';
import type { EpicFacts, ScoringContext, ScoringRuleGroup } from '../types';
import { planImportBlackList } from '../../import-black-list-plan';
import { makeContext, makeFacts } from './fixtures';

const NO_HOLIDAYS = { holidays: new Set<string>(), workdays: new Set<string>() };

function group(overrides: Partial<ScoringRuleGroup> = {}): ScoringRuleGroup {
  return { id: 1, name: 'G1', priority: 1, isDefault: false, enabled: true, conditions: {}, ruleIds: [], offRuleIds: [], ...overrides };
}

function active(facts: EpicFacts, ctx: ScoringContext): Set<BadgeId> {
  return new Set(scoreEpic(facts, ctx).findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
}

/** An Epic that reached R4GOLIVE on 24/08 — late against the standard Target 21/08 (CT-Lv12, 15 days) but on time for a plan of 25/08. */
function lateButPlanned(overrides: Partial<EpicFacts> = {}): EpicFacts {
  return makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-08-24', ttmApplied: 'EXCEPTION', exceptPlanRaw: '25-08-2026', exceptPlanDate: '2026-08-25', ...overrides });
}

const EXCEPTION_GROUP = group({ id: 1, name: 'Ngoại lệ', priority: 1, ttmApplied: 'EXCEPTION', ruleIds: ['ttm-cntt-except-plan'] });
const GENERAL_GROUP = group({ id: 2, name: 'Chung', priority: 2, ruleIds: ['ttm-cntt-sep-2026'] });

describe('TTM-applied / except-TTM-plan helpers (2026-10-26)', () => {
  it('"Ngoại lệ" and "Không áp dụng" match without caring about accents, case or spacing; everything else is STANDARD', () => {
    assert.equal(normalizeTtmApplied('Ngoại lệ'), 'EXCEPTION');
    assert.equal(normalizeTtmApplied('  NGOAI LE '), 'EXCEPTION');
    assert.equal(normalizeTtmApplied('Không áp dụng'), 'NOT_APPLICABLE');
    assert.equal(normalizeTtmApplied('khong  ap dung'), 'NOT_APPLICABLE');
    for (const standard of ['Theo quy định', 'None', '', null, undefined, 'Ngoại lê!', 'xyz']) assert.equal(normalizeTtmApplied(standard), 'STANDARD', String(standard));
  });

  it('reads dd-MM-yyyy (the crawl), dd/MM/yyyy and ISO; rejects blanks, None and impossible dates', () => {
    assert.equal(parseExceptPlanDate('25-08-2026'), '2026-08-25');
    assert.equal(parseExceptPlanDate('5/9/2026'), '2026-09-05');
    assert.equal(parseExceptPlanDate('2026-08-25'), '2026-08-25');
    for (const bad of ['', '  ', 'None', null, undefined, '31-02-2026', '2026-13-01', 'abc', '25-08-26']) assert.equal(parseExceptPlanDate(bad), null, String(bad));
  });

  it('the plan problems: missing, unreadable, before Start Date, too far', () => {
    assert.equal(exceptPlanProblem('', '2026-08-03'), 'MISSING');
    assert.equal(exceptPlanProblem('None', '2026-08-03'), 'MISSING');
    assert.equal(exceptPlanProblem('soon', '2026-08-03'), 'UNREADABLE');
    assert.equal(exceptPlanProblem('01-08-2026', '2026-08-03'), 'BEFORE_START');
    assert.equal(exceptPlanProblem('01-01-2031', '2026-08-03'), 'TOO_FAR');
    assert.equal(exceptPlanProblem('25-08-2026', '2026-08-03'), null);
    assert.equal(exceptPlanProblem('25-08-2026', null), null, 'no Start Date → R1 handles that, the plan itself is fine');
  });
});

describe('rule R11 — "Ngoại lệ" without a usable Kế hoạch ngoại lệ TTM', () => {
  const ctx = makeContext({ asOf: '2026-09-01' });
  const r11 = 'ANOMALY_R11_EXCEPT_PLAN_INVALID' as const;

  it('flags a blank, unreadable or before-Start plan and takes the Epic out of the verdicts', () => {
    for (const plan of [{ exceptPlanRaw: null, exceptPlanDate: null }, { exceptPlanRaw: 'soon', exceptPlanDate: null }, { exceptPlanRaw: '01-08-2026', exceptPlanDate: '2026-08-01' }]) {
      const badges = active(lateButPlanned(plan), ctx);
      assert.ok(badges.has(r11), JSON.stringify(plan));
      assert.ok(!badges.has('CNTT_FAIL') && !badges.has('CNTT_PASS'), 'Sai lệch dữ liệu gates the verdict');
    }
  });

  it('is silent for a usable plan, for any other TTM-applied, and for a Cancelled Epic', () => {
    assert.ok(!active(lateButPlanned(), ctx).has(r11));
    assert.ok(!active(lateButPlanned({ ttmApplied: 'STANDARD', exceptPlanRaw: null, exceptPlanDate: null }), ctx).has(r11));
    assert.ok(!active(lateButPlanned({ status: 'Cancelled', exceptPlanRaw: null, exceptPlanDate: null }), ctx).has(r11));
  });
});

describe('rule ttm-cntt-except-plan — Target = the Epic\'s own plan', () => {
  const asOf = '2026-09-01';

  it('a Fail under the general rule is Đạt under the plan — one verdict, from the group that wins', () => {
    const general = makeContext({ asOf, ruleGroups: [GENERAL_GROUP] });
    assert.ok(active(lateButPlanned({ ttmApplied: 'STANDARD' }), general).has('CNTT_FAIL'));
    const layered = makeContext({ asOf, ruleGroups: [EXCEPTION_GROUP, GENERAL_GROUP] });
    const badges = active(lateButPlanned(), layered);
    assert.ok(badges.has('CNTT_PASS') && !badges.has('CNTT_FAIL'));
    const card = scoreEpic(lateButPlanned(), layered);
    assert.equal(card.derived.cnttTargetDate, '2026-08-25');
    assert.equal(card.derived.cnttTargetSource, 'EXCEPT_PLAN');
    assert.equal(card.ruleGroup?.name, 'Ngoại lệ');
  });

  it('the group condition keeps non-exception Epics on the general rule', () => {
    const layered = makeContext({ asOf, ruleGroups: [EXCEPTION_GROUP, GENERAL_GROUP] });
    const card = scoreEpic(lateButPlanned({ ttmApplied: 'STANDARD' }), layered);
    assert.equal(card.ruleGroup?.name, 'Chung');
    assert.equal(card.derived.cnttTargetSource, 'BUDGET');
    assert.equal(card.derived.cnttTargetDate, '2026-08-21');
  });

  it('placed BELOW a group that names the slot, the plan rule never runs (the first group naming a slot decides)', () => {
    const below = makeContext({ asOf, ruleGroups: [GENERAL_GROUP, { ...EXCEPTION_GROUP, priority: 2, id: 3 }] });
    assert.ok(active(lateButPlanned(), below).has('CNTT_FAIL'));
  });

  it('Fail when the R4G Date is after the plan, or when the plan has passed with no R4G Date', () => {
    const ctx = makeContext({ asOf, ruleGroups: [EXCEPTION_GROUP] });
    assert.ok(active(lateButPlanned({ r4gDate: '2026-08-26' }), ctx).has('CNTT_FAIL'));
    assert.ok(active(lateButPlanned({ status: 'In Progress', r4gDate: null }), ctx).has('CNTT_FAIL'));
  });

  it('N = working days Start Date → plan; the late alert is a % of it, and the R4GOLIVE baseline is the plan', () => {
    const ctx = makeContext({
      asOf: '2026-08-18',
      ruleGroups: [EXCEPTION_GROUP],
      statusAlertRules: [{ epicComplexityType: 'CT-Lv12', epicStatus: 'In Progress', lateAlertPercent: 80 }],
    });
    const card = scoreEpic(lateButPlanned({ status: 'In Progress', r4gDate: null, exceptPlanRaw: '28-08-2026', exceptPlanDate: '2026-08-28' }), ctx);
    // 03/08 (Mon) → 28/08 (Fri) is 4 full weeks = 20 working days.
    assert.equal(card.derived.cnttBudgetWorkingDays, 20);
    assert.equal(card.derived.cnttLateAlertDate, addWorkingDays('2026-08-03', 16, NO_HOLIDAYS));
    assert.equal(card.derived.phases?.R4GOLIVE.baselineDate, '2026-08-28');
  });

  it('a plan that cannot be used falls back to the budget (R11 flags it)', () => {
    const ctx = makeContext({ asOf, ruleGroups: [EXCEPTION_GROUP] });
    const card = scoreEpic(lateButPlanned({ exceptPlanRaw: '01-08-2026', exceptPlanDate: '2026-08-01' }), ctx);
    assert.equal(card.derived.cnttTargetSource, 'BUDGET');
    assert.equal(card.derived.cnttTargetDate, '2026-08-21');
  });

  it('the Default group alone never uses the plan rule (it is not default-selected)', () => {
    assert.ok(!DEFAULT_RULE_GROUP.ruleIds.includes('ttm-cntt-except-plan'));
    assert.ok(DEFAULT_RULE_GROUP.ruleIds.includes('dq-r11'));
  });
});

describe('Rule Group condition TTM-applied', () => {
  it('EXCEPTION matches only Ngoại lệ Epics; STANDARD matches blank / None / Theo quy định / unknown', () => {
    const ctx = (condition: 'EXCEPTION' | 'STANDARD') => makeContext({ ruleGroups: [group({ ttmApplied: condition })] });
    assert.equal(scoreEpic(makeFacts({ ttmApplied: 'EXCEPTION' }), ctx('EXCEPTION')).ruleGroup?.name, 'G1');
    assert.equal(scoreEpic(makeFacts({ ttmApplied: 'STANDARD' }), ctx('EXCEPTION')).ruleGroup?.isDefault, true);
    assert.equal(scoreEpic(makeFacts(), ctx('EXCEPTION')).ruleGroup?.isDefault, true, 'facts without the field count as STANDARD');
    assert.equal(scoreEpic(makeFacts({ ttmApplied: 'STANDARD' }), ctx('STANDARD')).ruleGroup?.name, 'G1');
    assert.equal(scoreEpic(makeFacts({ ttmApplied: 'EXCEPTION' }), ctx('STANDARD')).ruleGroup?.isDefault, true);
  });
});

describe('import black list for "Không áp dụng" (owner 2026-10-26)', () => {
  const na = (epicKey: string) => ({ epicKey, projectKey: 'WM', ttmApplied: 'NOT_APPLICABLE' as const });
  const std = (epicKey: string) => ({ epicKey, projectKey: 'WM', ttmApplied: 'STANDARD' as const });

  it('adds a missing Epic with source IMPORT; skips one already listed, whoever added it', () => {
    const existing = new Map([['WM-2', { blackListed: true, source: 'MANUAL' as const }], ['WM-3', { blackListed: true, source: 'IMPORT' as const }]]);
    const plan = planImportBlackList([na('wm-1'), na('WM-2'), na('WM-3')], existing);
    assert.deepEqual(plan.add, [{ epicKey: 'WM-1', projectKey: 'WM' }]);
    assert.deepEqual(plan.remove, []);
  });

  it('a person who removed the Epic by hand does not stop the next import adding it again', () => {
    assert.deepEqual(planImportBlackList([na('WM-9')], new Map()).add, [{ epicKey: 'WM-9', projectKey: 'WM' }]);
    assert.deepEqual(planImportBlackList([na('WM-9')], new Map([['WM-9', { blackListed: false, source: 'MANUAL' as const }]])).add, [{ epicKey: 'WM-9', projectKey: 'WM' }]);
  });

  it('removes only rows the import itself added, once the CSV no longer says "Không áp dụng"', () => {
    const existing = new Map([['WM-1', { blackListed: true, source: 'IMPORT' as const }], ['WM-2', { blackListed: true, source: 'MANUAL' as const }]]);
    const plan = planImportBlackList([std('WM-1'), std('WM-2'), std('WM-3')], existing);
    assert.deepEqual(plan.remove, ['WM-1']);
    assert.deepEqual(plan.add, []);
  });
});
