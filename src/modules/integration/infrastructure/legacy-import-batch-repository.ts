import 'server-only';

import pool from '@/lib/db';

/** Compatibility read until import_batches is owned physically by the Integration schema. */
export async function getLatestImportAggregatedAt(): Promise<string | null> {
  const result = await pool.query<{ aggregatedAt: string }>(
    'SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;',
  );
  return result.rows[0]?.aggregatedAt ?? null;
}
