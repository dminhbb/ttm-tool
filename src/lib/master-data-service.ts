import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import { expandHolidayRanges } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import type {
  Domain,
  DomainInput,
  Holiday,
  HolidayInput,
  Project,
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
      p.id, p.project_key AS "projectKey", p.project_name AS "projectName",
      p.domain_id AS "domainId", d.domain_name AS "domainName",
      p.source_project_key AS "sourceProjectKey", p.source_type AS "sourceType", p.project_category AS "projectCategory", p.ttm,
      COALESCE(p.lead_name, '') AS "leadName", p.is_active AS "isActive",
      p.created_at::text AS "createdAt"
    FROM projects p
    LEFT JOIN domains d ON d.id = p.domain_id
    ORDER BY p.project_key ASC;
  `);
  return result.rows;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(`
      INSERT INTO projects (project_key, project_name, domain_id, source_project_key, source_type, project_category, ttm, lead_name, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `, [input.projectKey, input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.leadName || null, input.isActive]);
    await syncProjectLeadAssignment(client, result.rows[0].id, input.leadName);
    await client.query('COMMIT');
    return getProjectById(result.rows[0].id);
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function updateProject(id: number, input: ProjectInput): Promise<Project> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE projects SET
        project_key = $2, project_name = $3, domain_id = $4, source_project_key = $5,
        source_type = $6, project_category = $7, ttm = $8, lead_name = $9, is_active = $10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [id, input.projectKey, input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.leadName || null, input.isActive]);
    await syncProjectLeadAssignment(client, id, input.leadName);
    await client.query('COMMIT');
    return getProjectById(id);
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function syncProjectLeadAssignment(client: PoolClient, projectId: number, leadName: string): Promise<void> {
  await client.query('DELETE FROM user_projects WHERE project_id = $1', [projectId]);
  if (!leadName) return;
  const user = await client.query<{ fullName: string; id: number }>('SELECT id, full_name AS "fullName" FROM users WHERE (full_name = $1 OR email = $1) AND is_active = TRUE', [leadName]);
  if (user.rowCount !== 1) throw new Error('INVALID_PROJECT_LEAD');
  await client.query('UPDATE projects SET lead_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [projectId, user.rows[0].fullName]);
  await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [user.rows[0].id, projectId]);
}

async function getProjectById(id: number): Promise<Project> {
  const result = await pool.query<Project>(`
    SELECT
      p.id, p.project_key AS "projectKey", p.project_name AS "projectName",
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
