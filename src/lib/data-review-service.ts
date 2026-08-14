import pool from '@/lib/db';
import type {
  DataReviewChildrenResponse,
  DataReviewEpicsResponse,
  DataReviewFilterOptions,
  DataReviewIssue,
} from '@/lib/data-review-types';

const DATA_REVIEW_PAGE_SIZE = 10;

interface DataReviewIssueRow {
  assignee: string | null;
  dueDate: string | null;
  hasChildren?: boolean;
  id: number;
  issueKey: string;
  issueType: string;
  jiraId: string | number;
  project: string | null;
  r4gDate: string | null;
  startDate: string | null;
  status: string;
  summary: string;
}

interface DataReviewMetadataRow {
  components: string | null;
  issueType: string;
  project: string | null;
  status: string;
}

export interface DataReviewFilters {
  component: string;
  issueType: string;
  project: string;
  status: string;
}

function toIssue(row: DataReviewIssueRow): DataReviewIssue {
  return {
    assignee: row.assignee ?? '',
    dueDate: row.dueDate,
    hasChildren: row.hasChildren ?? false,
    id: row.id,
    issueKey: row.issueKey,
    issueType: row.issueType,
    jiraId: String(row.jiraId),
    project: row.project ?? '',
    r4gDate: row.r4gDate,
    startDate: row.startDate,
    status: row.status,
    summary: row.summary,
  };
}

const issueContextCte = `
  WITH issue_context AS (
    SELECT
      issues.id,
      issues.jira_id AS "jiraId",
      issues.issue_key AS "issueKey",
      issues.issue_type AS "issueType",
      issues.current_status AS status,
      issues.start_date::text AS "startDate",
      issues.r4g_date::text AS "r4gDate",
      issues.due_date::text AS "dueDate",
      issues.issue_name AS summary,
      issues.assignee_name AS assignee,
      issues.epic_id AS "epicId",
      issues.parent_id AS "parentId",
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) AS project,
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'components', ''), '') AS components
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE issues.source_import_batch_id = $1
  )
`;

export async function getDataReviewFilterOptions(batchId: number): Promise<DataReviewFilterOptions> {
  const [metadataResult, componentResult] = await Promise.all([
    pool.query<DataReviewMetadataRow>(`
    SELECT DISTINCT
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) AS project,
      issues.current_status AS status,
      issues.issue_type AS "issueType",
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'components', ''), '') AS components
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE issues.source_import_batch_id = $1
    ORDER BY project, status, "issueType";
  `, [batchId]),
    pool.query<{ componentName: string; projectKey: string }>(`
      SELECT component_name AS "componentName", project_key AS "projectKey"
      FROM project_components
      WHERE is_active
      ORDER BY project_key ASC, component_name ASC;
    `),
  ]);

  const projects = new Set<string>();
  const issueTypes = new Set<string>();
  const statuses = new Set<string>();
  const batchProjects = new Set<string>();
  const componentSets = new Map<string, Set<string>>();

  for (const row of metadataResult.rows) {
    if (row.project) {
      projects.add(row.project);
      batchProjects.add(row.project);
    }
    if (row.issueType) issueTypes.add(row.issueType);
    if (row.status) statuses.add(row.status);
  }

  for (const row of componentResult.rows) {
    if (!batchProjects.has(row.projectKey)) continue;
    const components = componentSets.get(row.projectKey) ?? new Set<string>();
    components.add(row.componentName);
    componentSets.set(row.projectKey, components);
  }

  const componentsByProject: Record<string, string[]> = {};
  for (const [project, components] of componentSets) {
    componentsByProject[project] = [...components].sort((left, right) => left.localeCompare(right));
  }

  return {
    componentsByProject,
    issueTypes: [...issueTypes].sort((left, right) => left.localeCompare(right)),
    projects: [...projects].sort((left, right) => left.localeCompare(right)),
    statuses: [...statuses].sort((left, right) => left.localeCompare(right)),
  };
}

export async function getDataReviewEpics(
  batchId: number,
  filters: DataReviewFilters,
  page: number,
): Promise<DataReviewEpicsResponse> {
  const offset = (page - 1) * DATA_REVIEW_PAGE_SIZE;
  const values = [batchId, filters.project, filters.status, filters.component, filters.issueType];
  const predicate = `
    UPPER("issueType") IN ('EPIC', 'CTNB')
    AND ($2 = '' OR project = $2)
    AND ($3 = '' OR status = $3)
    AND ($4 = '' OR $4 = ANY(regexp_split_to_array(components, '\\s*[,;]\\s*')))
    AND (
      $5 = ''
      OR UPPER("issueType") = UPPER($5)
      OR EXISTS (
        SELECT 1
        FROM issue_context descendants
        WHERE descendants."epicId" = issue_context.id
          AND UPPER(descendants."issueType") = UPPER($5)
      )
    )
  `;

  const [countResult, rowsResult, filterOptions] = await Promise.all([
    pool.query<{ total: number }>(`${issueContextCte} SELECT COUNT(*)::int AS total FROM issue_context WHERE ${predicate};`, values),
    pool.query<DataReviewIssueRow>(`
      ${issueContextCte}
      SELECT id, "jiraId", "issueKey", "issueType", status, "startDate", "r4gDate", "dueDate", summary, assignee, project,
        EXISTS (
          SELECT 1 FROM issue_context descendants
          WHERE descendants."epicId" = issue_context.id AND UPPER(descendants."issueType") IN ('STORY', 'TASK', 'ENABLER STORY')
        ) AS "hasChildren"
      FROM issue_context
      WHERE ${predicate}
      ORDER BY "issueKey" ASC
      LIMIT $6 OFFSET $7;
    `, [...values, DATA_REVIEW_PAGE_SIZE, offset]),
    getDataReviewFilterOptions(batchId),
  ]);

  return {
    filterOptions,
    items: rowsResult.rows.map(toIssue),
    page,
    pageSize: DATA_REVIEW_PAGE_SIZE,
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getDataReviewChildren(
  batchId: number,
  parentId: number,
  level: 'stories' | 'subtasks',
): Promise<DataReviewChildrenResponse> {
  const predicate = level === 'stories'
    ? `"epicId" = $2 AND UPPER("issueType") IN ('STORY', 'TASK', 'ENABLER STORY')`
    : `"parentId" = $2 AND UPPER("issueType") NOT IN ('EPIC', 'CTNB', 'STORY', 'TASK', 'ENABLER STORY')`;
  const hasChildrenExpr = level === 'stories'
    ? `EXISTS (
        SELECT 1 FROM issue_context descendants
        WHERE descendants."parentId" = issue_context.id AND UPPER(descendants."issueType") NOT IN ('EPIC', 'CTNB', 'STORY', 'TASK', 'ENABLER STORY')
      )`
    : 'FALSE';
  const result = await pool.query<DataReviewIssueRow>(`
    ${issueContextCte}
    SELECT id, "jiraId", "issueKey", "issueType", status, "startDate", "r4gDate", "dueDate", summary, assignee, project,
      ${hasChildrenExpr} AS "hasChildren"
    FROM issue_context
    WHERE ${predicate}
    ORDER BY "issueKey" ASC;
  `, [batchId, parentId]);

  return { items: result.rows.map(toIssue) };
}
