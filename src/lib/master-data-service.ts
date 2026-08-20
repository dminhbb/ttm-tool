import pool, { getClient } from '@/lib/db';
import { expandHolidayRanges } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { parseCSV } from '@/lib/csv-parser';
import type {
  Domain,
  DomainInput,
  Holiday,
  HolidayInput,
  IssueTypeRoleMapping,
  IssueTypeRoleMappingInput,
  Project,
  ProjectComponent,
  ProjectComponentImportResult,
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
// resolves onto every Epic row. Rows accumulate both from CSV issue imports
// (project-component-service.ts, keyed off issue.projectKey) and the manual "Import Components"
// tab below — same table, same upsert semantics either way.

export async function listProjectComponents(): Promise<ProjectComponent[]> {
  const result = await pool.query<ProjectComponent>(`
    SELECT id, project_key AS "projectKey", component_name AS "componentName",
      is_active AS "isActive", created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    FROM project_components
    ORDER BY project_key ASC, component_name ASC;
  `);
  return result.rows;
}

interface ParsedComponentRow {
  componentName: string;
  projectKey: string;
  rowNumber: number;
}

/**
 * "Import Components": 2-column CSV (project_key, component) — a manually curated addition to the
 * same catalog CSV issue imports auto-accumulate into (see accumulateProjectComponents). Rejects
 * the whole file on any invalid row (duplicate pair within the file, unknown/inactive project_key)
 * rather than silently dropping rows, so the admin fixes the file instead of getting a partial import.
 */
export async function importProjectComponentsCsv(csvText: string): Promise<ProjectComponentImportResult> {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return { errors: [{ message: 'File rỗng.', rowNumber: 0 }], importedCount: 0, totalRows: 0 };

  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  const projectKeyIdx = headers.findIndex((h) => h === 'project_key' || h === 'projectkey');
  const componentIdx = headers.findIndex((h) => h === 'component' || h === 'component_name' || h === 'componentname');
  if (projectKeyIdx < 0 || componentIdx < 0) {
    return { errors: [{ message: 'File cần đúng 2 cột: project_key và component.', rowNumber: 1 }], importedCount: 0, totalRows: 0 };
  }

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));
  const activeProjectKeys = new Set((await listProjects()).filter((project) => project.isActive).map((project) => project.sourceProjectKey));

  const errors: ProjectComponentImportResult['errors'] = [];
  const seenPairs = new Set<string>();
  const parsed: ParsedComponentRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 for the header row
    const projectKey = (row[projectKeyIdx] ?? '').trim();
    const componentName = (row[componentIdx] ?? '').trim();
    if (!projectKey || !componentName) {
      errors.push({ message: 'Thiếu project_key hoặc component.', rowNumber });
      return;
    }
    if (!activeProjectKeys.has(projectKey)) {
      errors.push({ message: `project_key "${projectKey}" không khớp Dự án nào đang hoạt động.`, rowNumber });
      return;
    }
    const pairKey = `${projectKey} ${componentName}`;
    if (seenPairs.has(pairKey)) {
      errors.push({ message: `Cặp (${projectKey}, ${componentName}) bị lặp lại trong file.`, rowNumber });
      return;
    }
    seenPairs.add(pairKey);
    parsed.push({ componentName, projectKey, rowNumber });
  });

  if (errors.length > 0) return { errors, importedCount: 0, totalRows: dataRows.length };

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const row of parsed) {
      await client.query(`
        INSERT INTO project_components (project_key, component_name)
        VALUES ($1, $2)
        ON CONFLICT (project_key, component_name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
      `, [row.projectKey, row.componentName]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { errors: [], importedCount: parsed.length, totalRows: dataRows.length };
}
