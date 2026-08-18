export const USER_ROLES = ['SUPERADMIN', 'ADMIN', 'USER'] as const;
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
}

export interface UserInput {
  domainIds: number[];
  email: string;
  fullName: string;
  isActive: boolean;
  password?: string;
  projectIds: number[];
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
   * see resolveAccessScope in epic-alert-service.ts). null for SUPERADMIN (already sees
   * everything, a list would be noise) and USER (no domain-wide scope to show).
   */
  viewableProjects: ProjectSummary[] | null;
}
