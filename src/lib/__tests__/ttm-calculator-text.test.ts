import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCalculatorText } from '../ttm-calculator-text';

const parse = (text: string) => parseCalculatorText(text, 2026);

describe('TTM Calculator — nhập bằng text', () => {
  it('nhận dạng đủ 3 thông tin, không phụ thuộc thứ tự', () => {
    assert.deepEqual(parse('Cải tiến, Level 2, 11/11/2026'), { level: '2', problems: [], requestType: 'Cải tiến', startDate: '2026-11-11' });
    assert.deepEqual(parse('11/11/2026 level 2 cải tiến'), { level: '2', problems: [], requestType: 'Cải tiến', startDate: '2026-11-11' });
  });

  it('chấp nhận cả 6 dạng ngày', () => {
    const cases: [string, string][] = [
      ['31/7', '2026-07-31'], ['31/07', '2026-07-31'], ['31/7/2026', '2026-07-31'],
      ['31/7/26', '2026-07-31'], ['31/07/2026', '2026-07-31'], ['31/07/26', '2026-07-31'],
    ];
    for (const [input, iso] of cases) assert.equal(parse(`Tính năng mới Level 1 ${input}`).startDate, iso, input);
  });

  it('"Sản phẩm/dịch vụ/quy trình mới" thắng "Sản phẩm"; "Sản phẩm" đứng riêng vẫn nhận', () => {
    assert.equal(parse('Sản phẩm/dịch vụ/quy trình mới, Level 3, 5/8/2026').requestType, 'Sản phẩm/dịch vụ/quy trình mới');
    assert.equal(parse('Sản phẩm, Lv4, 5.8.2026').requestType, 'Sản phẩm');
  });

  it('nhận không dấu, viết hoa/thường lẫn lộn và các viết tắt level', () => {
    const result = parse('TINH NANG MOI lv3 01-09-2026');
    assert.deepEqual(result, { level: '3', problems: [], requestType: 'Tính năng mới', startDate: '2026-09-01' });
    assert.equal(parse('cai tien L4 1/9').level, '4');
  });

  it('chữ số của ngày không bị nhận nhầm là level', () => {
    const result = parse('Cải tiến 2/3/2026');
    assert.equal(result.level, null);
    assert.equal(result.startDate, '2026-03-02');
  });

  it('báo lý do cho từng thông tin thiếu hoặc sai', () => {
    assert.equal(parse('Cải tiến 11/11/2026').problems.length, 1);
    assert.match(parse('Cải tiến Level 5 11/11/2026').problems[0], /Level "5"/);
    assert.match(parse('Cải tiến Level 2 31/02/2026').problems[0], /không tồn tại/);
    assert.equal(parse('xin chào').problems.length, 3);
  });
});
