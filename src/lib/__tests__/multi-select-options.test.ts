import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { arrangeChoices } from '../multi-select-options';
import { ALERT_FILTER_SELECT_OPTIONS, matchesAlertFilter } from '../epic-row-verdicts';

const choices = ['Zeta', 'đạt', 'Beta', 'Alpha 10', 'Alpha 2'].map((label) => ({ label, value: label.toUpperCase() }));
const labels = (list: { label: string }[]) => list.map((item) => item.label);

describe('dropdown dùng chung — tìm kiếm, A-Z, pinned items', () => {
  it('không sort: giữ nguyên thứ tự; sort: A-Z kiểu tiếng Việt, số theo giá trị', () => {
    assert.deepEqual(labels(arrangeChoices(choices).others), ['Zeta', 'đạt', 'Beta', 'Alpha 10', 'Alpha 2']);
    assert.deepEqual(labels(arrangeChoices(choices, { sort: true }).others), ['Alpha 2', 'Alpha 10', 'Beta', 'đạt', 'Zeta']);
  });

  it('pinned tách thành nhóm riêng, cũng A-Z, không lặp lại ở nhóm dưới', () => {
    const arranged = arrangeChoices(choices, { sort: true, pinnedValues: ['ZETA', 'BETA', 'KHÔNG CÓ'] });
    assert.deepEqual(labels(arranged.pinned), ['Beta', 'Zeta']);
    assert.deepEqual(labels(arranged.others), ['Alpha 2', 'Alpha 10', 'đạt']);
  });

  it('tìm không phân biệt hoa/thường và dấu, áp cho cả hai nhóm', () => {
    const arranged = arrangeChoices(choices, { query: 'dat', pinnedValues: ['ZETA'] });
    assert.deepEqual([labels(arranged.pinned), labels(arranged.others)], [[], ['đạt']]);
  });
});

describe('"Nhận xét" — giá trị Start sớm', () => {
  it('có trong danh sách và lọc đúng Epic mang khuyến nghị REC_EARLY_START', () => {
    assert.ok(ALERT_FILTER_SELECT_OPTIONS.some((option) => option.value === 'EARLY_START' && option.label === 'Start sớm'));
    const row = (badges: string[]) => ({ scoringBadges: badges }) as unknown as Parameters<typeof matchesAlertFilter>[0];
    assert.equal(matchesAlertFilter(row(['REC_EARLY_START']), 'EARLY_START'), true);
    assert.equal(matchesAlertFilter(row(['CNTT_FAIL']), 'EARLY_START'), false);
  });
});
