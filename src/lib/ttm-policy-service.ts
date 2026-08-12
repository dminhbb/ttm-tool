import pool from '@/lib/db';
import type { TtmPolicy, TtmPolicyInput } from '@/lib/ttm-policy-types';

const POLICY_COLUMNS = `
  id, ttm_type AS "ttmType", epic_complexity_type AS "epicComplexityType",
  from_ttm_field AS "fromTtmField", to_ttm_field AS "toTtmField",
  working_days AS "workingDays", is_active AS "isActive",
  created_at::text AS "createdAt", updated_at::text AS "updatedAt"
`;

export async function listTtmPolicies(activeOnly = false): Promise<TtmPolicy[]> {
  const result = await pool.query<TtmPolicy>(`
    SELECT ${POLICY_COLUMNS} FROM ttm_policy_configs
    ${activeOnly ? 'WHERE is_active = TRUE' : ''}
    ORDER BY ttm_type, epic_complexity_type;
  `);
  return result.rows;
}

export async function createTtmPolicy(input: TtmPolicyInput): Promise<TtmPolicy> {
  const result = await pool.query<TtmPolicy>(`
    INSERT INTO ttm_policy_configs (ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${POLICY_COLUMNS};
  `, [input.ttmType, input.epicComplexityType, input.fromTtmField, input.toTtmField, input.workingDays, input.isActive]);
  return result.rows[0];
}

export async function updateTtmPolicy(id: number, input: TtmPolicyInput): Promise<TtmPolicy | null> {
  const result = await pool.query<TtmPolicy>(`
    UPDATE ttm_policy_configs SET ttm_type = $2, epic_complexity_type = $3,
      from_ttm_field = $4, to_ttm_field = $5, working_days = $6, is_active = $7,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING ${POLICY_COLUMNS};
  `, [id, input.ttmType, input.epicComplexityType, input.fromTtmField, input.toTtmField, input.workingDays, input.isActive]);
  return result.rows[0] ?? null;
}

export async function deleteTtmPolicy(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM ttm_policy_configs WHERE id = $1;', [id]);
  return result.rowCount === 1;
}

export function findActiveTtmPolicy(policies: TtmPolicy[], ttmType: TtmPolicy['ttmType'], complexity: TtmPolicy['epicComplexityType']): TtmPolicy | null {
  return policies.find((policy) => policy.isActive && policy.ttmType === ttmType && policy.epicComplexityType === complexity) ?? null;
}
