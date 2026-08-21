import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { LATEST_ISSUES_CTE, RESOLVED_EPIC_KEY_EXPR, RESOLVED_EPIC_KEY_JOIN, STORIES_CTE } from '@/lib/issue-resolution-sql';
import { storyWorkflowStatusIndex } from '@/lib/story-workflow-rules';

export type EpicMilestoneKey = 'DESIGN_DONE' | 'DEV_DONE' | 'TEST_DONE';

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

async function getMilestoneDatesByEpicKey(milestone: EpicMilestoneKey): Promise<Map<string, string>> {
  const result = await pool.query<{ epicKey: string; milestoneDate: string }>(`
    SELECT epic_key AS "epicKey", milestone_date::text AS "milestoneDate"
    FROM epic_milestone_history
    WHERE milestone = $1;
  `, [milestone]);
  const map = new Map<string, string>();
  for (const row of result.rows) map.set(row.epicKey, row.milestoneDate);
  return map;
}

/** Design-done date per epic, keyed by epic_key, read straight from the recorded milestone history. */
export async function getDesignDoneDatesByEpicKey(): Promise<Map<string, string>> {
  return getMilestoneDatesByEpicKey('DESIGN_DONE');
}

/** Dev-done date per epic, keyed by epic_key, read straight from the recorded milestone history. */
export async function getDevDoneDatesByEpicKey(): Promise<Map<string, string>> {
  return getMilestoneDatesByEpicKey('DEV_DONE');
}

/** Test-done date per epic, keyed by epic_key, read straight from the recorded milestone history. */
export async function getTestDoneDatesByEpicKey(): Promise<Map<string, string>> {
  return getMilestoneDatesByEpicKey('TEST_DONE');
}

interface RoleAgg {
  doneCount: number;
  lastDoneDate: string | null;
  total: number;
}

interface StoryStatusSignal {
  aggregatedAt: string;
  status: string;
}

interface EpicMilestoneSignals {
  ba: RoleAgg;
  epicKey: string;
  stories: StoryStatusSignal[];
}

/**
 * Single query pass computing, per Epic, the BA-role subtask completion signal (still the basis
 * for DESIGN_DONE) and the status of every Story inside it — the shared raw material DESIGN_DONE,
 * DEV_DONE and TEST_DONE are all derived from. DEV_DONE/TEST_DONE only look at Story status (no
 * per-role subtask check — see computeMilestoneCandidates), so only the BA role is aggregated here.
 * Issue-type ⇄ role classification comes from the configurable `issue_type_role_mapping` table
 * (see "Quản lý Issue Type" in Quản lý chung), not a hardcoded literal, so admins can extend it
 * without a code change.
 *
 * "Belonging to" an Epic uses the shared resolution in issue-resolution-sql.ts (latest known row
 * per issue, direct epic_key or via parent Story, adapter-agnostic). Cancelled and Pending items
 * are excluded entirely (never counted, never block a "done" verdict) per the core "ignore
 * Cancelled/Pending" rule (see issue-status-rules.ts).
 */
async function computeEpicMilestoneSignals(client: PoolClient): Promise<EpicMilestoneSignals[]> {
  const result = await client.query<{
    baDoneCount: string; baLastDate: string | null; baTotal: string;
    epicKey: string;
    storiesJson: StoryStatusSignal[];
  }>(`
    WITH ${LATEST_ISSUES_CTE},
    ${STORIES_CTE},
    role_map AS (
      SELECT UPPER(issue_type) AS issue_type_upper, team_role
      FROM issue_type_role_mapping
      WHERE team_role = 'BA'
    ),
    role_subtasks AS (
      SELECT
        li.current_status AS status,
        li.aggregated_at,
        ${RESOLVED_EPIC_KEY_EXPR} AS epic_key
      FROM latest_issues li
      JOIN role_map rm ON rm.issue_type_upper = UPPER(li.issue_type)
      ${RESOLVED_EPIC_KEY_JOIN}
      WHERE li.current_status NOT ILIKE '%cancel%' AND li.current_status NOT ILIKE '%pending%'
    ),
    role_subtasks_filtered AS (
      SELECT * FROM role_subtasks WHERE epic_key IS NOT NULL
    ),
    ba_agg AS (
      SELECT epic_key, COUNT(*) AS total, COUNT(*) FILTER (WHERE LOWER(status) = 'done') AS done_count, MAX(aggregated_at) AS last_date
      FROM role_subtasks_filtered
      GROUP BY epic_key
    ),
    stories_filtered AS (
      SELECT epic_key, status, aggregated_at
      FROM stories
      WHERE epic_key IS NOT NULL AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%pending%'
    ),
    stories_agg AS (
      SELECT epic_key, jsonb_agg(jsonb_build_object('status', status, 'aggregatedAt', aggregated_at)) AS stories
      FROM stories_filtered
      GROUP BY epic_key
    )
    SELECT
      COALESCE(ba.epic_key, sa.epic_key) AS "epicKey",
      COALESCE(ba.total, 0)::text AS "baTotal", COALESCE(ba.done_count, 0)::text AS "baDoneCount", ba.last_date::text AS "baLastDate",
      COALESCE(sa.stories, '[]'::jsonb) AS "storiesJson"
    FROM ba_agg ba
    FULL JOIN stories_agg sa ON sa.epic_key = ba.epic_key;
  `);
  return result.rows.map((row) => ({
    ba: { doneCount: Number(row.baDoneCount), lastDoneDate: row.baLastDate, total: Number(row.baTotal) },
    epicKey: row.epicKey,
    stories: row.storiesJson,
  }));
}

export interface MilestoneCandidates {
  designDoneCandidates: { designDoneDate: Date; epicKey: string }[];
  devDoneCandidates: { devDoneDate: Date; epicKey: string }[];
  testDoneCandidates: { epicKey: string; testDoneDate: Date }[];
}

/** Latest of a set of AND-requirement confirmation dates — the last one to be satisfied. */
function latestOf(dates: (string | null)[]): string | null {
  const present = dates.filter((d): d is string => !!d);
  return present.length > 0 ? present.sort().at(-1)! : null;
}

/**
 * Derives all three milestone candidate lists from a single pass over the shared per-epic signals
 * (one DB round trip instead of three near-identical queries).
 *
 * - DESIGN_DONE: every non-Cancelled/non-Pending BA-role subtask belonging to the Epic (directly,
 *   or via one of its Stories) is Done. The recorded date is the latest `aggregated_at` among that
 *   Epic's Done BA subtasks — i.e. the data layer that last confirmed the final one was Done.
 * - DEV_DONE: BA-role subtasks are all Done (same condition as DESIGN_DONE) AND every one of the
 *   Epic's Stories is past "DEV DONE" in the Story workflow. Only Story status is considered —
 *   unlike DESIGN_DONE, this does not look at any subtask underneath the Story.
 * - TEST_DONE: DEV_DONE's condition holds AND every one of the Epic's Stories is past "SIT DONE"
 *   in the Story workflow. Same Story-only rule as DEV_DONE.
 *
 * Cancelled and Pending subtasks/stories are excluded entirely (never block, never count) for all
 * three milestones.
 */
export async function computeMilestoneCandidates(client: PoolClient): Promise<MilestoneCandidates> {
  const signals = await computeEpicMilestoneSignals(client);
  const devDoneStoryIndex = storyWorkflowStatusIndex('DEV DONE');
  const sitDoneStoryIndex = storyWorkflowStatusIndex('SIT DONE');
  const designDoneCandidates: MilestoneCandidates['designDoneCandidates'] = [];
  const devDoneCandidates: MilestoneCandidates['devDoneCandidates'] = [];
  const testDoneCandidates: MilestoneCandidates['testDoneCandidates'] = [];

  for (const { ba, epicKey, stories } of signals) {
    const baAllDone = ba.total > 0 && ba.doneCount === ba.total;
    if (!baAllDone || !ba.lastDoneDate) continue;
    designDoneCandidates.push({ designDoneDate: new Date(ba.lastDoneDate), epicKey });

    const storiesLastDate = stories.length > 0
      ? stories.reduce((max, story) => (story.aggregatedAt > max ? story.aggregatedAt : max), stories[0].aggregatedAt)
      : null;

    const storiesPastDevDone = stories.length > 0 && stories.every((story) => storyWorkflowStatusIndex(story.status) > devDoneStoryIndex);
    if (!storiesPastDevDone) continue;

    const devDoneDate = latestOf([ba.lastDoneDate, storiesLastDate])!;
    devDoneCandidates.push({ devDoneDate: new Date(devDoneDate), epicKey });

    const storiesPastSitDone = stories.length > 0 && stories.every((story) => storyWorkflowStatusIndex(story.status) > sitDoneStoryIndex);
    if (!storiesPastSitDone) continue;

    const testDoneDate = latestOf([devDoneDate, storiesLastDate])!;
    testDoneCandidates.push({ epicKey, testDoneDate: new Date(testDoneDate) });
  }
  return { designDoneCandidates, devDoneCandidates, testDoneCandidates };
}
