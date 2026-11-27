// Import của "Quản lý dữ liệu" (db-backup-service.ts importSqlFile) — tương thích giữa hai môi trường, phần thuần (không
// đụng DB) để test được: file có cột mà DB đích không có, và tài khoản đang thực hiện import so với bảng users của file.

/** `"id", "email"` (danh sách cột đúng như file ghi) → ['id', 'email']. */
export function parseColumnList(columns: string): string[] {
  return columns.split(',').map((column) => column.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

/** Tách cột của file thành cột DB đích có (import) và cột không có (bỏ qua, báo lại cho người import). */
export function splitFileColumns(fileColumns: readonly string[], targetColumns: ReadonlySet<string>): { known: string[]; unknown: string[] } {
  return {
    known: fileColumns.filter((column) => targetColumns.has(column)),
    unknown: fileColumns.filter((column) => !targetColumns.has(column)),
  };
}

export interface UserIdentity {
  email: string;
  id: number;
}

/**
 * Tài khoản đang import sẽ mang id nào sau khi nạp bảng users của file:
 *  - FILE   — file có chính người đó (cùng e-mail hoặc cùng tên đăng nhập, không phân biệt hoa/thường): dòng của file
 *             được dùng (mirror), phiên đăng nhập chuyển sang id của file;
 *  - MOVED  — file không có người đó nhưng id của họ thuộc về một người KHÁC trong file: tài khoản được giữ lại dưới id
 *             mới (lớn hơn mọi id đang có ở hai phía), thay vì bị dòng của người khác ghi đè;
 *  - KEPT   — không đụng nhau: giữ nguyên dòng và id (không bị mirror xoá).
 */
export type ActorPlan = { mode: 'FILE' | 'KEPT' | 'MOVED'; targetId: number };

function usernameOf(email: string): string {
  return email.toLowerCase().split('@')[0];
}

export function planActorUser(actor: UserIdentity, fileUsers: readonly UserIdentity[], maxLocalId: number): ActorPlan {
  const email = actor.email.toLowerCase();
  const samePerson = fileUsers.find((user) => user.email.toLowerCase() === email)
    ?? fileUsers.find((user) => usernameOf(user.email) === usernameOf(actor.email));
  if (samePerson) return { mode: 'FILE', targetId: samePerson.id };
  if (!fileUsers.some((user) => user.id === actor.id)) return { mode: 'KEPT', targetId: actor.id };
  return { mode: 'MOVED', targetId: Math.max(maxLocalId, ...fileUsers.map((user) => user.id)) + 1 };
}
