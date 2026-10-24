import pool, { getClient } from '@/lib/db';

/**
 * A "lớp dữ liệu" (data layer) is one calendar date that has any RAW or milestone data —
 * the union of every date-bearing table in the pipeline, not just import_batches, since the
 * milestone rows survive raw-data cleanup (ON DELETE SET NULL — see data-retention-service.ts)
 * and can therefore have dates the RAW side no longer does.
 */
export async function listLayerDatesDescending(): Promise<string[]> {
  const result = await pool.query<{ layerDate: string }>(`
    SELECT DISTINCT d::text AS "layerDate" FROM (
      SELECT aggregated_at::date AS d FROM import_batches
      UNION SELECT milestone_date FROM epic_milestone_history
    ) all_dates
    ORDER BY "layerDate" DESC;
  `);
  return result.rows.map((row) => row.layerDate);
}

export interface PurgeRecentLayersPreview {
  batchCount: number;
  epicMilestoneHistoryCount: number;
  importRowCount: number;
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
 * Previews the full-stack deletion (RAW: import_batches/import_rows/issues; post-aggregation:
 * epic_milestone_history) for the N most recent data layers, so the caller can confirm counts
 * before calling purgeRecentLayers with the same layerCount.
 */
export async function previewPurgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersPreview> {
  const { availableDates, targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) {
    return {
      batchCount: 0, epicMilestoneHistoryCount: 0,
      importRowCount: 0, issueCount: 0, layerCount,
      targetDates: [], totalLayersAvailable: availableDates.length,
    };
  }

  const result = await pool.query<{
    batchCount: string; epicMilestoneHistoryCount: string;
    importRowCount: string; issueCount: string;
  }>(`
    WITH target AS (SELECT unnest($1::date[]) AS d),
    target_batches AS (SELECT id FROM import_batches WHERE aggregated_at::date IN (SELECT d FROM target))
    SELECT
      (SELECT COUNT(*) FROM target_batches)::text AS "batchCount",
      (SELECT COUNT(*) FROM issues WHERE source_import_batch_id IN (SELECT id FROM target_batches))::text AS "issueCount",
      (SELECT COUNT(*) FROM import_rows WHERE import_batch_id IN (SELECT id FROM target_batches))::text AS "importRowCount",
      (SELECT COUNT(*) FROM epic_milestone_history WHERE milestone_date IN (SELECT d FROM target))::text AS "epicMilestoneHistoryCount";
  `, [targetDates]);

  const row = result.rows[0];
  return {
    batchCount: Number(row.batchCount),
    epicMilestoneHistoryCount: Number(row.epicMilestoneHistoryCount),
    importRowCount: Number(row.importRowCount),
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
 * Deletes RAW and post-aggregation data for the N most recent data layers. import_rows/issues
 * cascade automatically when their import_batches row is deleted (ON DELETE CASCADE);
 * epic_milestone_history is deleted explicitly since its FK to import_batches is ON DELETE SET NULL
 * by design (it normally survives raw-data cleanup — this action is the deliberate exception).
 * epic_alert_timeline runs are not date-bound layers and are left alone.
 */
export async function purgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersResult> {
  const { targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) return { layerCount, targetDates: [] };

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM import_batches WHERE aggregated_at::date = ANY($1::date[]);', [targetDates]);
    await client.query('DELETE FROM epic_milestone_history WHERE milestone_date = ANY($1::date[]);', [targetDates]);
    await client.query('COMMIT');
    return { layerCount, targetDates };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
