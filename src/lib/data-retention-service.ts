import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';

export const DEFAULT_RAW_IMPORT_RETENTION_DAYS = 30;
export const MIN_RAW_IMPORT_RETENTION_DAYS = 7;
export const MAX_RAW_IMPORT_RETENTION_DAYS = 3650;

export interface DataRetentionConfig {
  rawImportRetentionDays: number;
}

export function isValidRawImportRetentionDays(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_RAW_IMPORT_RETENTION_DAYS
    && value <= MAX_RAW_IMPORT_RETENTION_DAYS;
}

export async function getDataRetentionConfig(): Promise<DataRetentionConfig> {
  const result = await pool.query<{ rawImportRetentionDays: number }>(
    'SELECT raw_import_retention_days AS "rawImportRetentionDays" FROM data_retention_configs WHERE id = 1;',
  );
  return { rawImportRetentionDays: result.rows[0]?.rawImportRetentionDays ?? DEFAULT_RAW_IMPORT_RETENTION_DAYS };
}

export async function updateDataRetentionConfig(rawImportRetentionDays: number): Promise<DataRetentionConfig> {
  if (!isValidRawImportRetentionDays(rawImportRetentionDays)) {
    throw new Error('INVALID_RETENTION_DAYS');
  }
  const result = await pool.query<{ rawImportRetentionDays: number }>(`
    INSERT INTO data_retention_configs (id, raw_import_retention_days, updated_at)
    VALUES (1, $1, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE
      SET raw_import_retention_days = EXCLUDED.raw_import_retention_days,
          updated_at = CURRENT_TIMESTAMP
    RETURNING raw_import_retention_days AS "rawImportRetentionDays";
  `, [rawImportRetentionDays]);
  return result.rows[0];
}

/**
 * Deletes the import batches older than the configured RAW retention (data_retention_configs); their
 * issues cascade with them (ON DELETE CASCADE) and the alert timeline / cache rows only lose the batch link.
 * The newest data layer and any batch in `extraProtectedBatchIds` (the one being imported) are always kept,
 * so an out-of-order historical import can never remove the data the screens currently use.
 * Runs after every stored import and once a day from the housekeeping job. Returns the batches deleted.
 */
export async function deleteExpiredImportBatches(db: Pick<Pool | PoolClient, 'query'>, extraProtectedBatchIds: readonly number[] = []): Promise<number> {
  const config = await db.query<{ rawImportRetentionDays: number }>(
    'SELECT raw_import_retention_days AS "rawImportRetentionDays" FROM data_retention_configs WHERE id = 1;',
  );
  const retentionDays = config.rows[0]?.rawImportRetentionDays ?? DEFAULT_RAW_IMPORT_RETENTION_DAYS;
  const latest = await db.query<{ id: number }>('SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1;');
  const protectedBatchIds = [...new Set([...extraProtectedBatchIds, latest.rows[0]?.id].filter((id): id is number => typeof id === 'number'))];
  const result = await db.query(
    'DELETE FROM import_batches WHERE aggregated_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL \'1 day\') AND NOT (id = ANY($2::int[]));',
    [retentionDays, protectedBatchIds],
  );
  return result.rowCount ?? 0;
}
