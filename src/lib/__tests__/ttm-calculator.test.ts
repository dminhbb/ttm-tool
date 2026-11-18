import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEpicComplexity } from '../epic-complexity';
import { calculateTtm } from '../ttm-calculator';
import { makeContext } from '../scoring/__tests__/fixtures';

const base = { requestType: 'Cải tiến', requirementLevel: '2', startDate: '2026-11-11' };
// Mẫu của yêu cầu: ngày nghỉ 24/11/2026, CT-Lv12 = 15 ngày làm việc.
const ctx = makeContext({ holidays: { holidays: new Set(['2026-11-24']), workdays: new Set() } });

describe('TTM Calculator — phân loại Epic (dùng chung với import)', () => {
  it('CT/SP × Lv12/Lv34, level lạ → CT-Lv12', () => {
    assert.equal(computeEpicComplexity('Cải tiến', '2'), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Tính năng mới', '3'), 'CT-Lv34');
    assert.equal(computeEpicComplexity('Sản phẩm', '1'), 'SP-Lv12');
    assert.equal(computeEpicComplexity('Sản phẩm/dịch vụ/quy trình mới', '4'), 'SP-Lv34');
    assert.equal(computeEpicComplexity('Cải tiến', '9'), 'CT-Lv12');
  });
});

describe('TTM Calculator — các mốc', () => {
  const result = calculateTtm(base, ctx);
  const row = (key: string) => result.rows.find((item) => item.key === key)!;

  it('Loại Epic, tổng thời gian, R4G mục tiêu và hạn golive', () => {
    assert.equal(result.complexity, 'CT-Lv12');
    assert.equal(result.totalCnttWorkingDays, 15);
    assert.equal(result.r4gDate, '2026-12-02');
    assert.equal(result.goliveDate, '2026-12-09');
    assert.equal(result.ruleGroup.isDefault, true);
  });

  it('bảng pha: DESIGN làm tròn lên, DEV/TEST làm tròn xuống, PENTEST kéo dài đến trước R4G, Golive 5 ngày làm việc', () => {
    const shape = result.rows.map((item) => [item.key, item.workingDays, item.fromDate, item.toDate]);
    assert.deepEqual(shape, [
      ['DESIGN', 3, '2026-11-11', '2026-11-13'],
      ['DEV', 4, '2026-11-16', '2026-11-19'],
      ['TEST', 4, '2026-11-20', '2026-11-26'],
      ['PENTEST', 3, '2026-11-27', '2026-12-01'],
      ['R4GOLIVE', 1, '2026-12-02', '2026-12-02'],
      ['GOLIVE', 5, '2026-12-03', '2026-12-09'],
    ]);
    assert.equal(result.rows.reduce((sum, item) => sum + (item.key === 'GOLIVE' ? 0 : item.workingDays), 0), 15);
    assert.equal(row('DESIGN').percent, 20);
  });

  it('không có ngày duyệt ý tưởng / Created date → không tính TTM-E2E', () => {
    assert.equal(result.e2e, null);
  });

  it('có ngày duyệt ý tưởng → Target E2E = T0 + (N − 1) ngày làm việc; không có thì lấy Created date', () => {
    const withIdea = calculateTtm({ ...base, ideaApprovedDate: '2026-11-02' }, ctx);
    assert.equal(withIdea.e2e?.budgetWorkingDays, 20);
    assert.equal(withIdea.e2e?.sourceDate, '2026-11-02');
    assert.equal(withIdea.e2e?.targetDate, '2026-11-30');
    const withCreated = calculateTtm({ ...base, createdDate: '2026-10-26' }, ctx);
    assert.equal(withCreated.e2e?.sourceDate, '2026-10-26');
    assert.match(withCreated.e2e?.sourceLabel ?? '', /Jira/);
  });

  it('loại Epic khác dùng đúng bộ ngân sách của nó (SP-Lv12 = 30 ngày)', () => {
    const sp = calculateTtm({ ...base, requestType: 'Sản phẩm' }, ctx);
    assert.equal(sp.complexity, 'SP-Lv12');
    assert.equal(sp.totalCnttWorkingDays, 30);
  });

  it('thiếu bộ ngân sách cho loại Epic → không có mốc, không lỗi', () => {
    const lv34 = calculateTtm({ ...base, requirementLevel: '3' }, ctx);
    assert.equal(lv34.totalCnttWorkingDays, null);
    assert.deepEqual(lv34.rows, []);
    assert.equal(lv34.r4gDate, null);
  });

  it('Start date rơi vào Thứ 7 / Chủ nhật / ngày nghỉ: vẫn là ngày thứ nhất, và được đánh dấu', () => {
    assert.equal(result.startIsNonWorkingDay, false);
    const saturday = calculateTtm({ ...base, startDate: '2026-11-14' }, ctx);
    assert.equal(saturday.startIsNonWorkingDay, true);
    assert.equal(calculateTtm({ ...base, startDate: '2026-11-24' }, ctx).startIsNonWorkingDay, true);
    // Thứ 7 là ngày 1 nhưng không có ngày làm việc thật → R4G trùng với khi bắt đầu từ Thứ 6 liền trước.
    assert.equal(saturday.r4gDate, calculateTtm({ ...base, startDate: '2026-11-13' }, ctx).r4gDate);
  });
});
