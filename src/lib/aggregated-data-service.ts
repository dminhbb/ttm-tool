import pool, { getClient } from '@/lib/db';
import { aggregateBatchData } from '@/lib/import-service';

export interface AggregatedDataLayer {
  batchFileName: string | null;
  batchId: number | null;
  batchStatus: string | null;
  epicAlertHistoryCount: number;
  epicTtmSnapshotCount: number;
  issueDailySnapshotCount: number;
  layerDate: string;
  rawDataAvailable: boolean;
}

/**
 * One row per calendar day that has any aggregated data (epic_ttm_snapshots,
 * issue_daily_snapshots, epic_alert_history), independent of whether the raw import batch for
 * that day still exists — a batch deleted (manually or by retention cleanup) leaves its
 * aggregated layers behind (source_import_batch_id → NULL) since those tables intentionally
 * don't cascade. This is what lets an admin manage the aggregated layers on their own.
 */
export async function listAggregatedDataLayers(): Promise<AggregatedDataLayer[]> {
  const result = await pool.query<{
    batchFileName: string | null; batchId: number | null; batchStatus: string | null;
    epicAlertHistoryCount: string; epicTtmSnapshotCount: string; issueDailySnapshotCount: string;
    layerDate: string; rawDataAvailable: boolean;
  }>(`
    WITH layer_dates AS (
      SELECT DISTINCT aggregated_at::date AS layer_date FROM epic_ttm_snapshots
      UNION
      SELECT DISTINCT aggregated_at::date FROM issue_daily_snapshots
      UNION
      SELECT DISTINCT alert_date FROM epic_alert_history
    )
    SELECT
      d.layer_date::text AS "layerDate",
      COALESCE(t.cnt, 0)::int AS "epicTtmSnapshotCount",
      COALESCE(s.cnt, 0)::int AS "issueDailySnapshotCount",
      COALESCE(h.cnt, 0)::int AS "epicAlertHistoryCount",
      ib.id AS "batchId",
      ib.file_name AS "batchFileName",
      ib.status AS "batchStatus",
      EXISTS(SELECT 1 FROM issues i WHERE i.aggregated_at::date = d.layer_date) AS "rawDataAvailable"
    FROM layer_dates d
    LEFT JOIN (SELECT aggregated_at::date AS d, COUNT(*) AS cnt FROM epic_ttm_snapshots GROUP BY 1) t ON t.d = d.layer_date
    LEFT JOIN (SELECT aggregated_at::date AS d, COUNT(*) AS cnt FROM issue_daily_snapshots GROUP BY 1) s ON s.d = d.layer_date
    LEFT JOIN (SELECT alert_date AS d, COUNT(*) AS cnt FROM epic_alert_history GROUP BY 1) h ON h.d = d.layer_date
    LEFT JOIN LATERAL (
      SELECT b.id, b.file_name, b.status FROM import_batches b
      WHERE b.aggregated_at::date = d.layer_date
      ORDER BY b.aggregated_at DESC, b.id DESC
      LIMIT 1
    ) ib ON true
    ORDER BY d.layer_date DESC;
  `);
  return result.rows.map((row) => ({
    batchFileName: row.batchFileName,
    batchId: row.batchId,
    batchStatus: row.batchStatus,
    epicAlertHistoryCount: Number(row.epicAlertHistoryCount),
    epicTtmSnapshotCount: Number(row.epicTtmSnapshotCount),
    issueDailySnapshotCount: Number(row.issueDailySnapshotCount),
    layerDate: row.layerDate,
    rawDataAvailable: row.rawDataAvailable,
  }));
}

/** Clears only the aggregated layers for one date — raw import_batches/import_rows/issues are untouched. */
export async function deleteAggregatedDataLayer(layerDate: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM epic_ttm_snapshots WHERE aggregated_at::date = $1;', [layerDate]);
    await client.query('DELETE FROM issue_daily_snapshots WHERE aggregated_at::date = $1;', [layerDate]);
    await client.query('DELETE FROM epic_alert_history WHERE alert_date = $1;', [layerDate]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Re-derives the aggregated layers for one date from whatever raw `issues` rows still exist for
 * that date — no CSV re-upload needed. Loops every distinct import batch for the date (normally
 * just one) since aggregateBatchData is scoped per batch_id.
 */
export async function rerunAggregatedDataLayer(layerDate: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const batches = await client.query<{ aggregatedAt: string; id: number }>(
      'SELECT DISTINCT source_import_batch_id AS id, aggregated_at::text AS "aggregatedAt" FROM issues WHERE aggregated_at::date = $1 AND source_import_batch_id IS NOT NULL;',
      [layerDate],
    );
    if (batches.rows.length === 0) {
      throw new Error('Không còn dữ liệu import gốc cho lớp dữ liệu này để chạy lại tổng hợp.');
    }
    for (const batch of batches.rows) {
      await aggregateBatchData(client, batch.id, new Date(batch.aggregatedAt));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
