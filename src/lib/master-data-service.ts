import pool from '@/lib/db';
import { expandHolidayRanges } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { LATEST_ISSUES_CTE } from '@/lib/issue-resolution-sql';
import type {
  Domain,
  DomainInput,
  Holiday,
  HolidayInput,
  IssueTypeRoleMapping,
  IssueTypeRoleMappingInput,
  Project,
  ProjectComponent,
  ProjectComponentInput,
  ProjectInput,
} from '@/lib/master-data-types';

// ---------- Domains ----------

export async function listDomains(): Promise<Domain[]> {
  const result = await pool.query<Domain>(`
    SELECT
      id, domain_code AS "domainCode", domain_name AS "domainName",
      COALESCE(description, '') AS description, COALESCE(lead_name, '') AS "leadName",
      is_active AS "isActive", created_at::text AS "createdAt"
    FROM domains
    ORDER BY domain_code ASC;
  `);
  return result.rows;
}

export async function createDomain(input: DomainInput): Promise<Domain> {
  const result = await pool.query<Domain>(`
    INSERT INTO domains (domain_code, domain_name, description, lead_name, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, domain_code AS "domainCode", domain_name AS "domainName",
      COALESCE(description, '') AS description, COALESCE(lead_name, '') AS "leadName",
      is_active AS "isActive", created_at::text AS "createdAt";
  `, [input.domainCode, input.domainName, input.description || null, input.leadName || null, input.isActive]);
  return result.rows[0];
}

export async function updateDomain(id: number, input: DomainInput): Promise<Domain> {
  const result = await pool.query<Domain>(`
    UPDATE domains SET
      domain_code = $2, domain_name = $3, description = $4, lead_name = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, domain_code AS "domainCode", domain_name AS "domainName",
      COALESCE(description, '') AS description, COALESCE(lead_name, '') AS "leadName",
      is_active AS "isActive", created_at::text AS "createdAt";
  `, [id, input.domainCode, input.domainName, input.description || null, input.leadName || null, input.isActive]);
  return result.rows[0];
}

export async function deleteDomain(id: number): Promise<void> {
  await pool.query('DELETE FROM domains WHERE id = $1;', [id]);
}

// ---------- Projects ----------

export async function listProjects(): Promise<Project[]> {
  const result = await pool.query<Project>(`
    SELECT
      p.id, p.project_name AS "projectName",
      p.domain_id AS "domainId", d.domain_name AS "domainName",
      p.source_project_key AS "sourceProjectKey", p.source_type AS "sourceType", p.project_category AS "projectCategory", p.ttm,
      COALESCE(p.lead_name, '') AS "leadName", p.is_active AS "isActive",
      p.created_at::text AS "createdAt"
    FROM projects p
    LEFT JOIN domains d ON d.id = p.domain_id
    ORDER BY p.source_project_key ASC;
  `);
  return result.rows;
}

/**
 * Creates/updates only the project record itself — PM/SM assignment (projects.lead_name) is not
 * touched here. It's set exclusively by auth-service.ts's replacePermissions, driven by the Users
 * screen's project assignment UI, so a Project add/edit save can never clobber it.
 */
export async function createProject(input: ProjectInput): Promise<Project> {
  const result = await pool.query<{ id: number }>(`
    INSERT INTO projects (project_name, domain_id, source_project_key, source_type, project_category, ttm, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id;
  `, [input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.isActive]);
  return getProjectById(result.rows[0].id);
}

export async function updateProject(id: number, input: ProjectInput): Promise<Project> {
  await pool.query(`
    UPDATE projects SET
      project_name = $2, domain_id = $3, source_project_key = $4,
      source_type = $5, project_category = $6, ttm = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [id, input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.isActive]);
  return getProjectById(id);
}

async function getProjectById(id: number): Promise<Project> {
  const result = await pool.query<Project>(`
    SELECT
      p.id, p.project_name AS "projectName",
      p.domain_id AS "domainId", d.domain_name AS "domainName",
      p.source_project_key AS "sourceProjectKey", p.source_type AS "sourceType", p.project_category AS "projectCategory", p.ttm,
      COALESCE(p.lead_name, '') AS "leadName", p.is_active AS "isActive",
      p.created_at::text AS "createdAt"
    FROM projects p
    LEFT JOIN domains d ON d.id = p.domain_id
    WHERE p.id = $1;
  `, [id]);
  return result.rows[0];
}

export async function deleteProject(id: number): Promise<void> {
  await pool.query('DELETE FROM projects WHERE id = $1;', [id]);
}

/** Maps a Jira project key to its configured Domain name, for epics without a direct domain field. */
export async function getDomainByProjectKeyMap(): Promise<Map<string, string>> {
  const result = await pool.query<{ domainName: string; sourceProjectKey: string }>(`
    SELECT p.source_project_key AS "sourceProjectKey", d.domain_name AS "domainName"
    FROM projects p
    JOIN domains d ON d.id = p.domain_id
    WHERE p.is_active AND d.is_active;
  `);
  const map = new Map<string, string>();
  for (const row of result.rows) map.set(row.sourceProjectKey, row.domainName);
  return map;
}

export interface ProjectMeta {
  leadName: string;
  projectName: string;
}

/** Maps a Jira project key to its project name + PM/SM (the project's configured "lead_name"). */
export async function getProjectMetaByProjectKeyMap(): Promise<Map<string, ProjectMeta>> {
  const result = await pool.query<{ leadName: string; projectName: string; sourceProjectKey: string }>(`
    SELECT source_project_key AS "sourceProjectKey", project_name AS "projectName", COALESCE(lead_name, '') AS "leadName"
    FROM projects
    WHERE is_active;
  `);
  const map = new Map<string, ProjectMeta>();
  for (const row of result.rows) map.set(row.sourceProjectKey, { leadName: row.leadName, projectName: row.projectName });
  return map;
}

// ---------- Holidays ----------

export async function listHolidays(): Promise<Holiday[]> {
  const result = await pool.query<Holiday>(`
    SELECT
      id, name, holiday_type AS "holidayType", is_multi_day AS "isMultiDay",
      start_date::text AS "startDate", end_date::text AS "endDate",
      COALESCE(description, '') AS description, is_active AS "isActive",
      created_at::text AS "createdAt"
    FROM holidays
    ORDER BY start_date DESC;
  `);
  return result.rows;
}

function normalizeHolidayInput(input: HolidayInput): HolidayInput {
  return { ...input, endDate: input.isMultiDay ? input.endDate : input.startDate };
}

export async function createHoliday(input: HolidayInput): Promise<Holiday> {
  const normalized = normalizeHolidayInput(input);
  const result = await pool.query<Holiday>(`
    INSERT INTO holidays (name, holiday_type, is_multi_day, start_date, end_date, description, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, holiday_type AS "holidayType", is_multi_day AS "isMultiDay",
      start_date::text AS "startDate", end_date::text AS "endDate",
      COALESCE(description, '') AS description, is_active AS "isActive", created_at::text AS "createdAt";
  `, [normalized.name, normalized.holidayType, normalized.isMultiDay, normalized.startDate, normalized.endDate, normalized.description || null, normalized.isActive]);
  return result.rows[0];
}

export async function updateHoliday(id: number, input: HolidayInput): Promise<Holiday> {
  const normalized = normalizeHolidayInput(input);
  const result = await pool.query<Holiday>(`
    UPDATE holidays SET
      name = $2, holiday_type = $3, is_multi_day = $4, start_date = $5, end_date = $6,
      description = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, name, holiday_type AS "holidayType", is_multi_day AS "isMultiDay",
      start_date::text AS "startDate", end_date::text AS "endDate",
      COALESCE(description, '') AS description, is_active AS "isActive", created_at::text AS "createdAt";
  `, [id, normalized.name, normalized.holidayType, normalized.isMultiDay, normalized.startDate, normalized.endDate, normalized.description || null, normalized.isActive]);
  return result.rows[0];
}

export async function deleteHoliday(id: number): Promise<void> {
  await pool.query('DELETE FROM holidays WHERE id = $1;', [id]);
}

/** Loads all active holidays expanded into a flat set of "YYYY-MM-DD" keys, for working-day math. */
export async function getActiveHolidaySet(): Promise<HolidaySet> {
  const result = await pool.query<{ endDate: string; startDate: string }>(`
    SELECT start_date::text AS "startDate", end_date::text AS "endDate"
    FROM holidays
    WHERE is_active;
  `);
  return expandHolidayRanges(result.rows);
}

// ---------- Issue Type ⇄ Role mapping ----------

export async function listIssueTypeRoleMappings(): Promise<IssueTypeRoleMapping[]> {
  const result = await pool.query<IssueTypeRoleMapping>(`
    SELECT id, issue_type AS "issueType", team_role AS "teamRole", created_at::text AS "createdAt"
    FROM issue_type_role_mapping
    ORDER BY team_role ASC, issue_type ASC;
  `);
  return result.rows;
}

export async function createIssueTypeRoleMapping(input: IssueTypeRoleMappingInput): Promise<IssueTypeRoleMapping> {
  const result = await pool.query<IssueTypeRoleMapping>(`
    INSERT INTO issue_type_role_mapping (issue_type, team_role)
    VALUES ($1, $2)
    RETURNING id, issue_type AS "issueType", team_role AS "teamRole", created_at::text AS "createdAt";
  `, [input.issueType, input.teamRole]);
  return result.rows[0];
}

export async function updateIssueTypeRoleMapping(id: number, input: IssueTypeRoleMappingInput): Promise<IssueTypeRoleMapping> {
  const result = await pool.query<IssueTypeRoleMapping>(`
    UPDATE issue_type_role_mapping SET
      issue_type = $2, team_role = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, issue_type AS "issueType", team_role AS "teamRole", created_at::text AS "createdAt";
  `, [id, input.issueType, input.teamRole]);
  return result.rows[0];
}

export async function deleteIssueTypeRoleMapping(id: number): Promise<void> {
  await pool.query('DELETE FROM issue_type_role_mapping WHERE id = $1;', [id]);
}

// ---------- Project Components ----------
// project_key here is projects.source_project_key, the same join key epic-alert-service.ts
// resolves onto every Epic row. Rows accumulate from CSV issue imports only
// (project-component-service.ts, keyed off issue.projectKey) -- a component only appears here once
// at least one imported issue carries it; until then it can't be picked for a PM/SM's per-component
// grant on /admin/users, so that user simply sees that project as unrestricted in the meantime.

export async function listProjectComponents(): Promise<ProjectComponent[]> {
  const result = await pool.query<ProjectComponent>(`
    SELECT id, project_key AS "projectKey", component_name AS "componentName",
      is_active AS "isActive", created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    FROM project_components
    ORDER BY project_key ASC, component_name ASC;
  `);
  return result.rows;
}

/**
 * "Mồ côi" (orphan): a catalog row whose (project_key, component_name) doesn't appear on any
 * issue's `components` array in its latest known state (LATEST_ISSUES_CTE — accumulation never
 * deletes catalog rows, so a component that no longer shows up on any current issue, e.g. renamed
 * in Jira or belonging to since-cleaned-up data, just lingers here forever otherwise). Project key
 * per issue is derived the same way the manual-import path validated against (issue key prefix) —
 * good enough for a diagnostic/cleanup view, unlike the request-path resolution used for filtering.
 */
export async function listOrphanProjectComponents(): Promise<ProjectComponent[]> {
  const result = await pool.query<ProjectComponent>(`
    WITH ${LATEST_ISSUES_CTE},
    used_components AS (
      SELECT DISTINCT SPLIT_PART(issue_key, '-', 1) AS project_key, unnest(components) AS component_name
      FROM latest_issues
      WHERE components IS NOT NULL
    )
    SELECT pc.id, pc.project_key AS "projectKey", pc.component_name AS "componentName",
      pc.is_active AS "isActive", pc.created_at::text AS "createdAt", pc.updated_at::text AS "updatedAt"
    FROM project_components pc
    LEFT JOIN used_components uc ON uc.project_key = pc.project_key AND uc.component_name = pc.component_name
    WHERE uc.component_name IS NULL
    ORDER BY pc.project_key ASC, pc.component_name ASC;
  `);
  return result.rows;
}

function validateProjectComponentInput(input: ProjectComponentInput): string | null {
  if (!input.projectKey.trim() || !input.componentName.trim()) return 'Project key và Component là bắt buộc.';
  if (input.projectKey.trim().length > 50 || input.componentName.trim().length > 255) return 'Project key hoặc Component vượt quá độ dài cho phép.';
  return null;
}

export async function createProjectComponent(input: ProjectComponentInput): Promise<{ component?: ProjectComponent; error?: string }> {
  const validationError = validateProjectComponentInput(input);
  if (validationError) return { error: validationError };
  try {
    const result = await pool.query<ProjectComponent>(`
      INSERT INTO project_components (project_key, component_name, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, project_key AS "projectKey", component_name AS "componentName",
        is_active AS "isActive", created_at::text AS "createdAt", updated_at::text AS "updatedAt";
    `, [input.projectKey.trim(), input.componentName.trim(), input.isActive]);
    return { component: result.rows[0] };
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') return { error: 'Cặp (Project key, Component) này đã tồn tại trong danh mục.' };
    throw error;
  }
}

export async function updateProjectComponent(id: number, input: ProjectComponentInput): Promise<{ component?: ProjectComponent; error?: string }> {
  const validationError = validateProjectComponentInput(input);
  if (validationError) return { error: validationError };
  try {
    const result = await pool.query<ProjectComponent>(`
      UPDATE project_components
      SET project_key = $2, component_name = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, project_key AS "projectKey", component_name AS "componentName",
        is_active AS "isActive", created_at::text AS "createdAt", updated_at::text AS "updatedAt";
    `, [id, input.projectKey.trim(), input.componentName.trim(), input.isActive]);
    if (result.rowCount === 0) return { error: 'Không tìm thấy Component.' };
    return { component: result.rows[0] };
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') return { error: 'Cặp (Project key, Component) này đã tồn tại trong danh mục.' };
    throw error;
  }
}

export async function deleteProjectComponent(id: number): Promise<void> {
  await pool.query('DELETE FROM project_components WHERE id = $1;', [id]);
}
