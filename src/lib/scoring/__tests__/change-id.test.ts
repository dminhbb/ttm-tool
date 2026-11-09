import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasBadge } from '../select';
import { scoreEpic } from '../score-epic';
import { hasChangeIdValue, missingChangeIdOf } from '../rules/change-id';
import { makeContext, makeFacts } from './fixtures';

describe('Thiếu Change ID (owner 2026-11-09)', () => {
  it('R4G Date from 01/07/2026: only Change_ID_AMT counts', () => {
    assert.equal(missingChangeIdOf({ r4gDate: '2026-07-01', changeId: 'CHG-1', changeIdAmt: null }), 'AMT');
    assert.equal(missingChangeIdOf({ r4gDate: '2026-08-15', changeId: null, changeIdAmt: 'AMT-9' }), null);
  });

  it('R4G Date before 01/07/2026: Change_ID or Change_ID_AMT', () => {
    assert.equal(missingChangeIdOf({ r4gDate: '2026-06-30', changeId: 'CHG-1', changeIdAmt: null }), null);
    assert.equal(missingChangeIdOf({ r4gDate: '2026-06-30', changeId: null, changeIdAmt: 'AMT-9' }), null);
    assert.equal(missingChangeIdOf({ r4gDate: '2026-06-30', changeId: ' None ', changeIdAmt: 'null' }), 'ANY');
  });

  it('no R4G Date → not checked; blank / None / NULL are no value', () => {
    assert.equal(missingChangeIdOf({ r4gDate: null, changeId: null, changeIdAmt: null }), null);
    for (const value of ['', '  ', 'None', 'NULL', null, undefined]) assert.equal(hasChangeIdValue(value), false, String(value));
    assert.equal(hasChangeIdValue('CHG-12'), true);
  });

  it('the scorecard carries the alert; a Cancelled Epic does not', () => {
    const ctx = makeContext({ asOf: '2026-09-30' });
    const card = scoreEpic(makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-09-10', changeId: 'CHG-1', changeIdAmt: null }), ctx);
    assert.ok(hasBadge(card, 'REC_MISSING_CHANGE_ID'));
    const ok = scoreEpic(makeFacts({ status: 'R4GOLIVE', r4gDate: '2026-09-10', changeIdAmt: 'AMT-1' }), ctx);
    assert.ok(!hasBadge(ok, 'REC_MISSING_CHANGE_ID'));
    const cancelled = scoreEpic(makeFacts({ status: 'Cancelled', r4gDate: '2026-09-10' }), ctx);
    assert.ok(!hasBadge(cancelled, 'REC_MISSING_CHANGE_ID'));
  });
});
