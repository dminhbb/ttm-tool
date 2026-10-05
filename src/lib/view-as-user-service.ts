import 'server-only';
import pool from '@/lib/db';
import type { AuthUser, UserRole } from '@/lib/auth-types';
import { resolveAccessScope } from '@/lib/epic-alert-service';

/**
 * "Xem dưới quyền" (User Preview) — shared by TTM dashboard, TTM Dashboard 2 and the Quản trị Epic
 * list they open, so a drill-down list is always scoped exactly like the dashboard number it came
 * from. Only SUPERADMIN/SUPERVISOR/ADMIN may preview, and only users of an equal or lower rank; the
 * previewed user is then scoped as a plain USER (their own projects/components). Anything else
 * (unknown/inactive id, higher rank, outside the actor's data scope, non-admin actor) silently falls
 * back to the actor's own view.
 *
 * Data scope (2026-10-05): previewing must never show an actor more than their own scope. SUPERADMIN
 * and SUPERVISOR see every project, so they may preview anyone of an equal or lower rank. An ADMIN
 * sees the projects of their Domains + the projects they are PM/SM of (resolveAccessScope), so they
 * may preview a user only when EVERY project of that user's preview scope lies inside that set —
 * otherwise the preview would leak another Domain's Epics. A user with no project at all has nothing
 * under any ADMIN and isn't offered to them either.
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

/** Upper-cased project keys the actor may see; null = every project. */
async function actorProjectKeys(actor: AuthUser): Promise<Set<string> | null> {
  const scope = await resolveAccessScope(actor.id, actor.role);
  return scope.sourceProjectKeys === null ? null : new Set(scope.sourceProjectKeys.map((key) => key.toUpperCase()));
}

/** The project keys each user would be previewed with: their own PM/SM projects (the USER scope of
 * resolveAccessScope — active projects only). Users without any are absent from the map. */
async function previewProjectKeysByUser(userIds: readonly number[]): Promise<Map<number, string[]>> {
  const byUser = new Map<number, string[]>();
  if (userIds.length === 0) return byUser;
  const result = await pool.query<{ projectKey: string; userId: number }>(`
    SELECT up.user_id AS "userId", p.source_project_key AS "projectKey"
    FROM user_projects up
    JOIN projects p ON p.id = up.project_id
    WHERE up.user_id = ANY($1::int[]) AND p.is_active;
  `, [userIds]);
  for (const row of result.rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.projectKey.toUpperCase()]);
  return byUser;
}

function isWithinActorScope(actorKeys: Set<string> | null, targetKeys: readonly string[] | undefined): boolean {
  if (actorKeys === null) return true;
  return Boolean(targetKeys && targetKeys.length > 0 && targetKeys.every((key) => actorKeys.has(key)));
}

/** The users an actor may preview, in input order — the "Xem dưới quyền" picker's list. Same rule as
 * resolveViewAsTarget (rank + data scope), so the picker never offers a user the API would refuse. */
export async function listPreviewableUsers<T extends { id: number; isActive: boolean; role: string }>(actor: AuthUser, users: readonly T[]): Promise<T[]> {
  if (!VIEW_AS_ALLOWED_ROLES.includes(actor.role)) return [];
  const actorRank = VIEW_AS_ROLE_RANK[actor.role] ?? 1;
  const candidates = users.filter((user) => user.isActive && (VIEW_AS_ROLE_RANK[user.role] ?? 1) <= actorRank);
  const actorKeys = await actorProjectKeys(actor);
  if (actorKeys === null) return candidates;
  const targetKeys = await previewProjectKeysByUser(candidates.map((user) => user.id));
  return candidates.filter((user) => isWithinActorScope(actorKeys, targetKeys.get(user.id)));
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
  const actorKeys = await actorProjectKeys(actor);
  if (actorKeys !== null && !isWithinActorScope(actorKeys, (await previewProjectKeysByUser([target.id])).get(target.id))) return own;
  return { role: 'USER', userId: target.id, viewAsUser: target };
}
