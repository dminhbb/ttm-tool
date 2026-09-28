/** A project as listed under its Domain (projects.domain_id) on "Quản lý Domain". */
export interface DomainProjectRef {
  id: number;
  isActive: boolean;
  projectName: string;
  sourceProjectKey: string;
}

export interface Domain {
  createdAt: string;
  description: string;
  domainCode: string;
  domainName: string;
  id: number;
  isActive: boolean;
  leadName: string;
  /** Every project whose projects.domain_id points at this Domain, ordered by project key. */
  projects: DomainProjectRef[];
}

export interface DomainInput {
  description: string;
  domainCode: string;
  domainName: string;
  isActive: boolean;
  leadName: string;
  /** Full set of projects that should belong to this Domain after saving (projects.domain_id). A
   * project is in at most one Domain, so picking one that belongs to another Domain moves it here;
   * a project previously in this Domain and no longer listed has its domain_id cleared. Omit
   * (undefined) to leave project assignments untouched. */
  projectIds?: number[];
}

export interface DomainSaveResult {
  domain: Domain;
  /** True when at least one project's domain_id actually changed — callers then rebuild the
   * derived caches (epic_alert_row_cache stores each Epic's domainName). */
  projectsChanged: boolean;
}

export interface Project {
  createdAt: string;
  domainId: number | null;
  domainName: string | null;
  id: number;
  isActive: boolean;
  leadName: string;
  projectCategory: ProjectCategory | null;
  projectName: string;
  sourceProjectKey: string;
  sourceType: string;
  ttm: TtmOption;
}

export const PROJECT_CATEGORIES = ['Dự án', 'Team Agile', 'Team Triển khai'] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type TtmOption = 'Y' | 'N';

/** PM/SM assignment is read-only here — set exclusively via the Users screen (auth-service.ts's
 * replacePermissions, which writes user_projects). A project's Project.leadName is derived live
 * from user_projects (comma-joined when there are multiple PM/SM users), not stored on this input. */
export interface ProjectInput {
  domainId: number | null;
  isActive: boolean;
  projectCategory: ProjectCategory | null;
  projectName: string;
  sourceProjectKey: string;
  sourceType: string;
  ttm: TtmOption;
}

export type HolidayType = 'PUBLIC' | 'COMPANY' | 'OTHER';

export interface Holiday {
  createdAt: string;
  description: string;
  endDate: string;
  holidayType: HolidayType;
  id: number;
  isActive: boolean;
  isMultiDay: boolean;
  name: string;
  startDate: string;
}

export interface HolidayInput {
  description: string;
  endDate: string;
  holidayType: HolidayType;
  isActive: boolean;
  isMultiDay: boolean;
  name: string;
  startDate: string;
}

/** "Ngày làm bù" — a Saturday/Sunday explicitly declared a normal working day, to make up for an
 * extended holiday block before/after it (see working-days.ts's HolidaySet.workdays). Always a
 * single date (no range, unlike Holiday). */
export interface MakeupWorkday {
  createdAt: string;
  description: string;
  id: number;
  isActive: boolean;
  workDate: string;
}

export interface MakeupWorkdayInput {
  description: string;
  isActive: boolean;
  workDate: string;
}

export interface ProjectComponent {
  componentName: string;
  createdAt: string;
  id: number;
  isActive: boolean;
  projectKey: string;
  updatedAt: string;
}

export interface ProjectComponentInput {
  componentName: string;
  isActive: boolean;
  projectKey: string;
}

export const TEAM_ROLES = ['BA', 'DEV', 'TEST', 'PM'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface IssueTypeRoleMapping {
  createdAt: string;
  id: number;
  issueType: string;
  teamRole: TeamRole;
}

export interface IssueTypeRoleMappingInput {
  issueType: string;
  teamRole: TeamRole;
}
