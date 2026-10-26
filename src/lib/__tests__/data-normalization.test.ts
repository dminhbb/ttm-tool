import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiFeatureKey, pageFeatureKey } from '../feature-access';
import {
  compareEpicKeys,
  FAIL_REASON_PANEL_CODE,
  NORMALIZATION_BADGE_CODES,
  NORMALIZATION_PAGE_SIZE,
  NORMALIZATION_PANELS,
  normalizationPanelsOf,
  paginate,
  parseNormalizationPages,
  parseNormalizationPanelCodes,
} from '../data-normalization';

const violation = (code: string, ruleIndex: number, message = code) => ({ code, message, ruleIndex }) as Parameters<typeof normalizationPanelsOf>[0]['dataAnomalyViolations'][number];
const panelsOf = (row: Partial<Parameters<typeof normalizationPanelsOf>[0]>) =>
  Object.fromEntries(normalizationPanelsOf({ dataAnomalyViolations: [], scoringBadges: undefined, ttmCnttInScope: true, ...row }));

describe('"Chuẩn hoá dữ liệu" panels', () => {
  it('"Thiếu lý do Fail TTM" comes first, then the rules in R-number order — R7 included, R2 not (2026-10-13)', () => {
    assert.deepEqual(NORMALIZATION_PANELS.map((panel) => panel.code), [FAIL_REASON_PANEL_CODE, 'R1', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11']);
    assert.deepEqual(NORMALIZATION_PANELS.slice(0, 2).map((panel) => [panel.tag, panel.label]), [['Fail TTM', 'Thiếu lý do Fail TTM'], ['R1', 'Thiếu Start Date']]);
    assert.equal(NORMALIZATION_PANELS.find((panel) => panel.code === 'R7')?.label, 'Sai Status (Release)');
    for (const panel of NORMALIZATION_PANELS) {
      assert.ok(panel.meaning.length > 0 && panel.guide.length > 0 && panel.defaultMessage.length > 0, `${panel.code} lacks meaning/guide/message`);
    }
    assert.ok(!NORMALIZATION_PANELS.some((panel) => panel.index === 2));
  });

  it('an Epic breaking several rules lands in each of their panels, with that rule\'s messages only', () => {
    assert.deepEqual(panelsOf({
      dataAnomalyViolations: [violation('MISSING_START_DATE', 1, 'thiếu T1'), violation('MISSING_REQUEST_TYPE', 4, 'thiếu loại'), violation('DATE_OUT_OF_SEQUENCE', 3, 'a'), violation('DATE_OUT_OF_SEQUENCE', 3, 'b')],
    }), { R1: ['thiếu T1'], R3: ['a', 'b'], R4: ['thiếu loại'] });
    assert.deepEqual(panelsOf({}), {});
  });

  it('R2 has no panel: an Epic whose only violation is "Pending lâu" needs no normalizing; R7 has one', () => {
    // A row may carry R2 / R7 as violations.
    assert.deepEqual(panelsOf({ dataAnomalyViolations: [violation('PENDING_TOO_LONG', 2)] }), {});
    assert.deepEqual(panelsOf({ dataAnomalyViolations: [violation('PENDING_TOO_LONG', 2), violation('RELEASE_STATUS_MISMATCH', 7, 'chưa Released')] }), { R7: ['chưa Released'] });
  });

  it('R7 and "Thiếu lý do Fail TTM" are read off the badges (they are not violations)', () => {
    const r7 = panelsOf({ scoringBadges: ['RELEASE_STATUS_MISMATCH'] });
    assert.deepEqual(Object.keys(r7), ['R7']);
    assert.equal(r7.R7.length, 1);
    assert.deepEqual(Object.keys(panelsOf({ scoringBadges: ['CNTT_FAIL', 'REC_MISSING_FAIL_REASON'] })), [FAIL_REASON_PANEL_CODE]);
    // Outside "Phạm vi dữ liệu cho TTM" the dashboard doesn't count the missing reason — neither does this screen.
    assert.deepEqual(panelsOf({ scoringBadges: ['REC_MISSING_FAIL_REASON'], ttmCnttInScope: false }), {});
    // A row without badges is never in the "Thiếu lý do Fail TTM" panel.
    assert.deepEqual(panelsOf({ scoringBadges: undefined }), {});
    // "Thiếu lý do" = Khâu fail + Chịu TN chính, as on the dashboard widget: either one puts the Epic
    // in the panel, both give it two messages.
    const dept = panelsOf({ scoringBadges: ['CNTT_FAIL', 'REC_MISSING_RESPONSIBLE_DEPARTMENT'] });
    assert.deepEqual(Object.keys(dept), [FAIL_REASON_PANEL_CODE]);
    assert.equal(dept[FAIL_REASON_PANEL_CODE].length, 1);
    assert.equal(panelsOf({ scoringBadges: ['REC_MISSING_FAIL_REASON', 'REC_MISSING_RESPONSIBLE_DEPARTMENT'] })[FAIL_REASON_PANEL_CODE].length, 2);
    assert.deepEqual(panelsOf({ scoringBadges: ['REC_MISSING_RESPONSIBLE_DEPARTMENT'], ttmCnttInScope: false }), {});
    // The SQL pre-filter keeps exactly the badges read here.
    assert.deepEqual([...NORMALIZATION_BADGE_CODES].sort(), ['REC_MISSING_FAIL_REASON', 'REC_MISSING_RESPONSIBLE_DEPARTMENT', 'RELEASE_STATUS_MISMATCH']);
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
    assert.deepEqual(parseNormalizationPages('R1:2, R5:3,X:1,R3:0,R4:abc,R6,R2:4,FAIL_REASON:2'), { FAIL_REASON: 2, R1: 2, R5: 3 });
    assert.deepEqual(parseNormalizationPages(null), {});
  });

  it('parses the open panels parameter: known panel codes only, each once', () => {
    assert.deepEqual(parseNormalizationPanelCodes('R1, FAIL_REASON,R1,R2,nope'), ['R1', 'FAIL_REASON']);
    assert.deepEqual(parseNormalizationPanelCodes(null), []);
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
