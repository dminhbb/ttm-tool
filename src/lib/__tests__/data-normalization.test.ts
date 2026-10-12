import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiFeatureKey, pageFeatureKey } from '../feature-access';
import { brokenRuleIndexes, compareEpicKeys, NORMALIZATION_PAGE_SIZE, NORMALIZATION_RULES, paginate, parseNormalizationPages } from '../data-normalization';

describe('"Chuẩn hoá dữ liệu" panels', () => {
  it('one panel per Sai lệch dữ liệu rule, in R-number order, each with its guide', () => {
    assert.deepEqual(NORMALIZATION_RULES.map((rule) => rule.code), ['R1', 'R3', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10']);
    assert.equal(NORMALIZATION_RULES[0].label, 'Thiếu Start Date');
    for (const rule of NORMALIZATION_RULES) {
      assert.ok(rule.meaning.length > 0 && rule.guide.length > 0, `${rule.code} lacks meaning/guide`);
    }
  });

  it('R8–R10 exist only in the Scoring Service', () => {
    assert.deepEqual(NORMALIZATION_RULES.filter((rule) => !rule.inLegacyEngine).map((rule) => rule.code), ['R8', 'R9', 'R10']);
  });

  it('an Epic breaking several rules lands in each of their panels', () => {
    const indexes = brokenRuleIndexes([{ code: 'MISSING_START_DATE' }, { code: 'MISSING_REQUEST_TYPE' }, { code: 'MISSING_START_DATE' }]);
    assert.deepEqual([...indexes].sort((a, b) => a - b), [1, 4]);
    assert.equal(brokenRuleIndexes([]).size, 0);
    assert.equal(brokenRuleIndexes(null).size, 0);
  });

  it('R2 / R7 are not Sai lệch dữ liệu panels', () => {
    const codes = NORMALIZATION_RULES.map((rule) => rule.index);
    assert.ok(!codes.includes(2) && !codes.includes(7));
  });
});

describe('"Chuẩn hoá dữ liệu" paging', () => {
  const items = Array.from({ length: 60 }, (_, index) => index);

  it('25 per page, last page holds the rest, page is clamped', () => {
    assert.equal(NORMALIZATION_PAGE_SIZE, 25);
    assert.deepEqual(paginate(items, 1).rows.length, 25);
    assert.deepEqual(paginate(items, 3).rows, items.slice(50));
    assert.deepEqual([paginate(items, 99).page, paginate(items, 0).page, paginate([], 5).page], [3, 1, 1]);
    assert.equal(paginate(items, 1).totalPages, 3);
    assert.equal(paginate([], 1).totalPages, 1);
  });

  it('parses the pages parameter and drops junk', () => {
    assert.deepEqual(parseNormalizationPages('R1:2, R5:3,X:1,R3:0,R4:abc,R6'), { R1: 2, R5: 3 });
    assert.deepEqual(parseNormalizationPages(null), {});
  });

  it('Epic keys sort numerically within a project', () => {
    assert.deepEqual(['API-10', 'WM-1', 'API-2'].sort(compareEpicKeys), ['API-2', 'API-10', 'WM-1']);
  });
});

describe('"Chuẩn hoá dữ liệu" access', () => {
  it('page and data API are gated by the data_normalization feature', () => {
    assert.equal(pageFeatureKey('/data-normalization'), 'data_normalization');
    assert.equal(apiFeatureKey('/api/data-normalization'), 'data_normalization');
  });
});
