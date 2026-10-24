import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import { STORY_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';

/**
 * Epic deletion (owner 2026-10-14) — removes every trace of some Epics from the database: the Epic,
 * its Stories, the Subtasks hanging off the Epic directly and the Subtasks of those Stories, in every
 * data layer (RAW import_rows/issues of every batch) and in
 * the per-Epic history/summary tables (alert history & timeline, milestones, data-anomaly violations,
 * the "Quản trị Epic" row cache, Epic ngoại lệ).
 *
 * The Stories/Subtasks are the ones whose NEWEST state still belongs to the Epic: an issue moved to
 * another Epic on Jira keeps all its layers (owner decision 2026-10-14). Caches are NOT rebuilt here —
 * the company-wide summaries (TTM-Index, TTM Dashboard 2) keep counting the deleted Epics until the
 * next cache run, which the admin starts by hand.
 */

type Queryable = Pick<PoolClient, 'query'>;

export interface EpicDeletionScopeItem {
  /** The Epic of the request this issue belongs to. */
  epicKey: string;
  issueKey: string;
  issueType: string;
}

export interface EpicDeletionTableCount {
  label: string;
  rows: number;
  table: string;
}

export interface EpicDeletionPreview {
  epicKeys: string[];
  /** Requested Epics the database holds nothing of. */
  epicsWithoutData: string[];
  issues: EpicDeletionScopeItem[];
  tables: EpicDeletionTableCount[];
  totalRows: number;
}

export interface EpicDeletionResult {
  deletedAt: string;
  epicKeys: string[];
  /** Epic key → number of issue keys (the Epic itself included) removed. */
  issueCountByEpic: Record<string, number>;
  issueKeys: string[];
  tables: EpicDeletionTableCount[];
  totalRows: number;
}

interface TableTarget {
  label: string;
  table: string;
  /** WHERE clause and its parameters, from the issue keys / Epic keys / import_rows LIKE patterns. */
  where: (keys: ScopeKeys) => { params: unknown[]; sql: string };
}

interface ScopeKeys {
  epicKeys: string[];
  issueKeys: string[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const byIssueKey = (keys: ScopeKeys) => ({ params: [keys.issueKeys], sql: 'issue_key = ANY($1::text[])' });
const byEpicKey = (keys: ScopeKeys) => ({ params: [keys.epicKeys], sql: 'epic_key = ANY($1::text[])' });

/** Deletion order matters only for readability — no FK ties these tables to each other. */
const TABLE_TARGETS: readonly TableTarget[] = [
  {
    label: 'Import rows (RAW)',
    table: 'import_rows',
    // normalized_data_json is TEXT holding JSON.stringify(issue): the LIKE pre-filter keeps the jsonb
    // parse to the few candidate rows instead of the whole table.
    where: (keys) => ({
      params: [keys.issueKeys, keys.issueKeys.map((key) => `%"issueKey":"${escapeLike(key)}"%`)],
      sql: `normalized_data_json LIKE ANY($2::text[]) AND (normalized_data_json::jsonb ->> 'issueKey') = ANY($1::text[])`,
    }),
  },
  { label: 'Issues (RAW, mọi lớp)', table: 'issues', where: byIssueKey },
  { label: 'Dòng thời gian cảnh báo Epic', table: 'epic_alert_timeline', where: byEpicKey },
  { label: 'Mốc hoàn thành Epic', table: 'epic_milestone_history', where: byEpicKey },
  { label: 'Vi phạm sai lệch dữ liệu', table: 'epic_data_anomaly_violations', where: byEpicKey },
  { label: 'Cache dòng Quản trị Epic', table: 'epic_alert_row_cache', where: byEpicKey },
  { label: 'Epic ngoại lệ', table: 'black_listed_epics', where: byEpicKey },
];

/**
 * The issue keys an Epic deletion removes, from the newest state of every issue in the RAW `issues`
 * rows (RAW batches are purged after the retention period).
 *
 * Only the issues that ever pointed at the Epics are looked at (2026-10-19): rows whose issue_key or
 * epic_key is one of them, then rows whose parent_key is one of their Stories — each candidate's newest
 * state is then read over ALL its rows, so the result is exactly what computing the newest state of
 * every issue gave, without doing that over the whole of issues inside the
 * import transaction (indexes: 20261019c_add_epic_deletion_scope_indexes.sql).
 */
export async function resolveEpicDeletionScope(db: Queryable, epicKeys: readonly string[]): Promise<EpicDeletionScopeItem[]> {
  if (epicKeys.length === 0) return [];
  const result = await db.query<EpicDeletionScopeItem>(`
    WITH direct_keys AS (
      SELECT issue_key FROM issues WHERE issue_key = ANY($1::text[]) OR epic_key = ANY($1::text[])
    ),
    direct_latest AS (
      SELECT DISTINCT ON (issue_key) issue_key, issue_type, epic_key, jira_id
      FROM issues
      WHERE issue_key IN (SELECT issue_key FROM direct_keys)
      ORDER BY issue_key, aggregated_at DESC
    ),
    stories AS (
      SELECT issue_key, jira_id, epic_key FROM direct_latest
      WHERE epic_key = ANY($1::text[]) AND NOT (issue_key = ANY($1::text[]))
        AND UPPER(issue_type) IN (${STORY_ISSUE_TYPES_SQL})
    ),
    story_parent_refs AS (
      SELECT issue_key AS ref, epic_key FROM stories
      UNION
      SELECT jira_id::text AS ref, epic_key FROM stories WHERE jira_id IS NOT NULL AND jira_id <> 0
    ),
    child_keys AS (
      SELECT issue_key FROM issues WHERE parent_key IN (SELECT ref FROM story_parent_refs)
    ),
    child_latest AS (
      SELECT DISTINCT ON (issue_key) issue_key, issue_type, parent_key
      FROM issues
      WHERE issue_key IN (SELECT issue_key FROM child_keys)
      ORDER BY issue_key, aggregated_at DESC
    ),
    scope AS (
      SELECT issue_key, issue_type, issue_key AS epic_key FROM direct_latest WHERE issue_key = ANY($1::text[])
      UNION
      SELECT issue_key, issue_type, epic_key FROM direct_latest
      WHERE epic_key = ANY($1::text[]) AND NOT (issue_key = ANY($1::text[]))
      UNION
      SELECT child.issue_key, child.issue_type, ref.epic_key FROM child_latest child
      JOIN story_parent_refs ref ON child.parent_key = ref.ref
    )
    SELECT DISTINCT ON (issue_key) issue_key AS "issueKey", issue_type AS "issueType", epic_key AS "epicKey"
    FROM scope
    ORDER BY issue_key, epic_key;
  `, [[...epicKeys]]);
  return result.rows;
}

function scopeKeysOf(epicKeys: readonly string[], scope: readonly EpicDeletionScopeItem[]): ScopeKeys {
  // The Epic keys always go in, even when no issue row is left: their import rows and summary rows
  // can outlive the issues.
  return { epicKeys: [...epicKeys], issueKeys: [...new Set([...epicKeys, ...scope.map((item) => item.issueKey)])] };
}

export async function previewEpicDeletion(epicKeys: readonly string[]): Promise<EpicDeletionPreview> {
  const scope = await resolveEpicDeletionScope(pool, epicKeys);
  const keys = scopeKeysOf(epicKeys, scope);
  const tables: EpicDeletionTableCount[] = [];
  for (const target of TABLE_TARGETS) {
    const { params, sql } = target.where(keys);
    const result = await pool.query<{ rows: string }>(`SELECT COUNT(*)::text AS rows FROM ${target.table} WHERE ${sql};`, params);
    tables.push({ label: target.label, rows: Number(result.rows[0]?.rows ?? 0), table: target.table });
  }
  const epicsWithData = new Set(scope.map((item) => item.epicKey));
  return {
    epicKeys: [...epicKeys],
    epicsWithoutData: epicKeys.filter((key) => !epicsWithData.has(key)),
    issues: scope,
    tables,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
  };
}

/**
 * Deletes the Epics' data inside the caller's transaction (import, Từ chối import), records one
 * audit_logs line per Epic and stamps their denied_import_epics row, if any.
 */
export async function deleteEpicData(client: PoolClient, epicKeys: readonly string[], actorUserId: number | null): Promise<EpicDeletionResult> {
  const scope = await resolveEpicDeletionScope(client, epicKeys);
  const keys = scopeKeysOf(epicKeys, scope);
  const tables: EpicDeletionTableCount[] = [];
  if (epicKeys.length > 0) {
    for (const target of TABLE_TARGETS) {
      const { params, sql } = target.where(keys);
      const result = await client.query(`DELETE FROM ${target.table} WHERE ${sql};`, params);
      tables.push({ label: target.label, rows: result.rowCount ?? 0, table: target.table });
    }
  }

  const issueCountByEpic: Record<string, number> = Object.fromEntries(epicKeys.map((key) => [key, 0]));
  for (const item of scope) issueCountByEpic[item.epicKey] = (issueCountByEpic[item.epicKey] ?? 0) + 1;

  if (epicKeys.length > 0) {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
       SELECT $1::int, 'EPIC_DELETION', 'EPIC', key FROM unnest($2::text[]) AS key;`,
      [actorUserId, [...epicKeys]],
    );
    await client.query(
      `UPDATE denied_import_epics denied
       SET last_deleted_at = NOW(), last_deleted_issue_count = counts.issue_count, updated_at = NOW()
       FROM unnest($1::text[], $2::int[]) AS counts(epic_key, issue_count)
       WHERE denied.epic_key = counts.epic_key;`,
      [Object.keys(issueCountByEpic), Object.values(issueCountByEpic)],
    );
  }

  return {
    deletedAt: new Date().toISOString(),
    epicKeys: [...epicKeys],
    issueCountByEpic,
    issueKeys: keys.issueKeys,
    tables,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
  };
}

/** Epic deletion in its own transaction — the API of the same name. */
export async function executeEpicDeletion(epicKeys: readonly string[], actorUserId: number | null): Promise<EpicDeletionResult> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await deleteEpicData(client, epicKeys, actorUserId);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
