// Import của "Quản lý dữ liệu" (db-backup-service.ts importSqlFile) — phần thuần, không đụng DB, để test được.
//
// Import KHÔNG tắt trigger (ALTER TABLE … DISABLE TRIGGER ALL cần superuser vì nó tắt cả trigger hệ thống
// RI_ConstraintTrigger_* của khoá ngoại — lỗi "permission denied: … is a system trigger" trên DB mà user ứng dụng
// không phải superuser). Thay vào đó (2026-11-12):
//   - mọi khoá ngoại là DEFERRABLE (migration 20261127_make_foreign_keys_deferrable) và import chạy
//     SET CONSTRAINTS ALL DEFERRED → kiểm tra khoá ngoại dời về cuối transaction;
//   - bảng được nạp cha trước con (orderTablesForImport) → ON DELETE CASCADE / SET NULL khi "mirror" xoá dòng ở
//     bảng cha chạy xong trước khi bảng con được nạp lại từ file;
//   - trước khi kiểm tra, dòng con trỏ tới dòng cha không còn được xử lý đúng như ON DELETE của khoá ngoại đó
//     (orphanSweepSql) — thay cho việc trước đây để lại dòng mồ côi.

/** Một khoá ngoại, đọc từ pg_constraint. `onDelete` là pg_constraint.confdeltype. */
export interface ForeignKeyInfo {
  childColumns: string[];
  childTable: string;
  deferrable: boolean;
  name: string;
  /** a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT */
  onDelete: 'a' | 'c' | 'd' | 'n' | 'r';
  parentColumns: string[];
  parentTable: string;
}

/**
 * Bảng được trigger của bảng khác ghi vào (db/install/ttm-monitor-schema.sql phần 5) — phải nạp SAU bảng đó, để
 * dữ liệu trigger sinh ra khi nạp bảng kia bị file ghi đè, cuối cùng bảng khớp đúng file. Không phải khoá ngoại nên
 * không suy ra được từ pg_constraint. Thêm trigger ghi sang bảng khác thì thêm vào đây.
 */
export const TRIGGER_WRITE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  project_external_bindings: ['projects'], // trg_projects_sync_pms_tables
  project_members: ['user_projects'], // trg_user_projects_sync_project_members
  ttm_project_configs: ['projects'], // trg_projects_sync_pms_tables
};

/**
 * Thứ tự nạp: bảng cha trước bảng con (theo khoá ngoại và TRIGGER_WRITE_DEPENDENCIES), giữ nguyên thứ tự trong
 * `tables` khi không có ràng buộc. Vòng tham chiếu (news_letter_articles ↔ news_letter_images) được cắt ở bảng
 * đứng trước trong `tables` — khoá ngoại deferrable nên vòng không làm hỏng việc nạp.
 */
export function orderTablesForImport(tables: readonly string[], foreignKeys: readonly Pick<ForeignKeyInfo, 'childTable' | 'parentTable'>[]): string[] {
  const position = new Map(tables.map((table, index) => [table, index]));
  const parentsOf = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  const addEdge = (child: string, parent: string) => {
    if (child !== parent && position.has(child) && position.has(parent)) parentsOf.get(child)!.add(parent);
  };
  for (const fk of foreignKeys) addEdge(fk.childTable, fk.parentTable);
  for (const [child, parents] of Object.entries(TRIGGER_WRITE_DEPENDENCIES)) for (const parent of parents) addEdge(child, parent);

  const ordered: string[] = [];
  const remaining = new Set(tables);
  // Bảng nằm trên một vòng tham chiếu: đi ngược lên các bảng cha còn lại mà quay về được chính nó.
  const isInCycle = (start: string): boolean => {
    const seen = new Set<string>();
    const stack = [...parentsOf.get(start)!].filter((parent) => remaining.has(parent));
    while (stack.length > 0) {
      const table = stack.pop()!;
      if (table === start) return true;
      if (seen.has(table)) continue;
      seen.add(table);
      for (const parent of parentsOf.get(table)!) if (remaining.has(parent)) stack.push(parent);
    }
    return false;
  };
  while (remaining.size > 0) {
    const pending = [...remaining].sort((a, b) => position.get(a)! - position.get(b)!);
    const ready = pending.find((table) => [...parentsOf.get(table)!].every((parent) => !remaining.has(parent)));
    // Chỉ còn bảng bị vòng tham chiếu chặn: cắt vòng ở bảng thuộc vòng đứng trước nhất (không lấy bảng con của vòng).
    const next = ready ?? pending.find(isInCycle) ?? pending[0];
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Câu lệnh xử lý dòng của bảng con trỏ tới dòng cha không tồn tại, theo đúng ON DELETE của khoá ngoại: CASCADE →
 * xoá dòng con, SET NULL → đặt NULL các cột khoá ngoại. NO ACTION / RESTRICT / SET DEFAULT → null: để nguyên, bước
 * kiểm tra khoá ngoại (SET CONSTRAINTS ALL IMMEDIATE) sẽ báo lỗi và import rollback. MATCH SIMPLE: dòng có một cột
 * khoá ngoại NULL không bị kiểm tra nên cũng không bị đụng tới.
 */
export function orphanSweepSql(fk: ForeignKeyInfo): string | null {
  if (fk.onDelete !== 'c' && fk.onDelete !== 'n') return null;
  const notNull = fk.childColumns.map((column) => `t.${quoteIdent(column)} IS NOT NULL`).join(' AND ');
  const match = fk.childColumns.map((column, index) => `p.${quoteIdent(fk.parentColumns[index])} = t.${quoteIdent(column)}`).join(' AND ');
  const orphan = `${notNull} AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(fk.parentTable)} AS p WHERE ${match})`;
  if (fk.onDelete === 'c') return `DELETE FROM ${quoteIdent(fk.childTable)} AS t WHERE ${orphan};`;
  const setNull = fk.childColumns.map((column) => `${quoteIdent(column)} = NULL`).join(', ');
  return `UPDATE ${quoteIdent(fk.childTable)} AS t SET ${setNull} WHERE ${orphan};`;
}
