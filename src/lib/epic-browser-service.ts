import pool from '@/lib/db';
import {
  EPIC_ISSUE_TYPES_SQL,
  LATEST_ISSUES_CTE,
  RESOLVED_DESCENDANTS_CTE,
  STORIES_CTE,
  STORY_ISSUE_TYPES_SQL,
} from '@/lib/issue-resolution-sql';
import type { DataReviewChildrenResponse, DataReviewIssue } from '@/lib/data-review-types';

/**
 * Canonical row shape + mapper for every Epic Browser query (this file, and data-review-service.ts
 * which composes on top of it) — one place defining what a browsable issue looks like.
 */
export interface DataReviewIssueRow {
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

export function toIssue(row: DataReviewIssueRow): DataReviewIssue {
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

/**
 * Resolves a single Epic (by key) to its latest known state, for browsing it directly without a
 * batch context — e.g. clicking an Epic Key on "Quản lý Epic 15" to open the Epic Browser popup.
 * Cross-batch, same as everywhere else (see issue-resolution-sql.ts).
 */
export async function getEpicBrowserRoot(epicKey: string): Promise<DataReviewIssue | null> {
  const result = await pool.query<DataReviewIssueRow>(`
    WITH ${LATEST_ISSUES_CTE}, ${STORIES_CTE}, ${RESOLVED_DESCENDANTS_CTE}
    SELECT
      li.id, li.jira_id AS "jiraId", li.issue_key AS "issueKey", li.issue_type AS "issueType",
      li.current_status AS status, li.start_date::text AS "startDate", li.r4g_date::text AS "r4gDate",
      li.due_date::text AS "dueDate", li.issue_name AS summary, li.assignee_name AS assignee,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(li.issue_key, '-', 1), ''),
        ''
      ) AS project,
      EXISTS (
        SELECT 1 FROM descendants d
        WHERE d.resolved_epic_key = li.issue_key AND UPPER(d.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
      ) AS "hasChildren"
    FROM latest_issues li
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = li.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = li.issue_key
    WHERE li.issue_key = $1 AND UPPER(li.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    LIMIT 1;
  `, [epicKey]);
  return result.rows[0] ? toIssue(result.rows[0]) : null;
}

/**
 * Children (Stories under an Epic, Subtasks under a Story) resolve from each issue's latest known
 * state across the FULL accumulated history, not just rows sharing the parent's batch — daily
 * incremental imports mean an Epic's Stories/Subtasks are very often confirmed in a different
 * day's batch than the Epic itself (e.g. a placeholder Epic created via "Tạo Epic trống" always
 * lives in its own separate batch from the Stories/Subtasks that reference it). `parentId` only
 * needs to identify the parent issue (its issue_key and jira_id are stable regardless of which
 * batch row you look it up from).
 */
export async function getEpicBrowserChildren(
  parentId: number,
  level: 'stories' | 'subtasks',
): Promise<DataReviewChildrenResponse> {
  const parent = await pool.query<{ issueKey: string; jiraId: string }>(
    'SELECT issue_key AS "issueKey", jira_id::text AS "jiraId" FROM issues WHERE id = $1 LIMIT 1;',
    [parentId],
  );
  if (parent.rows.length === 0) return { items: [] };
  const { issueKey, jiraId } = parent.rows[0];

  const predicate = level === 'stories'
    ? `d.resolved_epic_key = $1 AND UPPER(d.issue_type) IN (${STORY_ISSUE_TYPES_SQL})`
    : `(d.parent_key = $1 OR d.parent_key = $2) AND UPPER(d.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})`;
  const queryParams = level === 'stories' ? [issueKey] : [issueKey, jiraId];
  const hasChildrenExpr = level === 'stories'
    ? `EXISTS (
        SELECT 1 FROM descendants sub
        WHERE (sub.parent_key = d.jira_id::text OR sub.parent_key = d.issue_key)
          AND UPPER(sub.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
      )`
    : 'FALSE';

  const result = await pool.query<DataReviewIssueRow>(`
    WITH ${LATEST_ISSUES_CTE}, ${STORIES_CTE}, ${RESOLVED_DESCENDANTS_CTE}
    SELECT
      d.id, d.jira_id AS "jiraId", d.issue_key AS "issueKey", d.issue_type AS "issueType",
      d.current_status AS status, d.start_date::text AS "startDate", d.r4g_date::text AS "r4gDate",
      d.due_date::text AS "dueDate", d.issue_name AS summary, d.assignee_name AS assignee,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(d.issue_key, '-', 1), ''),
        ''
      ) AS project,
      ${hasChildrenExpr} AS "hasChildren"
    FROM descendants d
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = d.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = d.issue_key
    WHERE ${predicate}
    ORDER BY d.issue_key ASC;
  `, queryParams);

  return { items: result.rows.map(toIssue) };
}
