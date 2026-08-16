import pool from '@/lib/db';
import { toIssue } from '@/lib/epic-browser-service';
import type { DataReviewIssueRow } from '@/lib/epic-browser-service';
import {
  EPIC_ISSUE_TYPES_SQL,
  LATEST_ISSUES_CTE,
  RESOLVED_DESCENDANTS_CTE,
  STORIES_CTE,
  STORY_ISSUE_TYPES_SQL,
} from '@/lib/issue-resolution-sql';
import type {
  DataReviewEpicsResponse,
  DataReviewFilterOptions,
} from '@/lib/data-review-types';

const DATA_REVIEW_PAGE_SIZE = 10;

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

/**
 * Rows literally present in the reviewed batch — what this specific day's import actually
 * contained. This is the scope for the top-level Epic listing and its filter dropdowns ("what did
 * today's file bring in"), which is intentionally batch-scoped, unlike hierarchy resolution
 * (Story/Subtask children), which is delegated to epic-browser-service.ts's cross-batch resolution.
 */
const batchIssuesCte = `
  batch_issues AS (
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

/**
 * Epic list is scoped to this batch (which Epics did today's import touch), but "does this Epic
 * have children" resolves against the full accumulated history via `descendants` (see
 * issue-resolution-sql.ts) — not just rows that happen to share this exact batch — since daily
 * incremental imports mean an Epic's Stories/Subtasks are very often confirmed in a different
 * day's batch than the Epic itself (e.g. a placeholder Epic created via "Tạo Epic trống" always
 * lives in its own separate batch from the Stories/Subtasks that reference it). The actual
 * Story/Subtask rows themselves are fetched on demand via epic-browser-service.ts.
 */
export async function getDataReviewEpics(
  batchId: number,
  filters: DataReviewFilters,
  page: number,
): Promise<DataReviewEpicsResponse> {
  const offset = (page - 1) * DATA_REVIEW_PAGE_SIZE;
  const values = [batchId, filters.project, filters.status, filters.component, filters.issueType];
  const predicate = `
    UPPER("issueType") IN (${EPIC_ISSUE_TYPES_SQL})
    AND ($2 = '' OR project = $2)
    AND ($3 = '' OR status = $3)
    AND ($4 = '' OR $4 = ANY(regexp_split_to_array(components, '\\s*[,;]\\s*')))
    AND (
      $5 = ''
      OR UPPER("issueType") = UPPER($5)
      OR EXISTS (
        SELECT 1 FROM descendants d
        WHERE d.resolved_epic_key = batch_issues."issueKey" AND UPPER(d.issue_type) = UPPER($5)
      )
    )
  `;
  const cteChain = `WITH ${LATEST_ISSUES_CTE}, ${STORIES_CTE}, ${RESOLVED_DESCENDANTS_CTE}, ${batchIssuesCte}`;

  const [countResult, rowsResult, filterOptions] = await Promise.all([
    pool.query<{ total: number }>(`${cteChain} SELECT COUNT(*)::int AS total FROM batch_issues WHERE ${predicate};`, values),
    pool.query<DataReviewIssueRow>(`
      ${cteChain}
      SELECT id, "jiraId", "issueKey", "issueType", status, "startDate", "r4gDate", "dueDate", summary, assignee, project,
        EXISTS (
          SELECT 1 FROM descendants d
          WHERE d.resolved_epic_key = batch_issues."issueKey" AND UPPER(d.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
        ) AS "hasChildren"
      FROM batch_issues
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
