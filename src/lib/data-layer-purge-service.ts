import pool, { getClient } from '@/lib/db';

/**
 * A "lớp dữ liệu" (data layer) is one calendar date that has any RAW, aggregated, or
 * post-aggregation data — the union of every date-bearing table in the pipeline, not just
 * import_batches, since aggregated/milestone rows intentionally survive raw-data cleanup
 * (ON DELETE SET NULL — see data-retention-service.ts) and can therefore have dates the RAW side
 * no longer does.
 */
async function listLayerDatesDescending(): Promise<string[]> {
  const result = await pool.query<{ layerDate: string }>(`
    SELECT DISTINCT d::text AS "layerDate" FROM (
      SELECT aggregated_at::date AS d FROM import_batches
      UNION SELECT aggregated_at::date FROM epic_ttm_snapshots
      UNION SELECT aggregated_at::date FROM issue_daily_snapshots
      UNION SELECT alert_date FROM epic_alert_history
      UNION SELECT milestone_date FROM epic_milestone_history
    ) all_dates
    ORDER BY "layerDate" DESC;
  `);
  return result.rows.map((row) => row.layerDate);
}

export interface PurgeRecentLayersPreview {
  batchCount: number;
  epicAlertHistoryCount: number;
  epicMilestoneHistoryCount: number;
  epicTtmSnapshotCount: number;
  importRowCount: number;
  issueCount: number;
  issueDailySnapshotCount: number;
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
 * Previews the full-stack deletion (RAW: import_batches/import_rows/issues; aggregated layer:
 * epic_ttm_snapshots/issue_daily_snapshots/epic_alert_history; post-aggregation:
 * epic_milestone_history) for the N most recent data layers, so the caller can confirm counts
 * before calling purgeRecentLayers with the same layerCount.
 */
export async function previewPurgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersPreview> {
  const { availableDates, targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) {
    return {
      batchCount: 0, epicAlertHistoryCount: 0, epicMilestoneHistoryCount: 0, epicTtmSnapshotCount: 0,
      importRowCount: 0, issueCount: 0, issueDailySnapshotCount: 0, layerCount,
      targetDates: [], totalLayersAvailable: availableDates.length,
    };
  }

  const result = await pool.query<{
    batchCount: string; epicAlertHistoryCount: string; epicMilestoneHistoryCount: string;
    epicTtmSnapshotCount: string; importRowCount: string; issueCount: string; issueDailySnapshotCount: string;
  }>(`
    WITH target AS (SELECT unnest($1::date[]) AS d),
    target_batches AS (SELECT id FROM import_batches WHERE aggregated_at::date IN (SELECT d FROM target))
    SELECT
      (SELECT COUNT(*) FROM target_batches)::text AS "batchCount",
      (SELECT COUNT(*) FROM issues WHERE source_import_batch_id IN (SELECT id FROM target_batches))::text AS "issueCount",
      (SELECT COUNT(*) FROM import_rows WHERE import_batch_id IN (SELECT id FROM target_batches))::text AS "importRowCount",
      (SELECT COUNT(*) FROM epic_ttm_snapshots WHERE aggregated_at::date IN (SELECT d FROM target))::text AS "epicTtmSnapshotCount",
      (SELECT COUNT(*) FROM issue_daily_snapshots WHERE aggregated_at::date IN (SELECT d FROM target))::text AS "issueDailySnapshotCount",
      (SELECT COUNT(*) FROM epic_alert_history WHERE alert_date IN (SELECT d FROM target))::text AS "epicAlertHistoryCount",
      (SELECT COUNT(*) FROM epic_milestone_history WHERE milestone_date IN (SELECT d FROM target))::text AS "epicMilestoneHistoryCount";
  `, [targetDates]);

  const row = result.rows[0];
  return {
    batchCount: Number(row.batchCount),
    epicAlertHistoryCount: Number(row.epicAlertHistoryCount),
    epicMilestoneHistoryCount: Number(row.epicMilestoneHistoryCount),
    epicTtmSnapshotCount: Number(row.epicTtmSnapshotCount),
    importRowCount: Number(row.importRowCount),
    issueCount: Number(row.issueCount),
    issueDailySnapshotCount: Number(row.issueDailySnapshotCount),
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
 * Deletes RAW, aggregated-layer, and post-aggregation data for the N most recent data layers.
 * import_rows/issues cascade automatically when their import_batches row is deleted (ON DELETE
 * CASCADE); epic_ttm_snapshots/issue_daily_snapshots/epic_alert_history/epic_milestone_history are
 * deleted explicitly since their FK to import_batches is ON DELETE SET NULL by design (they
 * normally survive raw-data cleanup — this action is the deliberate exception).
 */
export async function purgeRecentLayers(layerCount: number): Promise<PurgeRecentLayersResult> {
  const { targetDates } = await resolveTargetDates(layerCount);
  if (targetDates.length === 0) return { layerCount, targetDates: [] };

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM import_batches WHERE aggregated_at::date = ANY($1::date[]);', [targetDates]);
    await client.query('DELETE FROM epic_ttm_snapshots WHERE aggregated_at::date = ANY($1::date[]);', [targetDates]);
    await client.query('DELETE FROM issue_daily_snapshots WHERE aggregated_at::date = ANY($1::date[]);', [targetDates]);
    await client.query('DELETE FROM epic_alert_history WHERE alert_date = ANY($1::date[]);', [targetDates]);
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
