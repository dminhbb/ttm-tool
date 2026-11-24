import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stageDuplicateSql, targetCollisionSql, type SecondaryUniqueIndex } from '../db-import-unique';

const partial: SecondaryUniqueIndex = { keys: ['project_id', 'user_id', 'role_in_project'], predicate: 'is_active' };
const expression: SecondaryUniqueIndex = { keys: ["lower(btrim((name)::text))"], predicate: null };

describe('db-import-unique — va chạm UNIQUE phụ khi import', () => {
  it('targetCollisionSql: so khớp mọi cột khoá, chỉ tính dòng KHÁC khoá chính, áp predicate cho cả hai phía', () => {
    const sql = targetCollisionSql('project_members', 'tmp_import_stage', ['id'], partial);
    assert.match(sql, /DELETE FROM "project_members" AS t WHERE t\.ctid IN/);
    assert.match(sql, /l\._k0 = i\._k0 AND l\._k1 = i\._k1 AND l\._k2 = i\._k2/);
    assert.match(sql, /AND NOT \(l\._p0 = i\._p0\)/);
    assert.equal(sql.split('WHERE is_active').length - 1, 2); // bảng đích và bảng tạm
  });

  it('biểu thức khoá được giữ nguyên (lower/btrim), index không partial thì không có WHERE', () => {
    const sql = targetCollisionSql('scoring_rule_groups', 'tmp_import_stage', ['id'], expression);
    assert.ok(sql.includes('lower(btrim((name)::text)) AS _k0'));
    assert.ok(!/ WHERE is_|WHERE \(/.test(sql.replace('WHERE t.ctid', '')));
  });

  it('khoá chính nhiều cột: mọi cột đều phải khớp mới tính là "cùng dòng"', () => {
    const sql = targetCollisionSql('t', 'tmp_import_stage', ['a', 'b'], partial);
    assert.match(sql, /NOT \(l\._p0 = i\._p0 AND l\._p1 = i\._p1\)/);
  });

  it('extraWhere (bảo vệ tài khoản đang import) được nối vào cuối câu xoá', () => {
    assert.match(targetCollisionSql('users', 'tmp_import_stage', ['id'], partial, ' AND t.id <> 5'), /\) AND t\.id <> 5;$/);
  });

  it('stageDuplicateSql: giữ dòng đứng sau (ctid lớn hơn), dòng khoá NULL không trùng ai', () => {
    const sql = stageDuplicateSql('tmp_import_stage', partial);
    assert.match(sql, /DELETE FROM "tmp_import_stage" AS t WHERE t\.ctid IN/);
    assert.match(sql, /l\._row < i\._row/);
  });

  it('tên bảng được quote (không chèn được SQL qua tên)', () => {
    assert.match(targetCollisionSql('a"b', 'tmp_import_stage', ['id'], partial), /DELETE FROM "a""b" AS t/);
  });
});
