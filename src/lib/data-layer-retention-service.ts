import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';
import { getActiveHolidaySet } from '@/lib/master-data-service';
import { DEFAULT_RAW_IMPORT_RETENTION_DAYS } from '@/lib/data-retention-service';
import { daysBefore, DENSE_IMPORT_DAYS, layerDateSources, retentionAnchors, weeklySnapshotDates } from '@/lib/data-layer-retention';

/**
 * Daily retention of the `issues` history — the rules are explained in data-layer-retention.ts:
 * every version of the 15 newest import days, then only the version in force at each weekly snapshot date
 * (last working day of the week) up to the RAW retention, plus the newest version of every issue.
 * A selectable "layer" on any screen is therefore an import day of the dense zone or a snapshot date, and the
 * screens read "the state at that date".
 */

type Db = Pick<Pool | PoolClient, 'query'>;

const VN_TODAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text";
const DELETE_CHUNK = 2_000;

async function today(db: Db): Promise<string> {
  return (await db.query<{ today: string }>(`SELECT ${VN_TODAY_SQL} AS today;`)).rows[0].today;
}

async function configuredRetentionDays(db: Db): Promise<number> {
  const result = await db.query<{ days: number }>('SELECT raw_import_retention_days AS days FROM data_retention_configs WHERE id = 1;');
  return result.rows[0]?.days ?? DEFAULT_RAW_IMPORT_RETENTION_DAYS;
}

/** Import dates (aggregated_at::date of import_batches), newest first. */
async function recentImportDates(db: Db, limit: number): Promise<string[]> {
  const result = await db.query<{ d: string }>(`
    SELECT DISTINCT aggregated_at::date::text AS d FROM import_batches ORDER BY d DESC LIMIT $1;
  `, [limit]);
  return result.rows.map((row) => row.d);
}

/** First day of the dense zone — the oldest of the 15 newest import days — or null before the first import. */
export async function getDenseZoneStart(db: Db = pool): Promise<string | null> {
  const dates = await recentImportDates(db, DENSE_IMPORT_DAYS);
  return dates.length === 0 ? null : dates[dates.length - 1];
}

async function listSnapshotDates(db: Db): Promise<string[]> {
  const result = await db.query<{ d: string }>('SELECT snapshot_date::text AS d FROM data_snapshot_dates ORDER BY snapshot_date DESC;');
  return result.rows.map((row) => row.d);
}

/**
 * Every date a screen may offer for "the state at date X", newest first: the import days of the dense zone and
 * the weekly snapshot dates (capped at `limit`, well above what 200 days can hold). Works on a database the
 * data_snapshot_dates migration has not reached yet (dense zone only).
 */
export async function listSelectableLayerDates(db: Db = pool, limit = 365): Promise<string[]> {
  const dense = await recentImportDates(db, DENSE_IMPORT_DAYS);
  const snapshots = await listSnapshotDates(db).catch((error: unknown) => {
    console.error('data_snapshot_dates unavailable — offering the dense zone only:', error);
    return [] as string[];
  });
  return [...new Set([...dense, ...snapshots])].sort().reverse().slice(0, limit);
}

export interface SelectableLayers {
  dates: string[];
  /** Selectable date without an import of its own → the import day its state comes from ("lấy từ lần import ngày X"). */
  sources: Record<string, string>;
}

/** listSelectableLayerDates plus, for the dates without an import that day, the import their state comes from. */
export async function listSelectableLayers(db: Db = pool, limit = 365): Promise<SelectableLayers> {
  const dates = await listSelectableLayerDates(db, limit);
  const imports = await db.query<{ d: string }>('SELECT DISTINCT aggregated_at::date::text AS d FROM import_batches;');
  return { dates, sources: layerDateSources(dates, imports.rows.map((row) => row.d)) };
}

/**
 * Writes the weekly snapshot dates that have come due (a week's last working day, once it is strictly in the
 * past) and removes those older than the retention. A date never changes afterwards, even if the holiday
 * calendar is edited. Returns how many dates were added.
 */
export async function recordWeeklySnapshotDates(db: Db = pool, retentionOverride?: number): Promise<{ added: number; pruned: number }> {
  const [now, days, firstResult] = await Promise.all([
    today(db),
    retentionOverride ?? configuredRetentionDays(db),
    db.query<{ first: string | null }>('SELECT MIN(aggregated_at::date)::text AS first FROM import_batches;'),
  ]);
  const cutoff = daysBefore(now, days);
  const first = firstResult.rows[0]?.first;
  let added = 0;
  if (first) {
    const holidays = await getActiveHolidaySet();
    const dates = weeklySnapshotDates(first < cutoff ? cutoff : first, now, holidays).filter((date) => date >= cutoff);
    if (dates.length > 0) {
      const result = await db.query('INSERT INTO data_snapshot_dates (snapshot_date) SELECT unnest($1::date[]) ON CONFLICT DO NOTHING;', [dates]);
      added = result.rowCount ?? 0;
    }
  }
  const pruned = await db.query('DELETE FROM data_snapshot_dates WHERE snapshot_date < $1::date;', [cutoff]);
  return { added, pruned: pruned.rowCount ?? 0 };
}

export interface IssueThinningPlan {
  /** The anchor dates: snapshot dates inside the retention + the first day of the dense zone. */
  anchors: string[];
  /** Versions dated before this are older than the retention (kept only as the version in force at an anchor, or the newest). */
  cutoff: string;
  /** Versions dated on/after this are all kept. */
  denseStart: string | null;
  /** Row ids to delete. */
  deleteIds: number[];
  deleteBeyondRetention: number;
  deleteInSparseZone: number;
  /** Deletions per issue_type. */
  deleteByType: Record<string, number>;
  keptDense: number;
  /** Older than the dense zone and kept: newest version of an issue, or the version in force at an anchor. */
  keptBridging: number;
  keptNewestOld: number;
  totalRows: number;
}

/** Empty expired batches that deleting `deleteIds` would leave (what deleteEmptyExpiredBatches would then remove) — writes nothing. */
export async function countEmptyExpiredBatchesAfter(db: Db, cutoff: string, deleteIds: readonly number[]): Promise<number> {
  const result = await db.query<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM import_batches b
    WHERE b.aggregated_at::date < $1::date
      AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.source_import_batch_id = b.id AND NOT (i.id = ANY($2::int[])))
      AND b.id <> (SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1);
  `, [cutoff, [...deleteIds]]);
  return Number(result.rows[0].n);
}

/** Works out what the daily job would delete — writes nothing. */
export async function planIssueThinning(db: Db = pool, retentionOverride?: number): Promise<IssueThinningPlan> {
  const [now, days, denseStart, snapshots] = await Promise.all([today(db), retentionOverride ?? configuredRetentionDays(db), getDenseZoneStart(db), listSnapshotDates(db)]);
  const cutoff = daysBefore(now, days);
  const totals = (await db.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM issues;')).rows[0];
  const empty: IssueThinningPlan = {
    anchors: [], cutoff, deleteBeyondRetention: 0, deleteByType: {}, deleteIds: [], deleteInSparseZone: 0, denseStart,
    keptBridging: 0, keptDense: Number(totals.total), keptNewestOld: 0, totalRows: Number(totals.total),
  };
  if (!denseStart) return empty;

  const anchors = retentionAnchors(snapshots, denseStart, cutoff);
  const doomed = await db.query<{ id: number; d: string; issueType: string }>(`
    WITH v AS (
      SELECT id, issue_type, aggregated_at::date AS d,
             LEAD(aggregated_at::date) OVER (PARTITION BY issue_key ORDER BY aggregated_at, id) AS next_d
      FROM issues
    )
    SELECT v.id, v.d::text AS d, v.issue_type AS "issueType"
    FROM v
    WHERE v.d < $1::date AND v.next_d IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM unnest($2::date[]) AS a(d) WHERE a.d >= v.d AND a.d < v.next_d);
  `, [denseStart, anchors]);
  const counts = (await db.query<{ dense: string; newestOld: string }>(`
    WITH v AS (
      SELECT aggregated_at::date AS d, LEAD(aggregated_at::date) OVER (PARTITION BY issue_key ORDER BY aggregated_at, id) AS next_d FROM issues
    )
    SELECT COUNT(*) FILTER (WHERE d >= $1::date)::text AS dense,
           COUNT(*) FILTER (WHERE d < $1::date AND next_d IS NULL)::text AS "newestOld"
    FROM v;
  `, [denseStart])).rows[0];

  const deleteByType: Record<string, number> = {};
  let beyond = 0;
  for (const row of doomed.rows) {
    deleteByType[row.issueType] = (deleteByType[row.issueType] ?? 0) + 1;
    if (row.d < cutoff) beyond += 1;
  }
  const keptDense = Number(counts.dense);
  const keptNewestOld = Number(counts.newestOld);
  return {
    anchors, cutoff, denseStart, deleteByType,
    deleteBeyondRetention: beyond,
    deleteIds: doomed.rows.map((row) => row.id),
    deleteInSparseZone: doomed.rows.length - beyond,
    keptBridging: Number(totals.total) - keptDense - keptNewestOld - doomed.rows.length,
    keptDense, keptNewestOld,
    totalRows: Number(totals.total),
  };
}

/** Deletes the planned versions in chunks (the hosted pooler has a statement time limit). Returns the rows deleted. */
async function deleteIssueVersions(db: Db, ids: readonly number[]): Promise<number> {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += DELETE_CHUNK) {
    const result = await db.query('DELETE FROM issues WHERE id = ANY($1::int[]);', [ids.slice(offset, offset + DELETE_CHUNK)]);
    deleted += result.rowCount ?? 0;
  }
  return deleted;
}

/**
 * Batches past the retention that no issue row references any more (the dense and sparse zones keep their
 * batches — a batch is one row a day). The newest batch is never removed.
 */
export async function deleteEmptyExpiredBatches(db: Db, cutoff: string): Promise<number> {
  const result = await db.query(`
    DELETE FROM import_batches b
    WHERE b.aggregated_at::date < $1::date
      AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.source_import_batch_id = b.id)
      AND b.id <> (SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1);
  `, [cutoff]);
  return result.rowCount ?? 0;
}

export interface DataLayerRetentionResult {
  batchesDeleted: number;
  issueVersionsDeleted: number;
  snapshotDatesAdded: number;
  snapshotDatesPruned: number;
}

/** The daily job (runDailyHousekeeping): record the weekly dates that came due, thin the history, drop the empty expired batches. */
export async function runDataLayerRetention(db: Db = pool, retentionOverride?: number): Promise<DataLayerRetentionResult & { cutoff: string }> {
  const snapshots = await recordWeeklySnapshotDates(db, retentionOverride);
  const plan = await planIssueThinning(db, retentionOverride);
  const issueVersionsDeleted = await deleteIssueVersions(db, plan.deleteIds);
  const batchesDeleted = await deleteEmptyExpiredBatches(db, plan.cutoff);
  return { batchesDeleted, cutoff: plan.cutoff, issueVersionsDeleted, snapshotDatesAdded: snapshots.added, snapshotDatesPruned: snapshots.pruned };
}
