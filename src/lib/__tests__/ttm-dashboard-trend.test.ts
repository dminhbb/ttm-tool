import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTrendSentences, trendHead, type TtmTrendValues } from '../ttm-dashboard-trend';

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
