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
  aggregatedAt?: string;
  assignee: string | null;
  dueDate: string | null;
  hasChildren?: boolean;
  id: number;
  issueKey: string;
  issueType: string;
  jiraId: string | number;
  project: string | null;
  r4gDate: string | null;
  role?: string | null;
  startDate: string | null;
  status: string;
  summary: string;
}

export function toIssue(row: DataReviewIssueRow): DataReviewIssue {
  return {
    assignee: row.assignee ?? '',
    dataLayerDate: row.aggregatedAt ?? null,
    dueDate: row.dueDate,
    hasChildren: row.hasChildren ?? false,
    id: row.id,
    issueKey: row.issueKey,
    issueType: row.issueType,
    jiraId: String(row.jiraId),
    project: row.project ?? '',
    r4gDate: row.r4gDate,
    role: row.role || '-',
    startDate: row.startDate,
    status: row.status,
    summary: row.summary,
  };
}

/** LEFT JOIN + SELECT expression resolving an issue's team role from issue_type_role_mapping
 * ("Quản lý Issue Type" in Quản lý chung), "-" when its issue type isn't mapped. `alias` is the
 * table/CTE alias exposing an `issue_type` column in the query this is spliced into. */
function roleJoin(alias: string): string {
  return `LEFT JOIN issue_type_role_mapping itrm_${alias} ON UPPER(itrm_${alias}.issue_type) = UPPER(${alias}.issue_type)`;
}

/**
 * Resolves a single Epic (by key) to its latest known state, for browsing it directly without a
 * batch context — e.g. clicking an Epic Key on "Quản trị Epic" to open the Epic Browser popup.
 * Cross-batch, same as everywhere else (see issue-resolution-sql.ts). `hasChildren` counts both
 * Stories AND the Epic's own direct Subtasks (no parent Story — see EPIC_LEVEL_SUBTASKS_PREDICATE
 * below), so an Epic with only direct BA subtasks still shows as expandable.
 */
export async function getEpicBrowserRoot(epicKey: string): Promise<DataReviewIssue | null> {
  const result = await pool.query<DataReviewIssueRow>(`
    WITH ${LATEST_ISSUES_CTE}, ${STORIES_CTE}, ${RESOLVED_DESCENDANTS_CTE}
    SELECT
      li.id, li.jira_id AS "jiraId", li.issue_key AS "issueKey", li.issue_type AS "issueType",
      li.current_status AS status, li.start_date::text AS "startDate", li.r4g_date::text AS "r4gDate",
      li.due_date::text AS "dueDate", li.issue_name AS summary, li.assignee_name AS assignee,
      li.aggregated_at::text AS "aggregatedAt",
      COALESCE(itrm_li.team_role, '-') AS role,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(li.issue_key, '-', 1), ''),
        ''
      ) AS project,
      (
        EXISTS (SELECT 1 FROM unnest(COALESCE(li.epic_stories, '{}')) AS story_key)
        OR EXISTS (
          SELECT 1 FROM descendants d
          WHERE d.resolved_epic_key = li.issue_key AND UPPER(d.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
        )
        OR EXISTS (
          SELECT 1 FROM descendants d
          WHERE d.resolved_epic_key = li.issue_key
            AND UPPER(d.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
            AND (d.parent_key IS NULL OR d.parent_key = '')
        )
      ) AS "hasChildren"
    FROM latest_issues li
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = li.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = li.issue_key
    ${roleJoin('li')}
    WHERE li.issue_key = $1 AND UPPER(li.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    LIMIT 1;
  `, [epicKey]);
  return result.rows[0] ? toIssue(result.rows[0]) : null;
}

/**
 * Children (Stories + the Epic's own direct Subtasks under an Epic; Subtasks under a Story)
 * resolve from each issue's latest known state across the FULL accumulated history, not just rows
 * sharing the parent's batch — daily incremental imports mean an Epic's Stories/Subtasks are very
 * often confirmed in a different day's batch than the Epic itself.
 *
 * Core logic: an Epic's Stories and a Story's Subtasks are keyed off the parent's own
 * `epic_stories`/`story_subtasks` list (set by the Py Jira API adapter) — each key resolved to
 * that issue's own latest known row (which is exactly the "layer fallback": a key not touched in
 * the newest batch simply keeps showing its last known state, since latest_issues always picks
 * the highest aggregated_at per issue_key regardless of batch). Epics/Stories imported before
 * these list columns existed (null/empty) fall back to the previous reverse-lookup
 * (`epic_key`/`parent_key` matching, via RESOLVED_DESCENDANTS_CTE) — unioned in rather than
 * gated on emptiness, so a partially-populated list never silently drops an issue the reverse
 * lookup would have found.
 *
 * `level: 'stories'` also includes the Epic's own direct Subtasks (no parent Story) as siblings
 * of the Stories, at the same tree depth — they ARE the Epic's direct children, just not
 * Story-typed. The frontend (EpicBrowser.tsx) picks the row's icon from its real `issueType`
 * rather than tree depth, so this renders correctly.
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

  const childrenCte = level === 'stories'
    ? `
      children AS (
        SELECT li.* FROM latest_issues p
        CROSS JOIN LATERAL unnest(COALESCE(p.epic_stories, '{}')) AS story_key
        JOIN latest_issues li ON li.issue_key = story_key
        WHERE p.issue_key = $1 AND UPPER(li.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
        UNION
        SELECT d.id, d.issue_key, d.issue_type, d.current_status, d.epic_key, d.parent_key, d.jira_id,
          d.issue_name, d.assignee_name, d.start_date, d.r4g_date, d.due_date,
          d.epic_stories, d.story_subtasks, d.components, d.source_import_batch_id, d.aggregated_at
        FROM descendants d
        WHERE d.resolved_epic_key = $1 AND UPPER(d.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
        UNION
        SELECT d.id, d.issue_key, d.issue_type, d.current_status, d.epic_key, d.parent_key, d.jira_id,
          d.issue_name, d.assignee_name, d.start_date, d.r4g_date, d.due_date,
          d.epic_stories, d.story_subtasks, d.components, d.source_import_batch_id, d.aggregated_at
        FROM descendants d
        WHERE d.resolved_epic_key = $1
          AND UPPER(d.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
          AND (d.parent_key IS NULL OR d.parent_key = '')
      )
    `
    : `
      children AS (
        SELECT li.* FROM latest_issues p
        CROSS JOIN LATERAL unnest(COALESCE(p.story_subtasks, '{}')) AS subtask_key
        JOIN latest_issues li ON li.issue_key = subtask_key
        WHERE p.issue_key = $1 AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
        UNION
        SELECT d.id, d.issue_key, d.issue_type, d.current_status, d.epic_key, d.parent_key, d.jira_id,
          d.issue_name, d.assignee_name, d.start_date, d.r4g_date, d.due_date,
          d.epic_stories, d.story_subtasks, d.components, d.source_import_batch_id, d.aggregated_at
        FROM descendants d
        WHERE (d.parent_key = $1 OR d.parent_key = $2) AND UPPER(d.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
      )
    `;
  const queryParams = level === 'stories' ? [issueKey] : [issueKey, jiraId];
  const hasChildrenExpr = level === 'stories'
    ? `EXISTS (
        SELECT 1 FROM descendants sub
        WHERE (sub.parent_key = c.jira_id::text OR sub.parent_key = c.issue_key)
          AND UPPER(sub.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
      )`
    : 'FALSE';

  const result = await pool.query<DataReviewIssueRow>(`
    WITH ${LATEST_ISSUES_CTE}, ${STORIES_CTE}, ${RESOLVED_DESCENDANTS_CTE}, ${childrenCte}
    SELECT
      c.id, c.jira_id AS "jiraId", c.issue_key AS "issueKey", c.issue_type AS "issueType",
      c.current_status AS status, c.start_date::text AS "startDate", c.r4g_date::text AS "r4gDate",
      c.due_date::text AS "dueDate", c.issue_name AS summary, c.assignee_name AS assignee,
      c.aggregated_at::text AS "aggregatedAt",
      COALESCE(itrm_c.team_role, '-') AS role,
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(c.issue_key, '-', 1), ''),
        ''
      ) AS project,
      ${hasChildrenExpr} AS "hasChildren"
    FROM children c
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = c.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = c.issue_key
    ${roleJoin('c')}
    ORDER BY c.issue_key ASC;
  `, queryParams);

  return { items: result.rows.map(toIssue) };
}
