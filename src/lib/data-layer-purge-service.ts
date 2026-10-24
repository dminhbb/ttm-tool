import pool, { getClient } from '@/lib/db';

/** A "lớp dữ liệu" (data layer) is one calendar date that has an import batch (aggregated_at). */
export async function listLayerDatesDescending(): Promise<string[]> {
  const result = await pool.query<{ layerDate: string }>(`
    SELECT DISTINCT aggregated_at::date::text AS "layerDate" FROM import_batches
    ORDER BY "layerDate" DESC;
  `);
  return result.rows.map((row) => row.layerDate);
}

export interface PurgeRecentLayersPreview {
  batchCount: number;
  importRowIssueCount: number;
  issueCount: number;
  layerCount: number;
  targetDates: string[];
  totalLayersAvailable: number;
}

async function resolveTargetDates(layerCount: number): Promise<{ availableDates: string[]; targetDates: string[] }> {
  if (!Number.isInteger(layerCount) || layerCount < 1) {
    throw new Error('Số lượng lớp dữ liệu phải là số nguyên lớn hơn 0.');
  }
  const availableDates = await listLayerDatesDescending();
  return { availableDates, targetDates: availableDates.slice(0, layerCount) };
}

/**
 * Previews the deletion (import_batches with their issues and import_row_issues) of the N most
 * recent data layers, so the caller can confirm counts before calling purgeRecentLayers with the same layerCount.
 */
export async function previewPurgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersPreview> {
  const { availableDates, targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) {
    return {
      batchCount: 0, importRowIssueCount: 0, issueCount: 0, layerCount,
      targetDates: [], totalLayersAvailable: availableDates.length,
    };
  }

  const result = await pool.query<{
    batchCount: string; importRowIssueCount: string; issueCount: string;
  }>(`
    WITH target AS (SELECT unnest($1::date[]) AS d),
    target_batches AS (SELECT id FROM import_batches WHERE aggregated_at::date IN (SELECT d FROM target))
    SELECT
      (SELECT COUNT(*) FROM target_batches)::text AS "batchCount",
      (SELECT COUNT(*) FROM issues WHERE source_import_batch_id IN (SELECT id FROM target_batches))::text AS "issueCount",
      (SELECT COUNT(*) FROM import_row_issues WHERE import_batch_id IN (SELECT id FROM target_batches))::text AS "importRowIssueCount";
  `, [targetDates]);

  const row = result.rows[0];
  return {
    batchCount: Number(row.batchCount),
    importRowIssueCount: Number(row.importRowIssueCount),
    issueCount: Number(row.issueCount),
    layerCount,
    targetDates,
    totalLayersAvailable: availableDates.length,
  };
}

export interface PurgeRecentLayersResult {
  layerCount: number;
  targetDates: string[];
}

/**
 * Deletes the import batches of the N most recent data layers; issues / import_row_issues cascade
 * automatically (ON DELETE CASCADE). epic_alert_timeline runs are not date-bound layers and are left alone.
 */
export async function purgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersResult> {
  const { targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) return { layerCount, targetDates: [] };

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM import_batches WHERE aggregated_at::date = ANY($1::date[]);', [targetDates]);
    await client.query('COMMIT');
    return { layerCount, targetDates };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
