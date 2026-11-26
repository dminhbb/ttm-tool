import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCalculatorRequest } from '../ttm-calculator-request';

/** A body that passes every rule — tweak one field to exercise a specific failure. */
const VALID_BODY = {
  requestType: 'Cải tiến',
  requirementLevel: '3',
  createdDate: '2026-11-01',
  ideaApprovedDate: '2026-11-10',
  startDate: '2026-11-25',
};

const errorOf = (body: unknown) => {
  const parsed = parseCalculatorRequest(body as Record<string, unknown> | null);
  assert.ok('error' in parsed, `expected an error, got: ${JSON.stringify(parsed)}`);
  return (parsed as { error: string }).error;
};

describe('parseCalculatorRequest — validate body 2 API dùng chung (ttm-calculator / epic-ttm-calendar)', () => {
  it('body hợp lệ → value giữ nguyên các trường, ngày tuỳ chọn được phép bỏ trống', () => {
    const parsed = parseCalculatorRequest(VALID_BODY);
    assert.deepEqual(parsed, {
      value: {
        createdDate: '2026-11-01',
        ideaApprovedDate: '2026-11-10',
        requestType: 'Cải tiến',
        requirementLevel: '3',
        startDate: '2026-11-25',
      },
    });
  });

  it('createdDate / ideaApprovedDate bỏ trống (undefined / null / chuỗi rỗng) → null trong value, không lỗi', () => {
    for (const missing of [undefined, null, '']) {
      const parsed = parseCalculatorRequest({ ...VALID_BODY, createdDate: missing, ideaApprovedDate: missing });
      assert.deepEqual(parsed, {
        value: { createdDate: null, ideaApprovedDate: null, requestType: 'Cải tiến', requirementLevel: '3', startDate: '2026-11-25' },
      });
    }
  });

  it('body null (request.json() thất bại) → lỗi "Loại yêu cầu không hợp lệ."', () => {
    assert.equal(errorOf(null), 'Loại yêu cầu không hợp lệ.');
  });

  it('requestType thiếu hoặc không thuộc 7 loại → lỗi "Loại yêu cầu không hợp lệ."', () => {
    const bad: unknown[] = [undefined, 42, '', 'Loại không tồn tại', 'cải tiến', 'Cải tiến '];
    for (const requestType of bad) assert.equal(errorOf({ ...VALID_BODY, requestType }), 'Loại yêu cầu không hợp lệ.');
  });

  it('requirementLevel thiếu hoặc không thuộc 1-4 → lỗi "Requirement level phải là 1, 2, 3 hoặc 4."', () => {
    const bad: unknown[] = [undefined, 3, '', '0', '5', '03'];
    for (const requirementLevel of bad) {
      assert.equal(errorOf({ ...VALID_BODY, requirementLevel }), 'Requirement level phải là 1, 2, 3 hoặc 4.');
    }
  });

  it('startDate thiếu, sai định dạng, hoặc không tồn tại trong lịch → lỗi "Start date không hợp lệ."', () => {
    const bad: unknown[] = [undefined, '', '2026/11/25', '25/11/2026', '2026-13-01', '2026-02-30', '2026-11-25T00:00:00Z', '2026-11-5'];
    for (const startDate of bad) assert.equal(errorOf({ ...VALID_BODY, startDate }), 'Start date không hợp lệ.');
  });

  it('createdDate / ideaApprovedDate có giá trị nhưng sai định dạng hoặc không tồn tại → lỗi chung (chuỗi rỗng vẫn được coi là bỏ trống, không lỗi)', () => {
    const bad: unknown[] = ['2026-13-01', '2026-02-30', '2026/11/01', '31/12/2026', '2026-1-1'];
    for (const badDate of bad) {
      assert.equal(errorOf({ ...VALID_BODY, createdDate: badDate }), 'Created date / Ngày duyệt ý tưởng không hợp lệ.');
      assert.equal(errorOf({ ...VALID_BODY, ideaApprovedDate: badDate }), 'Created date / Ngày duyệt ý tưởng không hợp lệ.');
    }
  });

  it('ngày nhuận 29/02 (2024) hợp lệ, 29/02 (2026 không nhuận) bị từ chối', () => {
    const leap = parseCalculatorRequest({ ...VALID_BODY, createdDate: '2024-02-29' });
    assert.ok('value' in leap);
    assert.equal(errorOf({ ...VALID_BODY, createdDate: '2026-02-29' }), 'Created date / Ngày duyệt ý tưởng không hợp lệ.');
  });

  it('đủ 7 loại yêu cầu và 4 level đều được chấp nhận (không loại trừ nhầm)', () => {
    for (const requestType of ['Tính năng mới', 'Cải tiến', 'Sản phẩm', 'Hệ thống mới', 'Quy trình', 'Dịch vụ', 'Giải pháp nền tảng']) {
      for (const requirementLevel of ['1', '2', '3', '4']) {
        const parsed = parseCalculatorRequest({ ...VALID_BODY, requestType, requirementLevel });
        assert.ok('value' in parsed, `${requestType}@${requirementLevel}`);
      }
    }
  });
});
