import pool from '@/lib/db';
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
  const result = await pool.query<{ id: number }>(`
    INSERT INTO projects (project_key, project_name, domain_id, source_project_key, source_type, project_category, ttm, lead_name, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id;
  `, [input.projectKey, input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.leadName || null, input.isActive]);
  return getProjectById(result.rows[0].id);
}

export async function updateProject(id: number, input: ProjectInput): Promise<Project> {
  await pool.query(`
    UPDATE projects SET
      project_key = $2, project_name = $3, domain_id = $4, source_project_key = $5,
      source_type = $6, project_category = $7, ttm = $8, lead_name = $9, is_active = $10, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [id, input.projectKey, input.projectName, input.domainId, input.sourceProjectKey, input.sourceType, input.projectCategory, input.ttm, input.leadName || null, input.isActive]);
  return getProjectById(id);
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
