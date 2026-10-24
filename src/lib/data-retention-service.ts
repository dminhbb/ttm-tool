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
