import pool from '@/lib/db';
import type { TtmScopeConfig } from '@/lib/ttm-scope-rules';

export type { TtmScopeConfig } from '@/lib/ttm-scope-rules';
export { computeQaInScope, computeTtmCnttInScope } from '@/lib/ttm-scope-rules';

export interface TtmScopeConfigWithMeta extends TtmScopeConfig {
  updatedAt: string | null;
  updatedByName: string | null;
}

const DEFAULT_CONFIG: TtmScopeConfig = { cnttFrom: null, cnttTo: null, qaFrom: null, qaTo: null };

/** Server-only (uses `pool`) — see ttm-scope-rules.ts for the client-safe pure gate functions. */
export async function getTtmScopeConfig(): Promise<TtmScopeConfig> {
  const result = await pool.query<TtmScopeConfig>(`
    SELECT cntt_from::text AS "cnttFrom", cntt_to::text AS "cnttTo", qa_from::text AS "qaFrom", qa_to::text AS "qaTo"
    FROM ttm_scope_config WHERE id = 1;
  `);
  return result.rows[0] ?? DEFAULT_CONFIG;
}

export async function getTtmScopeConfigWithMeta(): Promise<TtmScopeConfigWithMeta> {
  const result = await pool.query<TtmScopeConfigWithMeta>(`
    SELECT
      c.cntt_from::text AS "cnttFrom", c.cntt_to::text AS "cnttTo", c.qa_from::text AS "qaFrom", c.qa_to::text AS "qaTo",
      c.updated_at::text AS "updatedAt", u.full_name AS "updatedByName"
    FROM ttm_scope_config c
    LEFT JOIN users u ON u.id = c.updated_by_user_id
    WHERE c.id = 1;
  `);
  return result.rows[0] ?? { ...DEFAULT_CONFIG, updatedAt: null, updatedByName: null };
}

export async function saveTtmScopeConfig(input: TtmScopeConfig, updatedByUserId: number): Promise<void> {
  await pool.query(
    `
    INSERT INTO ttm_scope_config (id, cntt_from, cntt_to, qa_from, qa_to, updated_by_user_id, updated_at)
    VALUES (1, $1, $2, $3, $4, $5, NOW())
    ON CONFLICT (id) DO UPDATE SET
      cntt_from = EXCLUDED.cntt_from,
      cntt_to = EXCLUDED.cntt_to,
      qa_from = EXCLUDED.qa_from,
      qa_to = EXCLUDED.qa_to,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW();
    `,
    [input.cnttFrom, input.cnttTo, input.qaFrom, input.qaTo, updatedByUserId],
  );
}
