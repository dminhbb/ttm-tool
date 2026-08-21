import { ISSUE_LEVEL_1_TYPES, ISSUE_LEVEL_2_TYPES } from '@/lib/issue-hierarchy';

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/** Epic-level (hierarchy level 1) issue types, as a SQL `IN (...)` list literal — sourced from
 * issue-hierarchy.ts so every query that means "this is an Epic" agrees on the same definition
 * (Epic, CTNB), instead of each hand-rolling its own `= 'EPIC'` check that silently drops CTNB. */
export const EPIC_ISSUE_TYPES_SQL = sqlStringList(ISSUE_LEVEL_1_TYPES);

/** Story-level (hierarchy level 2) issue types, as a SQL `IN (...)` list literal — sourced from
 * issue-hierarchy.ts (Story, Task, Enabler Story). */
export const STORY_ISSUE_TYPES_SQL = sqlStringList(ISSUE_LEVEL_2_TYPES);

/**
 * Core logic: canonical "latest known state" resolution for every issue accumulated across daily
 * incremental import batches — one row per issue_key, its most recently confirmed state (highest
 * aggregated_at), independent of which batch that state came from (daily imports only contain
 * issues updated that day, so no single batch is a complete snapshot). Every query that needs to
 * know "what does the system currently believe about this issue" should build on this CTE instead
 * of re-deriving it, so a change to the resolution rule only has to happen in one place.
 *
 * Usage: interpolate into a `WITH` clause, e.g. `WITH ${LATEST_ISSUES_CTE} SELECT ... FROM latest_issues`.
 */
export const LATEST_ISSUES_CTE = `
  latest_issues AS (
    SELECT DISTINCT ON (issue_key)
      id, issue_key, issue_type, current_status, epic_key, parent_key, jira_id,
      issue_name, assignee_name, start_date, r4g_date, due_date,
      epic_stories, story_subtasks, components,
      source_import_batch_id, aggregated_at
    FROM issues
    ORDER BY issue_key, aggregated_at DESC
  )
`;

/** Story rows (hierarchy level 2) from latest_issues, keyed for parent-chain resolution. Must
 * follow LATEST_ISSUES_CTE in the same WITH clause. */
export const STORIES_CTE = `
  stories AS (
    SELECT issue_key AS story_key, jira_id AS story_jira_id, epic_key, current_status AS status, aggregated_at
    FROM latest_issues
    WHERE UPPER(issue_type) IN (${STORY_ISSUE_TYPES_SQL})
  )
`;

/**
 * Core logic: resolves the Epic a non-Epic issue (`li`, aliased from latest_issues) ultimately
 * belongs to — its own `epic_key` field if set directly (the Py Jira API adapter sets this on
 * every row, including subtasks), otherwise via its parent Story's `epic_key` (the Pure Jira
 * Export adapter only sets epicLink on Story rows, so a Subtask must resolve through its Story).
 * The parent Story is matched by EITHER its numeric jira_id or its issue key, since which one
 * `parent_key` holds depends on the source adapter (Pure Jira Export: numeric Parent ID; Py Jira
 * API: Story issue key) — this mirrors the same ambiguity import-service.ts's parent-linking
 * UPDATE already resolves the same way for its own purposes.
 *
 * Split into two single-equality LEFT JOINs (rather than one `ON a = x OR b = x` join) so
 * Postgres can hash each side independently — an OR across two different columns isn't sargable
 * for a hash join, and was measured forcing a nested-loop scan of every non-Epic issue against
 * every Story (EXPLAIN ANALYZE: ~1.9s of a ~2s Epic Browser "stories" request on real data,
 * ~490k row comparisons) instead of the near-instant hash joins this form produces. `story_key`
 * and `story_jira_id` are each unique per Story, so this never fans out multiple matching rows.
 *
 * Must follow STORIES_CTE in the same WITH clause, and requires `latest_issues li` in the FROM
 * clause of the query this join is spliced into.
 */
export const RESOLVED_EPIC_KEY_JOIN = `
  LEFT JOIN stories s_by_jira_id ON s_by_jira_id.story_jira_id::text = li.parent_key
  LEFT JOIN stories s_by_key ON s_by_key.story_key = li.parent_key
`;

/** Companion SELECT expression for RESOLVED_EPIC_KEY_JOIN. */
export const RESOLVED_EPIC_KEY_EXPR = `COALESCE(li.epic_key, s_by_jira_id.epic_key, s_by_key.epic_key)`;

/**
 * Every non-Epic issue's latest known state, tagged with the Epic it resolves to — the full
 * "which issues currently belong to which Epic" picture, independent of which batch each issue's
 * latest row came from. Must follow STORIES_CTE in the same WITH clause.
 */
export const RESOLVED_DESCENDANTS_CTE = `
  descendants AS (
    SELECT li.*, ${RESOLVED_EPIC_KEY_EXPR} AS resolved_epic_key
    FROM latest_issues li
    ${RESOLVED_EPIC_KEY_JOIN}
    WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
  )
`;
