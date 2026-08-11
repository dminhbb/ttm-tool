import pool, { getClient } from '@/lib/db';

const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 3650;

export interface CleanupPreview {
  batchCount: number;
  cutoffDate: string;
  importRowCount: number;
  issueCount: number;
  latestBatchProtected: { aggregatedAt: string; fileName: string; id: number } | null;
  retentionDays: number;
}

export interface CleanupResult {
  batchesDeleted: number;
  cutoffDate: string;
  retentionDays: number;
}

function assertValidRetentionDays(retentionDays: number): void {
  if (!Number.isInteger(retentionDays) || retentionDays < MIN_RETENTION_DAYS || retentionDays > MAX_RETENTION_DAYS) {
    throw new Error(`Số ngày giữ lại phải là số nguyên từ ${MIN_RETENTION_DAYS} đến ${MAX_RETENTION_DAYS}.`);
  }
}

async function getLatestBatchId(): Promise<number | null> {
  const result = await pool.query<{ id: number }>('SELECT id FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;');
  return result.rows[0]?.id ?? null;
}

/**
 * Old import_batches rows older than the cutoff get deleted; issues/import_rows cascade
 * automatically via their FK (ON DELETE CASCADE). epic_ttm_snapshots is untouched (its FK
 * to import_batches is ON DELETE SET NULL), so the compact Epic history survives forever.
 * The most recent batch is always protected regardless of age, so "current state" never breaks.
 */
export async function previewCleanup(retentionDays: number): Promise<CleanupPreview> {
  assertValidRetentionDays(retentionDays);
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const latestBatchId = await getLatestBatchId();

  const [batchResult, latestBatchResult] = await Promise.all([
    pool.query<{ batchCount: string; importRowCount: string; issueCount: string }>(`
      WITH old_batches AS (
        SELECT id, total_rows FROM import_batches WHERE aggregated_at < $1 AND id IS DISTINCT FROM $2
      )
      SELECT
        (SELECT COUNT(*) FROM old_batches)::text AS "batchCount",
        COALESCE((SELECT SUM(total_rows) FROM old_batches), 0)::text AS "importRowCount",
        (SELECT COUNT(*) FROM issues WHERE source_import_batch_id IN (SELECT id FROM old_batches))::text AS "issueCount";
    `, [cutoffDate, latestBatchId]),
    latestBatchId
      ? pool.query<{ aggregatedAt: string; fileName: string; id: number }>('SELECT id, file_name AS "fileName", aggregated_at::text AS "aggregatedAt" FROM import_batches WHERE id = $1;', [latestBatchId])
      : Promise.resolve({ rows: [] }),
  ]);

  const row = batchResult.rows[0];
  return {
    batchCount: Number(row?.batchCount ?? 0),
    cutoffDate: cutoffDate.toISOString(),
    importRowCount: Number(row?.importRowCount ?? 0),
    issueCount: Number(row?.issueCount ?? 0),
    latestBatchProtected: latestBatchResult.rows[0] ?? null,
    retentionDays,
  };
}

export async function runCleanup(retentionDays: number): Promise<CleanupResult> {
  assertValidRetentionDays(retentionDays);
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const latestBatchId = await getLatestBatchId();

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'DELETE FROM import_batches WHERE aggregated_at < $1 AND id IS DISTINCT FROM $2;',
      [cutoffDate, latestBatchId],
    );
    await client.query('COMMIT');
    return { batchesDeleted: result.rowCount ?? 0, cutoffDate: cutoffDate.toISOString(), retentionDays };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
