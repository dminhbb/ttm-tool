import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cnttGeometry, e2eGeometry, elapsedWorkingDays, RELEASE_BASELINE_SOURCE_LABEL, resolveTtmActualRange } from '../epic-row-geometry';
import { scoreEpic } from '../scoring/score-epic';
import { makeContext, makeFacts } from '../scoring/__tests__/fixtures';

describe('epic-row-geometry — numbers drawn next to the verdicts', () => {
  it('the actual stripe ends at R4G Date once reached, else at asOf (also for a nonsense R4G Date before Start Date)', () => {
    assert.deepEqual(resolveTtmActualRange({ r4gDate: '2026-08-20', startDate: '2026-08-03' }, '2026-09-01'), { fromDate: '2026-08-03', toDate: '2026-08-20' });
    assert.deepEqual(resolveTtmActualRange({ r4gDate: '2026-10-01', startDate: '2026-08-03' }, '2026-09-01'), { fromDate: '2026-08-03', toDate: '2026-09-01' });
    assert.deepEqual(resolveTtmActualRange({ r4gDate: '2026-07-01', startDate: '2026-08-03' }, '2026-09-01'), { fromDate: '2026-08-03', toDate: '2026-09-01' });
    assert.deepEqual(resolveTtmActualRange({ r4gDate: null, startDate: null }, '2026-09-01'), { fromDate: null, toDate: '2026-09-01' });
  });

  it('elapsed working days are never negative and null when an end is unknown', () => {
    const ctx = makeContext();
    assert.equal(elapsedWorkingDays('2026-08-03', '2026-08-07', ctx), 4);
    assert.equal(elapsedWorkingDays('2026-08-07', '2026-08-03', ctx), 0);
    assert.equal(elapsedWorkingDays(null, '2026-08-03', ctx), null);
  });

  it('TTM-CNTT geometry follows the scorecard (From = Start Date, budget from the policy) up to asOf', () => {
    const ctx = makeContext({ asOf: '2026-08-10' });
    const card = scoreEpic(makeFacts(), ctx);
    const geometry = cnttGeometry('CT-Lv12', card.derived, ctx);
    assert.deepEqual(
      [geometry.fromDate, geometry.fromField, geometry.toField, geometry.targetWorkingDays, geometry.elapsedWorkingDays],
      ['2026-08-03', 'START_DATE', 'R4G_DATE', 15, 5],
    );
  });

  it('TTM-E2E baseline = T0 + the full budget; T0 falls back to the Jira creation date', () => {
    const ctx = makeContext({ asOf: '2026-09-01' });
    const fromT0 = e2eGeometry(scoreEpic(makeFacts(), ctx).derived, ctx);
    assert.deepEqual([fromT0.baselineSourceDate, fromT0.baselineSourceLabel, fromT0.targetWorkingDays], ['2026-07-27', RELEASE_BASELINE_SOURCE_LABEL.ideaApproved, 20]);
    assert.equal(fromT0.baselineDate, '2026-08-24');

    const fromJira = e2eGeometry(scoreEpic(makeFacts({ ideaApprovedDate: null }), ctx).derived, ctx);
    assert.deepEqual([fromJira.baselineSourceDate, fromJira.baselineSourceLabel], ['2026-07-20', RELEASE_BASELINE_SOURCE_LABEL.jiraCreated]);

    const noBudget = e2eGeometry(scoreEpic(makeFacts({ complexity: 'SP-Lv12' }), ctx).derived, ctx);
    assert.equal(noBudget.baselineDate, null);
  });
});
