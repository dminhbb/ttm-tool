import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { complexityLevelToHuman, complexityToHuman, computeEpicComplexity, isMisclassifiedEpicComplexity, VALID_EPIC_COMPLEXITIES_LIST } from '../epic-complexity';
import { EPIC_COMPLEXITY_TYPES } from '../status-alert-rule-types';

describe('computeEpicComplexity — 7 loại yêu cầu × Lv12/Lv34 (2026-11-23)', () => {
  it('map từng loại yêu cầu về tổ hợp đúng theo level', () => {
    // CT (Cải tiến) — cả Lv12 và Lv34 đều hợp lệ.
    assert.equal(computeEpicComplexity('Cải tiến', '2'), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Cải tiến', '3'), 'CT-Lv34');
    // TNM (Tính năng mới) — hợp lệ ở cả Lv12 và Lv34.
    assert.equal(computeEpicComplexity('Tính năng mới', '4'), 'TNM-Lv34');
    assert.equal(computeEpicComplexity('Tính năng mới', '1'), 'TNM-Lv12');
    // Các loại còn lại (không phải CT/TNM): chỉ tồn tại ở Lv34; Lv12 = "Phân loại sai Epic".
    assert.equal(computeEpicComplexity('Sản phẩm', '4'), 'SP-Lv34');
    assert.equal(computeEpicComplexity('Sản phẩm', '1'), 'SP-Lv12');
    assert.equal(computeEpicComplexity('Hệ thống mới', '4'), 'HTM-Lv34');
    assert.equal(computeEpicComplexity('Hệ thống mới', '2'), 'HTM-Lv12');
    assert.equal(computeEpicComplexity('Quy trình', '3'), 'QT-Lv34');
    assert.equal(computeEpicComplexity('Quy trình', '1'), 'QT-Lv12');
    assert.equal(computeEpicComplexity('Dịch vụ', '4'), 'DV-Lv34');
    assert.equal(computeEpicComplexity('Dịch vụ', '2'), 'DV-Lv12');
    assert.equal(computeEpicComplexity('Giải pháp nền tảng', '4'), 'GPNT-Lv34');
    assert.equal(computeEpicComplexity('Giải pháp nền tảng', '1'), 'GPNT-Lv12');
  });

  it('từ đồng nghĩa / giá trị legacy → Sản phẩm (SP), khớp text parser (2026-11-23)', () => {
    assert.equal(computeEpicComplexity('Sản phẩm/dịch vụ/quy trình mới', '1'), 'SP-Lv12');
    assert.equal(computeEpicComplexity('Sản phẩm/dịch vụ/quy trình mới', '4'), 'SP-Lv34');
    assert.equal(computeEpicComplexity('Sản phẩm mới', '2'), 'SP-Lv12');
    assert.equal(computeEpicComplexity('Phát triển mới', '1'), 'SP-Lv12');
    assert.equal(computeEpicComplexity('Phát triển mới', '3'), 'SP-Lv34');
  });

  it('không phân biệt chữ hoa/thường, thừa khoảng trắng; rỗng/"none"/giá trị lạ → CT (yêu cầu có dấu tiếng Việt như dữ liệu Jira)', () => {
    assert.equal(computeEpicComplexity('  CẢI TIẾN ', '2'), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Hệ Thống Mới', '4'), 'HTM-Lv34');
    assert.equal(computeEpicComplexity('GIẢI PHÁP NỀN TẢNG', '3'), 'GPNT-Lv34');
    assert.equal(computeEpicComplexity('', '3'), 'CT-Lv34');
    assert.equal(computeEpicComplexity('none', '2'), 'CT-Lv12');
    assert.equal(computeEpicComplexity('loại lạ', '4'), 'CT-Lv34');
  });

  it('level ngoài 1-4 (kể cả missing) → Lv12', () => {
    assert.equal(computeEpicComplexity('Cải tiến', '9'), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Cải tiến', ''), 'CT-Lv12');
    assert.equal(computeEpicComplexity('Sản phẩm', '0'), 'SP-Lv12');
  });
});

describe('isMisclassifiedEpicComplexity — nhóm "Phân loại sai Epic"', () => {
  it('đúng cho 5 tổ hợp Lv12 của loại không phải CT/TNM', () => {
    for (const code of ['HTM-Lv12', 'SP-Lv12', 'QT-Lv12', 'DV-Lv12', 'GPNT-Lv12']) {
      assert.equal(isMisclassifiedEpicComplexity(code), true, code);
    }
  });

  it('sai cho mọi tổ hợp hợp lệ (9, gồm TNM-Lv12) và giá trị null/undefined/lạ', () => {
    for (const code of ['CT-Lv12', 'CT-Lv34', 'TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34']) {
      assert.equal(isMisclassifiedEpicComplexity(code), false, code);
    }
    assert.equal(isMisclassifiedEpicComplexity(null), false);
    assert.equal(isMisclassifiedEpicComplexity(undefined), false);
    assert.equal(isMisclassifiedEpicComplexity(''), false);
  });

  it('mọi giá trị EPIC_COMPLEXITY_TYPES đều được xử lý', () => {
    for (const code of EPIC_COMPLEXITY_TYPES) {
      assert.equal(typeof isMisclassifiedEpicComplexity(code), 'boolean', code);
    }
    assert.equal(EPIC_COMPLEXITY_TYPES.length, 14);
  });
});

describe('Giải thích Phân loại Epic cho người dùng (2026-11-23)', () => {
  it('level: Lv12 → "Level 1 hoặc Level 2", Lv34 → "Level 3 hoặc Level 4"', () => {
    assert.equal(complexityLevelToHuman('Lv12'), 'Level 1 hoặc Level 2');
    assert.equal(complexityLevelToHuman('Lv34'), 'Level 3 hoặc Level 4');
    assert.equal(complexityLevelToHuman(''), 'Level 1 hoặc Level 2'); // mặc định
  });

  it('mở rộng mã code → tên tiếng Việt + level', () => {
    assert.equal(complexityToHuman('TNM-Lv12'), 'TNM (Tính năng mới) — Level 1 hoặc Level 2');
    assert.equal(complexityToHuman('SP-Lv34'), 'SP (Sản phẩm) — Level 3 hoặc Level 4');
    assert.equal(complexityToHuman('HTM-Lv12'), 'HTM (Hệ thống mới) — Level 1 hoặc Level 2');
    assert.equal(complexityToHuman('QT-Lv34'), 'QT (Quy trình) — Level 3 hoặc Level 4');
    assert.equal(complexityToHuman('DV-Lv12'), 'DV (Dịch vụ) — Level 1 hoặc Level 2');
    assert.equal(complexityToHuman('GPNT-Lv34'), 'GPNT (Giải pháp nền tảng) — Level 3 hoặc Level 4');
    assert.equal(complexityToHuman('CT-Lv12'), 'CT (Cải tiến) — Level 1 hoặc Level 2');
  });

  it('VALID_EPIC_COMPLEXITIES_LIST là đủ 9 tổ hợp hợp lệ (gồm TNM-Lv12), không có tổ hợp sai', () => {
    assert.deepEqual(VALID_EPIC_COMPLEXITIES_LIST, [
      'CT-Lv12', 'CT-Lv34', 'TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34',
    ]);
    for (const code of VALID_EPIC_COMPLEXITIES_LIST) {
      assert.equal(isMisclassifiedEpicComplexity(code), false, code);
    }
  });
});
