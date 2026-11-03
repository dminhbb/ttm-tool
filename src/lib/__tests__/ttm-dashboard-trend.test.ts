import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReferenceSentence, buildTrendSentences, pickSeriesDates, referenceDates, trendHead, type TtmTrendValues } from '../ttm-dashboard-trend';

const base: TtmTrendValues = { anomaly: 10, e2ePct: 70, failCntt: 12, missingReason: 4, ttmCnttPct: 85.2, waitingGolive: 7 };

describe('TTM Dashboard 2 — "So với" ticker (owner 2026-11-03)', () => {
  it('counts: up / down by the difference, unchanged shows the current value', () => {
    const sentences = buildTrendSentences({ ...base, failCntt: 15, missingReason: 2 }, base);
    assert.equal(sentences[0], 'Số lượng Epic Fail TTM-CNTT tăng 3 epic.');
    assert.equal(sentences[1], 'Số lượng Epic fail TTM thiếu lý do giảm 2 epic.');
    assert.equal(sentences[4], 'Số lượng Epic sai lệch dữ liệu vẫn là 10 epic.');
    assert.equal(sentences[5], 'Số lượng Epic chờ golive vẫn là 7 epic.');
  });

  it('indexes: percentage points, 2 decimals, Vietnamese comma', () => {
    const sentences = buildTrendSentences({ ...base, ttmCnttPct: 83.55, e2ePct: 72.5 }, base);
    assert.equal(sentences[2], 'Chỉ số TTM-CNTT giảm 1,65%.');
    assert.equal(sentences[3], 'Chỉ số TTM-E2E tăng 2,5%.');
    assert.equal(buildTrendSentences(base, base)[2], 'Chỉ số TTM-CNTT vẫn là 85,2%.');
  });

  it('an index without a verdict on either day is left out', () => {
    const sentences = buildTrendSentences({ ...base, e2ePct: null }, base);
    assert.equal(sentences.length, 5);
    assert.ok(!sentences.some((sentence) => sentence.includes('TTM-E2E')));
  });

  it('head shows the compared date as dd/mm/yyyy', () => {
    assert.equal(trendHead('2026-11-02'), 'So với 02/11/2026: ');
  });
});

describe('chart points and comparison days (2026-11-03)', () => {
  const layers = Array.from({ length: 40 }, (_, index) => `L${String(39 - index).padStart(2, '0')}`); // newest first: L39 … L00

  it('7 points: the newest layer and every 5th one back from it, oldest first', () => {
    assert.deepEqual(pickSeriesDates(layers), ['L09', 'L14', 'L19', 'L24', 'L29', 'L34', 'L39']);
  });

  it('fewer layers give fewer points — never padded', () => {
    assert.deepEqual(pickSeriesDates(layers.slice(0, 12)), ['L29', 'L34', 'L39']);
    assert.deepEqual(pickSeriesDates([]), []);
  });

  it('last data day of the previous week and month; an empty week / month gives way to an earlier one', () => {
    // Tuesday 03/11/2026: the previous week ends Sunday 01/11, the previous month ends 31/10.
    const dates = ['2026-10-23', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-03'];
    assert.deepEqual(referenceDates('2026-11-03', dates), { month: '2026-10-30', week: '2026-10-30' });
    // No data at all in the previous week (26/10–01/11) → the week before it.
    assert.deepEqual(referenceDates('2026-11-03', ['2026-10-23', '2026-10-25', '2026-11-03']), { month: '2026-10-25', week: '2026-10-25' });
    // A day of the current week is never a reference; nothing old enough → null.
    assert.deepEqual(referenceDates('2026-11-03', ['2026-11-02', '2026-11-03']), { month: null, week: null });
  });

  it('the month reference skips a month without data', () => {
    assert.deepEqual(referenceDates('2026-12-02', ['2026-09-30', '2026-12-02']), { month: '2026-09-30', week: '2026-09-30' });
    assert.deepEqual(referenceDates('2026-12-02', ['2026-10-31', '2026-11-27', '2026-12-02']), { month: '2026-11-27', week: '2026-11-27' });
  });

  it('week / month message: count change always, percent change only when both days have a verdict', () => {
    const values = (failCntt: number, ttmCnttPct: number | null) => ({ anomaly: 0, e2ePct: null, failCntt, missingReason: 0, ttmCnttPct, waitingGolive: 0 });
    assert.equal(
      buildReferenceSentence('tuần trước', { date: '2026-10-29', values: values(10, 80) }, values(13, 78.8)),
      'So với tuần trước (29/10/2026): Số lượng Epic Fail TTM-CNTT tăng 3 epic; Chỉ số TTM-CNTT giảm 1,2%.',
    );
    assert.equal(
      buildReferenceSentence('tháng trước', { date: '2026-10-30', values: values(5, null) }, values(5, 70)),
      'So với tháng trước (30/10/2026): Số lượng Epic Fail TTM-CNTT vẫn là 5 epic.',
    );
  });
});
