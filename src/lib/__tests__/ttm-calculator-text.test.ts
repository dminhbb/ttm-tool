import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCalculatorText, toCalculatorRequestType } from '../ttm-calculator-text';

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

  it('nhận dạng các từ đồng nghĩa gán vào cụm tiêu chuẩn "Sản phẩm/dịch vụ/quy trình mới"', () => {
    const standard = 'Sản phẩm/dịch vụ/quy trình mới';
    for (const input of [
      'sản phẩm mới', 'dịch vụ', 'dịch vụ mới', 'quy trình', 'quy trình mới',
      'sản phẩm/dịch vụ', 'sản phẩm / dịch vụ / quy trình mới',
    ]) {
      assert.equal(parse(`${input}, Level 2, 3/4/2026`).requestType, standard, input);
    }
  });

  it('không phân biệt chữ hoa/thường, không dấu, có/không dấu cách', () => {
    assert.equal(parse('sanpham, Lv1, 3/4/2026').requestType, 'Sản phẩm');
    assert.equal(parse('SAN PHAM, Lv1, 3/4/2026').requestType, 'Sản phẩm');
    assert.equal(parse('sanphammoi, Lv1, 3/4/2026').requestType, 'Sản phẩm/dịch vụ/quy trình mới');
    assert.equal(parse('TINHNANGMOI Lv1 3/4/2026').requestType, 'Tính năng mới');
    assert.equal(parse('CAITIEN Lv1 3/4/2026').requestType, 'Cải tiến');
  });

  it('nhận dạng các viết tắt của Loại yêu cầu', () => {
    const standard = 'Sản phẩm/dịch vụ/quy trình mới';
    const abbr: [string, string][] = [
      ['tnm', 'Tính năng mới'], ['tn', 'Tính năng mới'], ['sp', 'Sản phẩm'], ['ct', 'Cải tiến'],
      ['dv', standard], ['qt', standard], ['spm', standard], ['dvm', standard],
      ['qtm', standard], ['spdvqt', standard], ['spdvqtm', standard],
    ];
    for (const [abbrInput, expected] of abbr) {
      assert.equal(parse(`${abbrInput} Lv3 3/4/2026`).requestType, expected, abbrInput);
    }
  });

  it('viết tắt không khớp lẫn vào từ viết đầy đủ', () => {
    // "tn" không được khớp trong "tinh nang"; "sp" không được khớp trong "san pham".
    assert.equal(parse('tinh nang moi Lv1 3/4/2026').requestType, 'Tính năng mới');
    assert.equal(parse('san pham Lv1 3/4/2026').requestType, 'Sản phẩm');
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

describe('toCalculatorRequestType — map "Loại yêu cầu" raw về chuẩn TTM Calculator', () => {
  const standard = 'Sản phẩm/dịch vụ/quy trình mới';

  it('map chuẩn, không dấu và viết hoa/thường lẫn lộn về chuẩn', () => {
    assert.equal(toCalculatorRequestType('Cải tiến'), 'Cải tiến');
    assert.equal(toCalculatorRequestType('cai tien'), 'Cải tiến');
    assert.equal(toCalculatorRequestType('CAITIEN'), 'Cải tiến');
    assert.equal(toCalculatorRequestType('Tính năng mới'), 'Tính năng mới');
    assert.equal(toCalculatorRequestType('TINH NANG MOI'), 'Tính năng mới');
    assert.equal(toCalculatorRequestType('Sản phẩm'), 'Sản phẩm');
  });

  it('map các từ đồng nghĩa và viết tắt về cụm chuẩn', () => {
    assert.equal(toCalculatorRequestType(standard), standard);
    assert.equal(toCalculatorRequestType('dịch vụ mới'), standard);
    assert.equal(toCalculatorRequestType('quy trình'), standard);
    assert.equal(toCalculatorRequestType('spdvqtm'), standard);
    assert.equal(toCalculatorRequestType('tnm'), 'Tính năng mới');
    assert.equal(toCalculatorRequestType('tn'), 'Tính năng mới');
    assert.equal(toCalculatorRequestType('sp'), 'Sản phẩm');
    assert.equal(toCalculatorRequestType('ct'), 'Cải tiến');
  });

  it('trả null khi không nhận dạng được (thiếu / giá trị lạ)', () => {
    for (const input of [null, undefined, '', 'None', 'none', 'null', 'một giá trị lạ']) {
      assert.equal(toCalculatorRequestType(input), null, String(input));
    }
  });
});
