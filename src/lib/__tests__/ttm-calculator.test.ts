import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEpicComplexity } from '../epic-complexity';
import { calculateTtm } from '../ttm-calculator';
import { DEFAULT_SCORING_PARAMETERS } from '../scoring/parameters';
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

  it('level rỗng/missing cho loại SP → mặc định an toàn CT-Lv12 (đổi luôn ngân sách)', () => {
    assert.equal(computeEpicComplexity('Sản phẩm', ''), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Sản phẩm', 'none'), 'CT-Lv12');
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
  });

  it('PENTEST % khớp số ngày làm việc thực tế (không phải tỉ lệ cấu hình): DESIGN 3/14=21%, DEV & TEST 4/14=29%, PENTEST lấy phần dư=21%, tổng 100', () => {
    assert.equal(row('DESIGN').percent, 21);
    assert.equal(row('DEV').percent, 29);
    assert.equal(row('TEST').percent, 29);
    assert.equal(row('PENTEST').percent, 21);
    const sum = result.rows.filter((item) => item.percent !== null).reduce((total, item) => total + (item.percent ?? 0), 0);
    assert.equal(sum, 100);
    // R4G và Golive không phải pha dùng ngân sách → percent null.
    assert.equal(row('R4GOLIVE').percent, null);
    assert.equal(row('GOLIVE').percent, null);
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

  it('ngày làm bù (makeup workday) trên cuối tuần được coi là ngày làm việc → startIsNonWorkingDay = false', () => {
    // Thứ 7 2026-11-14 khai báo là "ngày làm bù" (workdays) → addWorkingDays coi nó là ngày làm việc.
    const ctxWithMakeup = makeContext({ holidays: { holidays: new Set(['2026-11-24']), workdays: new Set(['2026-11-14']) } });
    const makeup = calculateTtm({ ...base, startDate: '2026-11-14' }, ctxWithMakeup);
    assert.equal(makeup.startIsNonWorkingDay, false);
  });

  it('release.graceWorkingDays = 0: không có dòng GOLIVE riêng, goliveDate = r4gDate (golive ngay tại R4G)', () => {
    const zeroGraceCtx = makeContext({ holidays: { holidays: new Set(['2026-11-24']), workdays: new Set() }, parameters: { ...DEFAULT_SCORING_PARAMETERS, 'release.graceWorkingDays': 0 } });
    const zeroGrace = calculateTtm(base, zeroGraceCtx);
    assert.equal(zeroGrace.rows.some((item) => item.key === 'GOLIVE'), false);
    assert.equal(zeroGrace.goliveDate, zeroGrace.r4gDate);
    assert.equal(zeroGrace.graceWorkingDays, 0);
  });
});
