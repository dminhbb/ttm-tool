// Import của "Quản lý dữ liệu" (db-backup-service.ts importSqlFile) — xử lý va chạm UNIQUE phụ, phần thuần (không đụng DB).
//
// Import nạp mỗi bảng bằng upsert theo khoá chính (`ON CONFLICT (id)`). Nhưng bảng đích có thể đã có dòng với `id`
// KHÁC mà trùng một unique index PHỤ (partial hoặc theo biểu thức, vd `uq_project_members_active_role`,
// `lower(name)`, `slug WHERE slug IS NOT NULL`) — dòng do trigger / migration backfill / dữ liệu cũ sinh ra. Upsert theo
// id không bắt được va chạm đó và cả transaction rollback.
//
// Thay vì liệt kê tay từng bảng (quên một bảng mới = lỗi lại), import ĐỌC mọi unique index không phải khoá chính của bảng
// từ pg_index lúc chạy (loadSecondaryUniqueIndexes trong db-backup-service.ts) và dùng các hàm dưới đây để:
//   1) loại khỏi bảng tạm các dòng của file trùng nhau theo index đó (giữ dòng đứng sau);
//   2) xoá khỏi bảng đích dòng KHÁC khoá chính nhưng trùng index với một dòng của file (dòng của file thắng).
// Bảng/unique index mới thêm sau này được phủ tự động, không cần sửa code import.

/** Một unique index phụ (không phải khoá chính) của một bảng. */
export interface SecondaryUniqueIndex {
  /** Mỗi phần tử = một cột hoặc biểu thức khoá, đúng như `pg_get_indexdef(index, k, true)` (vd `lower(btrim(name::text))`). */
  keys: string[];
  /** Điều kiện của partial index (`pg_get_expr(indpred)`), null nếu không phải partial. */
  predicate: string | null;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** `SELECT <expr AS alias…> FROM <relation> [WHERE predicate]` — biểu thức khoá viết không qualifier nên chỉ đúng khi relation là bảng duy nhất trong FROM. */
function keyProjection(relation: string, index: SecondaryUniqueIndex, extra: string[]): string {
  const columns = [...extra, ...index.keys.map((expression, position) => `${expression} AS _k${position}`)];
  return `SELECT ${columns.join(', ')} FROM ${relation}${index.predicate ? ` WHERE ${index.predicate}` : ''}`;
}

function keysEqual(index: SecondaryUniqueIndex): string {
  return index.keys.map((_, position) => `l._k${position} = i._k${position}`).join(' AND ');
}

/**
 * Xoá khỏi bảng tạm các dòng trùng `index` với một dòng khác của chính file (giữ dòng đứng sau theo thứ tự trong file).
 * Dòng có khoá NULL không trùng ai (đúng ngữ nghĩa UNIQUE).
 */
export function stageDuplicateSql(stageTable: string, index: SecondaryUniqueIndex): string {
  const stage = quoteIdent(stageTable);
  return `DELETE FROM ${stage} AS t WHERE t.ctid IN (
    SELECT l._row FROM (${keyProjection(stage, index, ['ctid AS _row'])}) l
    JOIN (${keyProjection(stage, index, ['ctid AS _row'])}) i ON ${keysEqual(index)} AND l._row < i._row
  );`;
}

/**
 * Xoá khỏi bảng đích mọi dòng có khoá chính KHÁC mà trùng `index` với một dòng của bảng tạm. `pkColumns` là khoá chính
 * (không rỗng); `extraWhere` nối thêm vào câu lệnh (vd bảo vệ tài khoản đang import: ` AND t.id <> 5`).
 */
export function targetCollisionSql(tableName: string, stageTable: string, pkColumns: readonly string[], index: SecondaryUniqueIndex, extraWhere = ''): string {
  const target = quoteIdent(tableName);
  const stage = quoteIdent(stageTable);
  const pkSelect = pkColumns.map((column, position) => `${quoteIdent(column)} AS _p${position}`);
  const samePk = pkColumns.map((_, position) => `l._p${position} = i._p${position}`).join(' AND ');
  return `DELETE FROM ${target} AS t WHERE t.ctid IN (
    SELECT l._row FROM (${keyProjection(target, index, ['ctid AS _row', ...pkSelect])}) l
    JOIN (${keyProjection(stage, index, pkSelect)}) i ON ${keysEqual(index)} AND NOT (${samePk})
  )${extraWhere};`;
}
