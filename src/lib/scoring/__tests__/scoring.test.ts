import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BADGES, BADGE_BY_ID, BADGE_LIST, FINDING_GROUPS, SCORING_AXES, SUPPRESSIONS } from '../catalog';
import type { BadgeId } from '../catalog';
import { addWorkingDays, diffWorkingDays, toIsoDate } from '../dates';
import { deriveMetrics } from '../derive';
import { resolveScoringParameters } from '../parameters';
import { scoreEpic } from '../score-epic';
import { activeFindings, badgeCodesOf, hasBadge, indexFlagsOf, primaryFinding } from '../select';
import type { EpicFacts, ScoringContext } from '../types';
import { makeContext, makeFacts } from './fixtures';

const NO_HOLIDAYS = { holidays: new Set<string>(), workdays: new Set<string>() };

function active(facts: EpicFacts, ctx: ScoringContext): Set<BadgeId> {
  return new Set(activeFindings(scoreEpic(facts, ctx)).map((item) => item.badge));
}

describe('catalog', () => {
  it('every badge belongs to exactly one known axis and one known group, ids unique', () => {
    const axes = new Set(SCORING_AXES.map((axis) => axis.id));
    const groups = new Set(FINDING_GROUPS.map((group) => group.id));
    const ids = new Set<string>();
    for (const badge of BADGES) {
      assert.ok(axes.has(badge.axis), `${badge.id} axis`);
      assert.ok(groups.has(badge.group), `${badge.id} group`);
      assert.ok(!ids.has(badge.id), `${badge.id} duplicated`);
      ids.add(badge.id);
    }
  });

  it('suppression rules only reference catalog badges', () => {
    for (const rule of SUPPRESSIONS) {
      assert.ok(BADGE_BY_ID.has(rule.when));
      rule.suppress.forEach((badge) => assert.ok(BADGE_BY_ID.has(badge)));
    }
  });

  it('decisions of 2026-09-29 are reflected', () => {
    assert.equal(BADGE_BY_ID.get('CNTT_STATUS_MISMATCH')?.group, 'RECOMMENDATION');
    assert.equal(BADGE_BY_ID.get('RELEASE_STATUS_MISMATCH')?.group, 'RECOMMENDATION');
    assert.equal(BADGE_BY_ID.get('ANOMALY_R2_PENDING_TOO_LONG')?.group, 'RECOMMENDATION');
    assert.equal(BADGE_BY_ID.get('RELEASE_JUSTIFY_GOLIVE')?.group, 'FAIL');
    assert.equal(BADGE_BY_ID.get('RELEASE_WAITING_GOLIVE')?.group, 'ALERT');
    assert.equal(BADGE_BY_ID.get('PHASE_DONE')?.group, 'NOTE');
    assert.ok(!BADGE_LIST.some((badge) => badge.label === 'Cảnh báo sớm'));
  });
});

describe('dates', () => {
  it('adds and diffs working days independent of time zone, honoring holidays and makeup days', () => {
    assert.equal(addWorkingDays('2026-08-07', 1, NO_HOLIDAYS), '2026-08-10'); // Fri → Mon
    assert.equal(addWorkingDays('2026-08-03', 14, NO_HOLIDAYS), '2026-08-21');
    const holidays = { holidays: new Set(['2026-08-10']), workdays: new Set(['2026-08-08']) };
    assert.equal(addWorkingDays('2026-08-07', 1, holidays), '2026-08-08'); // makeup Saturday
    assert.equal(addWorkingDays('2026-08-08', 1, holidays), '2026-08-11'); // skips holiday Monday
    assert.equal(diffWorkingDays('2026-08-03', '2026-08-21', NO_HOLIDAYS), 14);
    assert.equal(diffWorkingDays('2026-08-21', '2026-08-03', NO_HOLIDAYS), -14);
    assert.equal(toIsoDate('2026-07-20 10:23:00+07'), '2026-07-20');
  });
});

describe('TTM-CNTT', () => {
  const ctx = makeContext();

  it('Target_CNTT = T1 +wd (N − 1) — Start Date is day 1', () => {
    assert.equal(deriveMetrics(makeFacts(), ctx).cnttTargetDate, '2026-08-21');
  });

  it('asOf boundaries around Target without R4G: last day on time, next day Fail', () => {
    assert.ok(!active(makeFacts(), makeContext({ asOf: '2026-08-21' })).has('CNTT_FAIL'));
    assert.ok(active(makeFacts(), makeContext({ asOf: '2026-08-22' })).has('CNTT_FAIL'));
  });

  it('Cảnh báo muộn from T1 + late offset up to Target; no early warning badge at all', () => {
    const lateDate = addWorkingDays('2026-08-03', 13, NO_HOLIDAYS); // DEV inherits "In Progress"
    assert.ok(!active(makeFacts(), makeContext({ asOf: addWorkingDays(lateDate, -1, NO_HOLIDAYS) })).has('CNTT_LATE'));
    assert.ok(active(makeFacts(), makeContext({ asOf: lateDate })).has('CNTT_LATE'));
  });

  it('R4G on time and reached + status ≥ R4GOLIVE → Đạt; R4G after Target → Fail', () => {
    const facts = makeFacts({ r4gDate: '2026-08-21', status: 'R4GOLIVE' });
    assert.ok(active(facts, ctx).has('CNTT_PASS'));
    assert.ok(active({ ...facts, r4gDate: '2026-08-24' }, ctx).has('CNTT_FAIL'));
  });

  it('Sai Status (2026-10-01): R4G reached on time but status < R4GOLIVE → still Đạt, plus the Sai Status recommendation', () => {
    const card = scoreEpic(makeFacts({ r4gDate: '2026-08-20', status: 'TEST' }), ctx);
    assert.ok(hasBadge(card, 'CNTT_STATUS_MISMATCH'));
    assert.ok(hasBadge(card, 'CNTT_PASS'));
    assert.deepEqual(card.indexMembership.ttm, { counted: true, eligible: true, pass: true, fail: false });
    // A future-dated R4G Date gets neither badge until asOf reaches it.
    const future = active(makeFacts({ r4gDate: '2026-08-20', status: 'TEST' }), makeContext({ asOf: '2026-08-10' }));
    assert.ok(!future.has('CNTT_PASS') && !future.has('CNTT_STATUS_MISMATCH'));
  });

  it('Sai lệch dữ liệu is checked first: no Đạt/Fail/Cảnh báo muộn/Sai Status on any TTM axis', () => {
    const late = makeContext({ asOf: '2026-12-01' });
    const failing = scoreEpic(makeFacts({ requirementLevel: '' }), late);
    assert.ok(hasBadge(failing, 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL'));
    assert.ok(!failing.findings.some((item) => ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH', 'E2E_FAIL', 'E2E_PASS', 'E2E_STATUS_MISMATCH'].includes(item.badge)));
    assert.deepEqual(failing.indexMembership.ttm, { counted: true, eligible: false, pass: false, fail: false });
    const passing = scoreEpic(makeFacts({ requirementLevel: '', r4gDate: '2026-08-20', status: 'TEST' }), late);
    assert.ok(!passing.findings.some((item) => item.badge === 'CNTT_PASS' || item.badge === 'E2E_PASS'));
    // "Pending lâu" (R2) and Release "Sai Status" (R7) are recommendations — they don't gate.
    assert.ok(active(makeFacts({ status: 'Pending' }), late).has('CNTT_FAIL'));
    // A disabled anomaly rule doesn't gate either.
    assert.ok(active(makeFacts({ requirementLevel: '' }), makeContext({ asOf: '2026-12-01', ruleEnabled: { ANOMALY_R5_MISSING_REQUIREMENT_LEVEL: false } })).has('CNTT_FAIL'));
  });

  it('future R4G Date: in the Index denominator but not passed yet (Q3)', () => {
    const card = scoreEpic(makeFacts({ r4gDate: '2026-08-20', status: 'R4GOLIVE' }), makeContext({ asOf: '2026-08-10' }));
    assert.ok(!hasBadge(card, 'CNTT_PASS'));
    assert.deepEqual(card.indexMembership.ttm, { counted: true, eligible: true, pass: false, fail: false });
  });

  it('missing Start Date → Không tính được, hides every other CNTT badge, recommends filling T1', () => {
    const card = scoreEpic(makeFacts({ startDate: null }), makeContext({ asOf: '2026-12-01' }));
    assert.equal(primaryFinding(card, 'TTM_CNTT')?.badge, 'CNTT_CALC_BROKEN');
    assert.ok(hasBadge(card, 'REC_FILL_START_DATE'));
    assert.ok(hasBadge(card, 'PHASE_NOT_COMPUTABLE'));
  });

  it('Cancelled → Không áp dụng, never counted in the Index', () => {
    const card = scoreEpic(makeFacts({ status: 'Cancelled' }), makeContext({ asOf: '2026-12-01' }));
    assert.equal(primaryFinding(card, 'TTM_CNTT')?.badge, 'CNTT_NOT_APPLICABLE');
    assert.ok(card.findings.some((item) => item.badge === 'CNTT_FAIL' && item.suppressedBy?.includes('CNTT_NOT_APPLICABLE')));
    assert.equal(card.indexMembership.ttm.counted, false);
  });

  it('out of "Phạm vi" → verdicts hidden (not dropped) and excluded from the Index', () => {
    const scoped = makeContext({ asOf: '2026-12-01', scope: { cnttFrom: '2027-01-01', cnttTo: null, qaFrom: null, qaTo: null } });
    const card = scoreEpic(makeFacts(), scoped);
    assert.ok(hasBadge(card, 'SCOPE_CNTT_OUT'));
    assert.ok(card.findings.some((item) => item.badge === 'CNTT_FAIL' && item.suppressedBy?.includes('SCOPE_CNTT_OUT')));
    assert.equal(card.indexMembership.ttm.counted, false);
  });
});

describe('TTM-E2E', () => {
  it('Target_E2E = T0 +wd (N − 1); without an end date the Epic fails once asOf passes Target', () => {
    const facts = makeFacts();
    const target = deriveMetrics(facts, makeContext()).e2eTargetDate!;
    assert.equal(target, addWorkingDays('2026-07-27', 19, NO_HOLIDAYS));
    assert.ok(!active(facts, makeContext({ asOf: target })).has('E2E_FAIL'));
    assert.ok(active(facts, makeContext({ asOf: addWorkingDays(target, 1, NO_HOLIDAYS) })).has('E2E_FAIL'));
  });

  it('Đạt: end date reached and ≤ Target — no Released requirement; status < R4GOLIVE adds Sai Status', () => {
    const target = deriveMetrics(makeFacts(), makeContext()).e2eTargetDate!;
    const late = makeContext({ asOf: '2026-12-01' });
    const atR4g = active(makeFacts({ r4gDate: target, status: 'R4GOLIVE' }), late);
    assert.ok(atR4g.has('E2E_PASS') && !atR4g.has('E2E_STATUS_MISMATCH'));
    const lowStatus = active(makeFacts({ r4gDate: target, status: 'TEST' }), late);
    assert.ok(lowStatus.has('E2E_PASS') && lowStatus.has('E2E_STATUS_MISMATCH'));
    assert.ok(active(makeFacts({ r4gDate: addWorkingDays(target, 1, NO_HOLIDAYS), status: 'Released' }), late).has('E2E_FAIL'));
    // Future-dated end: not judged yet when on time, already Fail when past Target.
    const before = makeContext({ asOf: '2026-08-03' });
    const onTimeFuture = active(makeFacts({ r4gDate: target, status: 'R4GOLIVE' }), before);
    assert.ok(!onTimeFuture.has('E2E_PASS') && !onTimeFuture.has('E2E_FAIL'));
    assert.ok(active(makeFacts({ r4gDate: addWorkingDays(target, 1, NO_HOLIDAYS) }), before).has('E2E_FAIL'));
  });

  it('missing T0 → baseline from Jira creation date + recommendation', () => {
    const codes = active(makeFacts({ ideaApprovedDate: null }), makeContext());
    assert.ok(codes.has('E2E_BASELINE_FROM_JIRA_CREATED'));
    assert.ok(codes.has('REC_FILL_IDEA_APPROVED_DATE'));
  });
});

describe('Release', () => {
  const base = makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-08-20' });
  it('Chờ golive inside grace; nothing once status is past R4GOLIVE (early warning removed); Giải trình after grace', () => {
    assert.ok(active(base, makeContext({ asOf: '2026-08-24' })).has('RELEASE_WAITING_GOLIVE'));
    const past = active({ ...base, status: 'MVPDONE' }, makeContext({ asOf: '2026-08-24' }));
    assert.ok(![...past].some((badge) => badge.startsWith('RELEASE_')));
    assert.ok(active(base, makeContext({ asOf: '2026-08-28' })).has('RELEASE_JUSTIFY_GOLIVE'));
  });

  it('former R7: Due on time but not Released → Sai Status (Release), not a data anomaly', () => {
    const card = scoreEpic({ ...base, dueDate: '2026-08-25' }, makeContext({ asOf: '2026-08-26' }));
    assert.ok(hasBadge(card, 'RELEASE_STATUS_MISMATCH'));
    assert.equal(card.indexMembership.ttm.eligible, true);
  });

  it('Release đúng hạn ships disabled and can be enabled per rule', () => {
    const released = { ...base, status: 'Released', dueDate: '2026-08-25' };
    assert.ok(!active(released, makeContext({ asOf: '2026-09-01' })).has('RELEASE_ON_TIME'));
    assert.ok(active(released, makeContext({ asOf: '2026-09-01', ruleEnabled: { RELEASE_ON_TIME: true } })).has('RELEASE_ON_TIME'));
  });

  describe('Chờ golive (rule đổi 2026-10-01: status-based, không phụ thuộc R4G Date/grace)', () => {
    it('status R4GOLIVE fires even with no R4G Date at all ("Thiếu R4G Date")', () => {
      const noR4g = { ...base, r4gDate: null };
      assert.ok(active(noR4g, makeContext({ asOf: '2026-08-24' })).has('RELEASE_WAITING_GOLIVE'));
    });

    it('status RELEASED with no Due Date fires regardless of grace timing; Due Date present does not', () => {
      const releasedNoDue = { ...base, status: 'Released', dueDate: null };
      assert.ok(active(releasedNoDue, makeContext({ asOf: '2026-08-24' })).has('RELEASE_WAITING_GOLIVE'));
      // Long overdue (asOf far past R4G + grace) still counts — timing moved to a Dashboard sub-filter, not the badge itself.
      assert.ok(active(releasedNoDue, makeContext({ asOf: '2026-12-01' })).has('RELEASE_WAITING_GOLIVE'));
      const releasedWithDue = { ...base, status: 'Released', dueDate: '2026-08-25' };
      assert.ok(!active(releasedWithDue, makeContext({ asOf: '2026-08-24' })).has('RELEASE_WAITING_GOLIVE'));
    });

    it('can coexist with Giải trình Golive (2 nhóm finding khác nhau, không loại trừ nhau nữa)', () => {
      const releasedNoDue = { ...base, status: 'Released', dueDate: null };
      const activeBadges = active(releasedNoDue, makeContext({ asOf: '2026-08-28' })); // past grace (R4G 08-20 + 5wd = 08-27)
      assert.ok(activeBadges.has('RELEASE_WAITING_GOLIVE'));
      assert.ok(activeBadges.has('RELEASE_JUSTIFY_GOLIVE'));
    });

    it('ngoài "Phạm vi dữ liệu cho TTM" (SCOPE_CNTT_OUT) thì bị che', () => {
      const outOfScopeCtx = makeContext({ asOf: '2026-08-24', scope: { cnttFrom: '2026-09-01', cnttTo: null, qaFrom: null, qaTo: null } });
      assert.ok(!active(base, outOfScopeCtx).has('RELEASE_WAITING_GOLIVE'));
    });
  });
});

describe('Data quality', () => {
  it('R1/R3–R6 are "Sai lệch dữ liệu" and remove the Epic from the Index denominator', () => {
    const card = scoreEpic(makeFacts({ requirementLevel: '', r4gDate: '2026-08-20', status: 'R4GOLIVE' }), makeContext());
    assert.ok(hasBadge(card, 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL'));
    assert.ok(hasBadge(card, 'REC_FILL_REQUIREMENT_LEVEL'));
    assert.equal(card.indexMembership.ttm.eligible, false);
  });

  it('R2 "Pending lâu" is a recommendation only (threshold 20% of 15 = 3 working days)', () => {
    const facts = makeFacts({ status: 'Pending' });
    assert.ok(!active(facts, makeContext({ asOf: '2026-08-05' })).has('ANOMALY_R2_PENDING_TOO_LONG'));
    const card = scoreEpic({ ...facts, r4gDate: '2026-08-20' }, makeContext({ asOf: '2026-08-06' }));
    assert.ok(hasBadge(card, 'ANOMALY_R2_PENDING_TOO_LONG'));
    assert.equal(card.indexMembership.ttm.eligible, true);
  });

  it('exempt statuses skip every data-quality rule', () => {
    const codes = active(makeFacts({ status: 'In PO', requirementLevel: '', startDate: null }), makeContext());
    assert.ok(![...codes].some((badge) => badge.startsWith('ANOMALY_')));
  });
});

describe('Phases', () => {
  it('late only when not done at asOf and past baseline; current phase recommended to accelerate', () => {
    const facts = makeFacts();
    const phases = deriveMetrics(facts, makeContext()).phases!;
    assert.equal(phases.R4GOLIVE.baselineDate, '2026-08-21');
    const card = scoreEpic(facts, makeContext({ asOf: '2026-08-31' }));
    assert.ok(hasBadge(card, 'PHASE_LATE', 'DEV'));
    assert.ok(!hasBadge(card, 'PHASE_LATE', 'DESIGN'));
    assert.ok(hasBadge(card, 'PHASE_DONE', 'DESIGN'));
    assert.ok(hasBadge(card, 'PHASE_CURRENT', 'DEV'));
    assert.ok(hasBadge(card, 'REC_ACCELERATE_PHASE', 'DEV'));
    assert.ok(badgeCodesOf(card).includes('PHASE_LATE:DEV'));
  });

  it('no completion data at asOf → unavailable note, no late/done guess', () => {
    const card = scoreEpic(makeFacts({ phaseCompletion: null }), makeContext({ asOf: '2026-08-31' }));
    assert.ok(hasBadge(card, 'PHASE_COMPLETION_UNAVAILABLE'));
    assert.ok(!hasBadge(card, 'PHASE_LATE'));
  });
});

describe('determinism & parameters', () => {
  it('same input → same scorecard; invalid overrides fall back to defaults', () => {
    const ctx = makeContext({ asOf: '2026-08-31' });
    assert.deepEqual(scoreEpic(makeFacts(), ctx), scoreEpic(makeFacts(), ctx));
    const params = resolveScoringParameters({ 'release.graceWorkingDays': -3, 'anomaly.pendingStaleRatio': 0.5, unknown: 1 });
    assert.equal(params['release.graceWorkingDays'], 5);
    assert.equal(params['anomaly.pendingStaleRatio'], 0.5);
  });

  it('index flags serialize for the cache', () => {
    const card = scoreEpic(makeFacts({ r4gDate: '2026-08-20', status: 'R4GOLIVE' }), makeContext());
    assert.deepEqual(indexFlagsOf(card), ['TTM_COUNTED', 'TTM_ELIGIBLE', 'TTM_PASS']);
  });
});

describe('dates parity with legacy working-days.ts', () => {
  it('addWorkingDays / diffWorkingDays agree with the legacy helpers over a year of dates', async () => {
    const legacy = await import('@/lib/working-days');
    const holidays = { holidays: new Set(['2026-09-02', '2026-04-30', '2026-05-01']), workdays: new Set(['2026-05-09']) };
    for (let day = 0; day < 365; day += 3) {
      const start = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      for (const offset of [0, 1, 4, 14, 29]) {
        const expected = legacy.toDateKey(legacy.addWorkingDays(new Date(`${start}T00:00:00`), offset, holidays));
        assert.equal(addWorkingDays(start, offset, holidays), expected, `${start} + ${offset}`);
        assert.equal(diffWorkingDays(start, expected, holidays), legacy.diffWorkingDays(new Date(`${start}T00:00:00`), new Date(`${expected}T00:00:00`), holidays));
      }
    }
  });
});
