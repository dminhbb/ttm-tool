import pool from '@/lib/db';
import type { AnomalyScopeConfig } from '@/lib/scoring/parameters';
import { DEFAULT_ANOMALY_SCOPE_CONFIG } from '@/lib/scoring/parameters';

export interface AnomalyScopeConfigWithMeta {
  config: AnomalyScopeConfig;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function getAnomalyScopeConfigWithMeta(): Promise<AnomalyScopeConfigWithMeta> {
  const result = await pool.query<{
    value: unknown;
    updatedAt: string | null;
    updatedByName: string | null;
  }>(`
    SELECT
      p.value,
      p.updated_at::text AS "updatedAt",
      u.full_name AS "updatedByName"
    FROM scoring_parameters p
    LEFT JOIN users u ON u.id = p.updated_by_user_id
    WHERE p.param_key = 'anomaly.scopeConfig';
  `);
  if (!result.rows[0]) {
    return { config: DEFAULT_ANOMALY_SCOPE_CONFIG, updatedAt: null, updatedByName: null };
  }
  const row = result.rows[0];
  const value = (typeof row.value === 'object' && row.value !== null)
    ? (row.value as AnomalyScopeConfig)
    : DEFAULT_ANOMALY_SCOPE_CONFIG;
  return {
    config: {
      enabled: Boolean(value.enabled),
      rules: typeof value.rules === 'object' && value.rules !== null ? value.rules : {},
    },
    updatedAt: row.updatedAt,
    updatedByName: row.updatedByName,
  };
}

export async function saveAnomalyScopeConfig(config: AnomalyScopeConfig, userId: number): Promise<void> {
  await pool.query(
    `
    INSERT INTO scoring_parameters (param_key, value, updated_at, updated_by_user_id)
    VALUES ('anomaly.scopeConfig', $1::jsonb, NOW(), $2)
    ON CONFLICT (param_key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = NOW(),
      updated_by_user_id = EXCLUDED.updated_by_user_id;
    `,
    [JSON.stringify(config), userId],
  );
}
