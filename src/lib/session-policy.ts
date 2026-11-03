/**
 * Session renewal rule (owner 2026-11-03) — pure, shared by the auth service, /api/auth/me and its tests.
 *
 * A session has a fixed lifetime from login (24 h "Ghi nhớ đăng nhập", else 2 h — SESSION_HOURS in auth-service.ts).
 * Opening one of the screens below while LESS than 30 minutes are left extends it to 2 hours from now; with 30 minutes
 * or more left nothing changes. A session never lives past its ceiling counted from login: 2 days when remembered,
 * 12 hours otherwise — after that the user signs in again even while active.
 * Only these screens renew, to keep database writes rare (one write at most every ~1.5 h of activity).
 */

export const SESSION_EXTEND_WHEN_MINUTES_LEFT = 30;
export const SESSION_EXTEND_TO_HOURS = 2;
export const SESSION_MAX_HOURS = { remembered: 48, standard: 12 } as const;

/** Screen path → roles allowed to renew from it (null = every signed-in role). */
const RENEWING_SCREENS: Readonly<Record<string, readonly string[] | null>> = {
  '/ttm-dashboard-2': null, // TTM Dashboard 2
  '/reports': null, // Báo cáo Epic (Epic Report)
  '/visit-stats': null, // Thống kê truy cập (Visit counter)
  '/epic-alerts-15': null, // Quản trị Epic
  '/': ['SUPERADMIN'], // Nguồn dữ liệu
  '/admin/users': ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'], // Quản lý user
};

/** True when opening `path` (no query string) may renew the session of a user with `role`. */
export function screenRenewsSession(path: string | null | undefined, role: string): boolean {
  if (!path || !Object.prototype.hasOwnProperty.call(RENEWING_SCREENS, path)) return false;
  const roles = RENEWING_SCREENS[path];
  return roles === null || roles.includes(role);
}

export interface SessionTiming {
  createdAt: Date;
  expiresAt: Date;
  remember: boolean;
}

/**
 * The new expiry when the session is due for renewal, else null: still valid, less than 30 minutes left, and the new
 * expiry (now + 2 h, but never past the ceiling from login) is later than the current one.
 */
export function renewedSessionExpiry(session: SessionTiming, now: Date): Date | null {
  const left = session.expiresAt.getTime() - now.getTime();
  if (left <= 0 || left >= SESSION_EXTEND_WHEN_MINUTES_LEFT * 60_000) return null;
  const ceiling = session.createdAt.getTime() + SESSION_MAX_HOURS[session.remember ? 'remembered' : 'standard'] * 3_600_000;
  const target = Math.min(now.getTime() + SESSION_EXTEND_TO_HOURS * 3_600_000, ceiling);
  return target > session.expiresAt.getTime() ? new Date(target) : null;
}
