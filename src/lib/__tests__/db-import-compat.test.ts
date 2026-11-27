import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseColumnList, planActorUser, splitFileColumns } from '../db-import-compat';

describe('db-import-compat — khác biệt schema giữa file và DB đích', () => {
  it('đọc danh sách cột như file ghi, tách cột DB đích không có', () => {
    const columns = parseColumnList('"id", "name", "expanded"');
    assert.deepEqual(columns, ['id', 'name', 'expanded']);
    assert.deepEqual(splitFileColumns(columns, new Set(['id', 'name', 'created_at'])), { known: ['id', 'name'], unknown: ['expanded'] });
  });
});

describe('db-import-compat — tài khoản đang import', () => {
  const actor = { id: 5, email: 'Admin@local.test' };

  it('file có chính người đó (e-mail, không phân biệt hoa/thường) → theo id của file', () => {
    assert.deepEqual(planActorUser(actor, [{ id: 1, email: 'admin@LOCAL.test' }, { id: 5, email: 'other@x.test' }], 9), { mode: 'FILE', targetId: 1 });
  });

  it('cùng tên đăng nhập khác tên miền cũng là một người (unique index theo phần trước @)', () => {
    assert.deepEqual(planActorUser(actor, [{ id: 3, email: 'admin@company.test' }], 9), { mode: 'FILE', targetId: 3 });
  });

  it('không có trong file và id không đụng ai → giữ nguyên', () => {
    assert.deepEqual(planActorUser(actor, [{ id: 1, email: 'a@x.test' }], 9), { mode: 'KEPT', targetId: 5 });
  });

  it('id của họ thuộc về người khác trong file → chuyển sang id mới lớn hơn cả hai phía', () => {
    assert.deepEqual(planActorUser(actor, [{ id: 5, email: 'a@x.test' }, { id: 40, email: 'b@x.test' }], 9), { mode: 'MOVED', targetId: 41 });
    assert.deepEqual(planActorUser(actor, [{ id: 5, email: 'a@x.test' }], 100), { mode: 'MOVED', targetId: 101 });
  });
});
