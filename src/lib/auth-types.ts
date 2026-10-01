import type { UsageStatsTotals } from '@/lib/usage-stats-types';

export const USER_ROLES = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Role hierarchy gate for granting/changing a user's role: SUPERADMIN may grant any role; every
 * other actor may only grant a role strictly below their own (lower index in USER_ROLES = higher
 * privilege). Prevents an ADMIN/SUPERVISOR from elevating a user to or above their own level.
 */
export function canGrantRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'SUPERADMIN') return true;
  return USER_ROLES.indexOf(targetRole) > USER_ROLES.indexOf(actorRole);
}

/**
 * Whether `actorRole` may modify, reset the password of, or delete an EXISTING user whose current
 * role is `targetRole` — same hierarchy as canGrantRole. Without this, an ADMIN could reset a
 * SUPERADMIN's password (and sign in as them), demote or delete them, even though they could never
 * grant that role.
 */
export function canManageUserWithRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return canGrantRole(actorRole, targetRole);
}

export interface AuthUser {
  email: string;
  fullName: string;
  id: number;
  mustChangePassword?: boolean;
  role: UserRole;
}

export interface ManagedUser extends AuthUser {
  domainIds: number[];
  isActive: boolean;
  projectIds: number[];
  /** Component-level narrowing per project (user_project_components) — keyed by project.id (as a
   * string, since it round-trips through JSON). A projectId in projectIds but absent/empty here
   * has full, unrestricted access to that project — same as before this feature existed. */
  projectComponents: Record<string, string[]>;
  usageStats: UsageStatsTotals;
}

export interface UserInput {
  domainIds: number[];
  email: string;
  fullName: string;
  isActive: boolean;
  password?: string;
  projectIds: number[];
  /** See ManagedUser.projectComponents. */
  projectComponents: Record<string, string[]>;
  role: UserRole;
}

export interface DomainSummary {
  domainCode: string;
  domainName: string;
  id: number;
}

export interface ProjectSummary {
  id: number;
  projectKey: string;
  projectName: string;
}

export interface UserProfileDetails {
  domains: DomainSummary[];
  /** Projects this user is PM/SM for (user_projects) — applies to any role. */
  ledProjects: ProjectSummary[];
  /**
   * ADMIN only: every project in a domain they're assigned to (their epic-alerts view scope —
   * see resolveAccessScope in epic-alert-service.ts). null for SUPERADMIN/SUPERVISOR (already see
   * everything, a list would be noise) and USER (no domain-wide scope to show).
   */
  viewableProjects: ProjectSummary[] | null;
  /** All-time totals, accumulated per day (see user_usage_daily_stats). */
  usageStats: UsageStatsTotals;
}
