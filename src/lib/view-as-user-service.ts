import 'server-only';
import pool from '@/lib/db';
import type { AuthUser, UserRole } from '@/lib/auth-types';

/**
 * "Xem dưới quyền" (User Preview) — shared by TTM dashboard, TTM Dashboard 2 and the Quản trị Epic
 * list they open, so a drill-down list is always scoped exactly like the dashboard number it came
 * from. Only SUPERADMIN/SUPERVISOR/ADMIN may preview, and only users of an equal or lower rank; the
 * previewed user is then scoped as a plain USER (their own projects/components). Anything else
 * (unknown/inactive id, higher rank, non-admin actor) silently falls back to the actor's own view.
 */
export const VIEW_AS_ROLE_RANK: Record<string, number> = {
  SUPERADMIN: 4,
  SUPERVISOR: 3,
  ADMIN: 2,
  USER: 1,
};

export const VIEW_AS_ALLOWED_ROLES: readonly UserRole[] = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'];

export interface ViewAsTarget {
  role: UserRole;
  userId: number;
  viewAsUser: { email: string; fullName: string; id: number; role: string } | null;
}

export async function resolveViewAsTarget(actor: AuthUser, rawViewAsUserId: string | null): Promise<ViewAsTarget> {
  const own: ViewAsTarget = { role: actor.role, userId: actor.id, viewAsUser: null };
  const viewAsUserId = rawViewAsUserId ? Number.parseInt(rawViewAsUserId, 10) : Number.NaN;
  if (!VIEW_AS_ALLOWED_ROLES.includes(actor.role) || !Number.isInteger(viewAsUserId) || viewAsUserId === actor.id) return own;

  const result = await pool.query<{ email: string; fullName: string; id: number; role: string }>(
    'SELECT id, full_name AS "fullName", email, role FROM users WHERE id = $1 AND is_active = TRUE',
    [viewAsUserId],
  );
  const target = result.rows[0];
  if (!target || (VIEW_AS_ROLE_RANK[target.role] ?? 1) > (VIEW_AS_ROLE_RANK[actor.role] ?? 1)) return own;
  return { role: 'USER', userId: target.id, viewAsUser: target };
}
