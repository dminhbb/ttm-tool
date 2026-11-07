// "View as" (owner 2026-11-07): a SUPERADMIN can look at the app as another active user — role, permissions and data scope
// of that user — for testing. The mode is READ-ONLY: the proxy refuses every API write while it is on. Pure module (no
// database import) so the proxy, the screens and the tests share it.

/** Answer of the proxy to a write attempted in View as mode. */
export const VIEW_AS_BLOCKED_MESSAGE = 'Đang ở chế độ View as — chỉ được xem, không thể thay đổi dữ liệu. Hãy thoát View as để thao tác.';

/**
 * Non-GET endpoints that stay open in View as mode, by exact path:
 *  - /api/auth/view-as   start / switch / leave the mode itself (the route re-checks the real SUPERADMIN and the password);
 *  - /api/reports, /api/rule-groups/preview   POST only to carry the filters of a read-only report / simulation (nothing is saved).
 * Everything else — including "Đổi mật khẩu", the usage counters and the "Bản tin" / popup read markers — is refused.
 */
const WRITE_ALLOWED_PATHS: readonly string[] = ['/api/auth/view-as', '/api/reports', '/api/rule-groups/preview'];

export function isWriteBlockedInViewAs(method: string, pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return false;
  return !WRITE_ALLOWED_PATHS.includes(pathname);
}

/** A user the SUPERADMIN can pick (active users other than themselves). */
export interface ViewAsCandidate {
  email: string;
  fullName: string;
  id: number;
  role: string;
}
