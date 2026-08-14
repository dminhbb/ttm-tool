import type { PoolClient } from 'pg';
import pool from '@/lib/db';

export type EpicMilestoneKey = 'DESIGN_DONE';

export interface EpicMilestoneHistoryEntry {
  milestone: EpicMilestoneKey;
  milestoneDate: string;
}

/**
 * Appends the date an Epic first reached an internal milestone. Unlike epic_alert_history (which
 * accumulates a new row every time it re-triggers), a milestone is a one-time fact — ON CONFLICT
 * DO NOTHING keeps the originally detected date instead of drifting forward on later re-runs.
 */
export async function recordEpicMilestone(
  client: PoolClient,
  epicKey: string,
  milestone: EpicMilestoneKey,
  milestoneDate: Date,
  sourceImportBatchId: number,
): Promise<void> {
  await client.query(`
    INSERT INTO epic_milestone_history (epic_key, milestone, milestone_date, source_import_batch_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (epic_key, milestone) DO NOTHING;
  `, [epicKey, milestone, milestoneDate, sourceImportBatchId]);
}

export async function listEpicMilestones(epicKey: string): Promise<EpicMilestoneHistoryEntry[]> {
  const result = await pool.query<EpicMilestoneHistoryEntry>(`
    SELECT milestone, milestone_date::text AS "milestoneDate"
    FROM epic_milestone_history
    WHERE epic_key = $1
    ORDER BY milestone_date DESC;
  `, [epicKey]);
  return result.rows;
}

/** Design-done date per epic, keyed by epic_key, read straight from the recorded milestone history. */
export async function getDesignDoneDatesByEpicKey(): Promise<Map<string, string>> {
  const result = await pool.query<{ epicKey: string; milestoneDate: string }>(`
    SELECT epic_key AS "epicKey", milestone_date::text AS "milestoneDate"
    FROM epic_milestone_history
    WHERE milestone = 'DESIGN_DONE';
  `);
  const map = new Map<string, string>();
  for (const row of result.rows) map.set(row.epicKey, row.milestoneDate);
  return map;
}

/**
 * Core logic: DESIGN is considered done for an Epic once every non-Cancelled "BA" subtask
 * belonging to it — either linked directly to the Epic, or to a Story that itself belongs to the
 * Epic — is Done. "Belonging to" is resolved from each issue's own latest known row (not
 * batch-scoped parent/epic FK links, since daily imports are incremental and a subtask's latest
 * row may come from a different day's batch than its Epic or Story). The recorded date is the
 * latest `aggregated_at` among that Epic's Done BA subtasks — i.e. the data layer that last
 * confirmed the final one was Done.
 */
export async function computeDesignDoneCandidates(client: PoolClient): Promise<{ designDoneDate: Date; epicKey: string }[]> {
  const result = await client.query<{ aggregatedAt: string; epicKey: string }>(`
    WITH latest_issues AS (
      SELECT DISTINCT ON (issue_key)
        issue_key, issue_type, current_status, epic_key, parent_key, jira_id, aggregated_at
      FROM issues
      ORDER BY issue_key, aggregated_at DESC
    ),
    stories AS (
      SELECT issue_key AS story_key, jira_id AS story_jira_id, epic_key
      FROM latest_issues
      WHERE UPPER(issue_type) IN ('STORY', 'TASK', 'ENABLER STORY')
    ),
    ba_subtasks AS (
      SELECT
        li.current_status AS status,
        li.aggregated_at,
        COALESCE(li.epic_key, s.epic_key) AS "epicKey"
      FROM latest_issues li
      LEFT JOIN stories s ON s.story_jira_id::text = li.parent_key
      WHERE UPPER(li.issue_type) = 'BA'
    )
    SELECT "epicKey", MAX(aggregated_at)::text AS "aggregatedAt"
    FROM ba_subtasks
    WHERE "epicKey" IS NOT NULL
      AND status NOT ILIKE '%cancel%'
    GROUP BY "epicKey"
    HAVING COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE LOWER(status) = 'done');
  `);
  return result.rows.map((row) => ({ designDoneDate: new Date(row.aggregatedAt), epicKey: row.epicKey }));
}
