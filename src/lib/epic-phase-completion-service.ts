import 'server-only';
import pool from '@/lib/db';
import { EPIC_ISSUE_TYPES_SQL, LATEST_ISSUES_CTE, STORY_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { storyWorkflowStatusIndex } from '@/lib/story-workflow-rules';
import { isCancelledStatus } from '@/lib/issue-status-rules';

export interface EpicPhaseCompletion {
  designDone: boolean;
  devDone: boolean;
  r4goliveDone: boolean;
  releasedDone: boolean;
  testDone: boolean;
}

interface EpicPhaseSignalsRow {
  baDoneCount: string;
  baTotal: string;
  dueDate: string | null;
  epicKey: string;
  epicStatus: string;
  r4gDate: string | null;
  storyStatuses: string[];
}

function normalizeStatus(value: string): string {
  return value.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

/** All non-Cancelled story statuses reach at least `thresholdStatus` in the Story workflow order — false if there are no (surviving) stories. */
function allStoriesAtLeast(storyStatuses: string[], thresholdStatus: string): boolean {
  if (storyStatuses.length === 0) return false;
  const threshold = storyWorkflowStatusIndex(thresholdStatus);
  return storyStatuses.every((status) => storyWorkflowStatusIndex(status) >= threshold);
}

function deriveCompletion(row: EpicPhaseSignalsRow): EpicPhaseCompletion {
  const epicStatus = normalizeStatus(row.epicStatus);
  const baTotal = Number(row.baTotal);
  const baDoneCount = Number(row.baDoneCount);
  const storyStatuses = row.storyStatuses.filter((status) => !isCancelledStatus(status));

  const designDone = epicStatus === 'IN PROGRESS' || (baTotal > 0 && baDoneCount === baTotal);
  const devDone = allStoriesAtLeast(storyStatuses, 'READY FOR TEST');
  const testDone = allStoriesAtLeast(storyStatuses, 'UAT DONE');
  const r4goliveDone = epicStatus === 'R4GOLIVE' || row.r4gDate !== null || allStoriesAtLeast(storyStatuses, 'READY FOR GOLIVE');
  const releasedDone = epicStatus === 'RELEASED' || row.dueDate !== null
    || (storyStatuses.length > 0 && storyStatuses.every((status) => normalizeStatus(status) === 'RELEASED'));

  return { designDone, devDone, r4goliveDone, releasedDone, testDone };
}

/**
 * Core logic: per-Epic phase completion, evaluated live from current story/subtask statuses on
 * every call (no longer recorded/frozen — see epic_milestone_history, whose write path is now
 * disabled). Hierarchy resolution rule (per Epic, per Story):
 *
 * - An Epic's Stories come from its own `epic_stories` key list (set by the Py Jira API adapter),
 *   each resolved to that Story's own latest known row — which may come from an OLDER import layer
 *   than the Epic's, since daily imports are incremental and a Story not touched in the latest
 *   batch simply keeps showing its last known state (LATEST_ISSUES_CTE already resolves this).
 *   Epics imported before `epic_stories` existed (empty/null list) fall back to the previous
 *   reverse-lookup (`story.epic_key = epic.issue_key`).
 * - A Story's Subtasks come from its own `story_subtasks` key list the same way, falling back to
 *   `subtask.parent_key = story.issue_key` when that Story has no list yet.
 * - A Subtask belonging directly to the Epic (no parent Story — `parent_key` empty but
 *   `epic_key`/resolved epic matches) is a real, expected shape (BA work done before any Story
 *   exists yet) and is included in the DESIGN rule's BA-subtask count via `epic_level_subtasks`.
 * - Cancelled Stories and Cancelled Subtasks are excluded everywhere (never block, never count).
 */
export async function computeEpicPhaseCompletionByEpicKey(): Promise<Map<string, EpicPhaseCompletion>> {
  const result = await pool.query<EpicPhaseSignalsRow>(`
    WITH ${LATEST_ISSUES_CTE},
    epics AS (
      SELECT issue_key, current_status, r4g_date::text AS r4g_date, due_date::text AS due_date, epic_stories
      FROM latest_issues
      WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    ),
    stories_explicit AS (
      SELECT e.issue_key AS epic_key, li.issue_key AS story_key, li.current_status AS status, li.story_subtasks
      FROM epics e
      CROSS JOIN LATERAL unnest(e.epic_stories) AS story_key
      JOIN latest_issues li ON li.issue_key = story_key AND UPPER(li.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
      WHERE e.epic_stories IS NOT NULL AND array_length(e.epic_stories, 1) > 0
    ),
    stories_fallback AS (
      SELECT e.issue_key AS epic_key, li.issue_key AS story_key, li.current_status AS status, li.story_subtasks
      FROM epics e
      JOIN latest_issues li ON li.epic_key = e.issue_key AND UPPER(li.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
      WHERE e.epic_stories IS NULL OR array_length(e.epic_stories, 1) IS NULL
    ),
    all_stories AS (
      SELECT DISTINCT * FROM stories_explicit
      UNION
      SELECT DISTINCT * FROM stories_fallback
    ),
    stories_active AS (
      SELECT * FROM all_stories WHERE status NOT ILIKE '%cancel%'
    ),
    story_subtasks_explicit AS (
      SELECT sa.epic_key, li.issue_key AS subtask_key, li.current_status AS status, li.issue_type
      FROM stories_active sa
      CROSS JOIN LATERAL unnest(sa.story_subtasks) AS subtask_key
      JOIN latest_issues li ON li.issue_key = subtask_key
      WHERE sa.story_subtasks IS NOT NULL AND array_length(sa.story_subtasks, 1) > 0
    ),
    story_subtasks_fallback AS (
      SELECT sa.epic_key, li.issue_key AS subtask_key, li.current_status AS status, li.issue_type
      FROM stories_active sa
      JOIN latest_issues li ON li.parent_key = sa.story_key
      WHERE sa.story_subtasks IS NULL OR array_length(sa.story_subtasks, 1) IS NULL
    ),
    epic_level_subtasks AS (
      SELECT e.issue_key AS epic_key, li.issue_key AS subtask_key, li.current_status AS status, li.issue_type
      FROM epics e
      JOIN latest_issues li ON li.epic_key = e.issue_key
      WHERE (li.parent_key IS NULL OR li.parent_key = '')
        AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
        AND UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
    ),
    role_map AS (
      SELECT UPPER(issue_type) AS issue_type_upper FROM issue_type_role_mapping WHERE team_role = 'BA'
    ),
    all_ba_subtasks AS (
      SELECT epic_key, status FROM story_subtasks_explicit WHERE UPPER(issue_type) IN (SELECT issue_type_upper FROM role_map) AND status NOT ILIKE '%cancel%'
      UNION ALL
      SELECT epic_key, status FROM story_subtasks_fallback WHERE UPPER(issue_type) IN (SELECT issue_type_upper FROM role_map) AND status NOT ILIKE '%cancel%'
      UNION ALL
      SELECT epic_key, status FROM epic_level_subtasks WHERE UPPER(issue_type) IN (SELECT issue_type_upper FROM role_map) AND status NOT ILIKE '%cancel%'
    ),
    ba_agg AS (
      SELECT epic_key, COUNT(*) AS total, COUNT(*) FILTER (WHERE LOWER(status) = 'done') AS done_count
      FROM all_ba_subtasks GROUP BY epic_key
    ),
    stories_agg AS (
      SELECT epic_key, jsonb_agg(status) AS statuses
      FROM stories_active GROUP BY epic_key
    )
    SELECT
      e.issue_key AS "epicKey",
      e.current_status AS "epicStatus",
      e.r4g_date AS "r4gDate",
      e.due_date AS "dueDate",
      COALESCE(ba.total, 0)::text AS "baTotal",
      COALESCE(ba.done_count, 0)::text AS "baDoneCount",
      COALESCE(sa.statuses, '[]'::jsonb) AS "storyStatuses"
    FROM epics e
    LEFT JOIN ba_agg ba ON ba.epic_key = e.issue_key
    LEFT JOIN stories_agg sa ON sa.epic_key = e.issue_key;
  `);

  const map = new Map<string, EpicPhaseCompletion>();
  for (const row of result.rows) map.set(row.epicKey, deriveCompletion(row));
  return map;
}
