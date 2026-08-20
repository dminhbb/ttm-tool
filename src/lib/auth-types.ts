import type { UsageStatsTotals } from '@/lib/usage-stats-types';

export const USER_ROLES = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthUser {
  email: string;
  fullName: string;
  id: number;
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
