import { getClient } from '@/lib/db';
import pool from '@/lib/db';
import { aggregateBatchData } from '@/lib/import-service';
import {
  EPIC_ISSUE_TYPES_SQL,
  LATEST_ISSUES_CTE,
  RESOLVED_EPIC_KEY_EXPR,
  RESOLVED_EPIC_KEY_JOIN,
  STORIES_CTE,
  STORY_ISSUE_TYPES_SQL,
} from '@/lib/issue-resolution-sql';

export interface OrphanEpicCandidate {
  epicKey: string;
  referencedCount: number;
}

/**
 * Epic keys resolved (see issue-resolution-sql.ts: direct `epic_key`, or via the parent Story for
 * Subtasks that only carry a Story reference — e.g. the Pure Jira Export adapter) from at least
 * one non-Epic issue's latest known row, but with no Epic-type issue of their own anywhere in the
 * accumulated `issues` history. This happens when the Jira export's Epic-level scope (e.g. JQL
 * excluding Done/Closed Epics) differs from its Story/Subtask-level scope, leaving children
 * pointing at an Epic the system never actually received — breaking the milestone/phase
 * computations that resolve "belongs to Epic" the same way (see epic-milestone-history-service.ts).
 */
export async function listOrphanEpicCandidates(): Promise<OrphanEpicCandidate[]> {
  const result = await pool.query<OrphanEpicCandidate>(`
    WITH ${LATEST_ISSUES_CTE},
    ${STORIES_CTE},
    existing_epics AS (
      SELECT issue_key FROM latest_issues WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    ),
    resolved AS (
      SELECT li.issue_key, ${RESOLVED_EPIC_KEY_EXPR} AS epic_key
      FROM latest_issues li
      ${RESOLVED_EPIC_KEY_JOIN}
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
    )
    SELECT r.epic_key AS "epicKey", COUNT(*)::int AS "referencedCount"
    FROM resolved r
    LEFT JOIN existing_epics e ON e.issue_key = r.epic_key
    WHERE r.epic_key IS NOT NULL AND e.issue_key IS NULL
    GROUP BY r.epic_key
    ORDER BY r.epic_key;
  `);
  return result.rows;
}

/** Cheap count-only variant of listOrphanEpicCandidates. */
export async function countOrphanEpicCandidates(): Promise<number> {
  const result = await pool.query<{ count: string }>(`
    WITH ${LATEST_ISSUES_CTE},
    ${STORIES_CTE},
    existing_epics AS (
      SELECT issue_key FROM latest_issues WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    ),
    resolved AS (
      SELECT DISTINCT ${RESOLVED_EPIC_KEY_EXPR} AS epic_key
      FROM latest_issues li
      ${RESOLVED_EPIC_KEY_JOIN}
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
    )
    SELECT COUNT(*)::text AS count
    FROM resolved r
    LEFT JOIN existing_epics e ON e.issue_key = r.epic_key
    WHERE r.epic_key IS NOT NULL AND e.issue_key IS NULL;
  `);
  return Number(result.rows[0].count);
}

export interface OrphanStoryCandidate {
  epicKey: string;
  referencedCount: number;
  storyKey: string;
}

/**
 * Story keys referenced by a Subtask's `parent_key` (its latest known row) with no matching
 * Story-type issue anywhere in the accumulated history — e.g. Epic API-171020's "SUB TEST
 * EXECUTION" subtasks all carry `parent_key = 'API-171023'`, but issue API-171023 was never
 * imported as a Story. This leaves the Subtask undiscoverable when browsing the Epic (Epic
 * Browser only shows Subtasks nested under an actual Story row) even though the Subtask itself
 * correctly carries `epic_key`. Only candidates whose orphaned Subtasks resolve to a known Epic
 * key are returned — without that we wouldn't know which Epic to nest the placeholder Story under.
 */
export async function listOrphanStoryCandidates(): Promise<OrphanStoryCandidate[]> {
  const result = await pool.query<OrphanStoryCandidate>(`
    WITH ${LATEST_ISSUES_CTE},
    ${STORIES_CTE},
    orphaned_subtasks AS (
      SELECT li.parent_key AS story_key, li.epic_key
      FROM latest_issues li
      LEFT JOIN stories s ON s.story_jira_id::text = li.parent_key OR s.story_key = li.parent_key
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL}, ${STORY_ISSUE_TYPES_SQL})
        AND li.parent_key IS NOT NULL AND li.parent_key <> ''
        AND s.story_key IS NULL
    )
    SELECT
      story_key AS "storyKey",
      (array_agg(epic_key) FILTER (WHERE epic_key IS NOT NULL))[1] AS "epicKey",
      COUNT(*)::int AS "referencedCount"
    FROM orphaned_subtasks
    GROUP BY story_key
    HAVING COUNT(epic_key) > 0
    ORDER BY story_key;
  `);
  return result.rows;
}

/** Cheap count-only variant of listOrphanStoryCandidates. */
export async function countOrphanStoryCandidates(): Promise<number> {
  const result = await pool.query<{ count: string }>(`
    WITH ${LATEST_ISSUES_CTE},
    ${STORIES_CTE},
    orphaned_subtasks AS (
      SELECT li.parent_key AS story_key, li.epic_key
      FROM latest_issues li
      LEFT JOIN stories s ON s.story_jira_id::text = li.parent_key OR s.story_key = li.parent_key
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL}, ${STORY_ISSUE_TYPES_SQL})
        AND li.parent_key IS NOT NULL AND li.parent_key <> ''
        AND s.story_key IS NULL
    ),
    grouped AS (
      SELECT story_key, COUNT(epic_key) AS epic_count
      FROM orphaned_subtasks
      GROUP BY story_key
      HAVING COUNT(epic_key) > 0
    )
    SELECT COUNT(*)::text AS count FROM grouped;
  `);
  return Number(result.rows[0].count);
}

export interface CompleteDataResult {
  createdEpics: string[];
  createdStories: string[];
  skippedEpics: string[];
  skippedStories: string[];
}

/**
 * "Hoàn thiện dữ liệu": creates a minimal placeholder Epic (Summary = Epic Key, Status = "In
 * Progress" — must match epic_status_alert_rules' exact casing, see ttm-rules.ts's
 * resolveOffsetRule, or the Epic silently never gets an EARLY/LATE/FAIL alert — Start Date = the
 * given date) for each given Epic key, and a minimal placeholder Story
 * (Summary = Story Key, epic_key = the Epic it resolves to per listOrphanStoryCandidates) for each
 * given Story key — restoring full Epic → Story → Subtask referential integrity so every Epic
 * Browser screen can display the complete hierarchy. Both are recorded under one manual import
 * batch, then the normal aggregation pipeline (epic_ttm_snapshots, milestone history, …) re-runs
 * so every screen picks the new data up immediately, exactly as a real CSV import would.
 */
export async function completeMissingData(
  epicKeys: string[],
  storyKeys: string[],
  createdBy: string,
  startDate: Date,
): Promise<CompleteDataResult> {
  const uniqueEpicKeys = [...new Set(epicKeys.map((key) => key.trim()).filter(Boolean))];
  const uniqueStoryKeys = [...new Set(storyKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueEpicKeys.length === 0 && uniqueStoryKeys.length === 0) {
    return { createdEpics: [], createdStories: [], skippedEpics: [], skippedStories: [] };
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const allKeys = [...uniqueEpicKeys, ...uniqueStoryKeys];
    const existing = await client.query<{ issueKey: string }>(
      'SELECT DISTINCT issue_key AS "issueKey" FROM issues WHERE issue_key = ANY($1::text[]);',
      [allKeys],
    );
    const alreadyPresent = new Set(existing.rows.map((row) => row.issueKey));
    const epicsToCreate = uniqueEpicKeys.filter((key) => !alreadyPresent.has(key));
    const storiesToCreate = uniqueStoryKeys.filter((key) => !alreadyPresent.has(key));

    if (epicsToCreate.length === 0 && storiesToCreate.length === 0) {
      await client.query('ROLLBACK');
      return { createdEpics: [], createdStories: [], skippedEpics: uniqueEpicKeys, skippedStories: uniqueStoryKeys };
    }

    // Story placeholders need the Epic each one resolves to — look this up fresh (not from the
    // caller) so a stale/tampered request can't attach a Story to an arbitrary Epic.
    const storyEpicByKey = new Map<string, string>();
    if (storiesToCreate.length > 0) {
      const candidates = await listOrphanStoryCandidates();
      for (const candidate of candidates) {
        if (storiesToCreate.includes(candidate.storyKey)) storyEpicByKey.set(candidate.storyKey, candidate.epicKey);
      }
    }
    const resolvedStoriesToCreate = storiesToCreate.filter((key) => storyEpicByKey.has(key));
    const unresolvedStories = storiesToCreate.filter((key) => !storyEpicByKey.has(key));

    if (epicsToCreate.length === 0 && resolvedStoriesToCreate.length === 0) {
      await client.query('ROLLBACK');
      return {
        createdEpics: [],
        createdStories: [],
        skippedEpics: uniqueEpicKeys.filter((key) => alreadyPresent.has(key)),
        skippedStories: [...uniqueStoryKeys.filter((key) => alreadyPresent.has(key)), ...unresolvedStories],
      };
    }

    const aggregatedAt = new Date();
    const totalRows = epicsToCreate.length + resolvedStoriesToCreate.length;
    const batch = await client.query<{ id: number }>(`
      INSERT INTO import_batches (source_type, file_name, import_type, imported_by, aggregated_at, total_rows, success_rows, warning_rows, error_rows, status)
      VALUES ('MANUAL', 'Hoàn thiện dữ liệu (thủ công)', 'MANUAL', $1, $2, $3, $3, 0, 0, 'SUCCESS')
      RETURNING id;
    `, [createdBy, aggregatedAt, totalRows]);
    const batchId = batch.rows[0].id;

    for (const epicKey of epicsToCreate) {
      await client.query(`
        INSERT INTO issues (jira_id, issue_key, issue_name, issue_type, current_status, start_date, source_import_batch_id, aggregated_at)
        VALUES (0, $1, $2, 'EPIC', 'In Progress', $3, $4, $5);
      `, [epicKey, epicKey, startDate, batchId, aggregatedAt]);
    }

    for (const storyKey of resolvedStoriesToCreate) {
      await client.query(`
        INSERT INTO issues (jira_id, issue_key, issue_name, issue_type, current_status, epic_key, source_import_batch_id, aggregated_at)
        VALUES (0, $1, $2, 'STORY', 'TO DO', $3, $4, $5);
      `, [storyKey, storyKey, storyEpicByKey.get(storyKey), batchId, aggregatedAt]);
    }

    await aggregateBatchData(client, batchId, aggregatedAt);

    await client.query('COMMIT');
    return {
      createdEpics: epicsToCreate,
      createdStories: resolvedStoriesToCreate,
      skippedEpics: uniqueEpicKeys.filter((key) => alreadyPresent.has(key)),
      skippedStories: [...uniqueStoryKeys.filter((key) => alreadyPresent.has(key)), ...unresolvedStories],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
