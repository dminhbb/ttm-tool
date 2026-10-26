import pool, { getClient } from '@/lib/db';
import { SELECTABLE_RULES } from '@/lib/scoring/registry';
import { DEFAULT_POLICY_SET_KEY } from '@/lib/ttm-policy-types';
import type { TtmPolicy, TtmPolicyInput, TtmPolicySet } from '@/lib/ttm-policy-types';
import { EPIC_COMPLEXITY_TYPES, type EpicComplexityType } from '@/lib/status-alert-rule-types';

const VALID_COMPLEXITY = new Set<string>(EPIC_COMPLEXITY_TYPES);

const POLICY_COLUMNS = `
  id, ttm_type AS "ttmType", epic_complexity_type AS "epicComplexityType",
  from_ttm_field AS "fromTtmField", to_ttm_field AS "toTtmField",
  working_days AS "workingDays", is_active AS "isActive", policy_set AS "policySet",
  created_at::text AS "createdAt", updated_at::text AS "updatedAt"
`;

export async function listTtmPolicies(activeOnly = false): Promise<TtmPolicy[]> {
  const result = await pool.query<TtmPolicy>(`
    SELECT ${POLICY_COLUMNS} FROM ttm_policy_configs
    ${activeOnly ? 'WHERE is_active = TRUE' : ''}
    ORDER BY (policy_set <> '${DEFAULT_POLICY_SET_KEY}'), policy_set, ttm_type, epic_complexity_type;
  `);
  return result.rows;
}

/** Bộ ngân sách with the rule objects that read each one (the code names the set, see TtmCnttVariant.policySet). */
export async function listTtmPolicySets(): Promise<TtmPolicySet[]> {
  const result = await pool.query<Omit<TtmPolicySet, 'usedByRules'>>(`
    SELECT key, name, note, created_at::text AS "createdAt" FROM ttm_policy_sets
    ORDER BY (key <> '${DEFAULT_POLICY_SET_KEY}'), created_at, key;
  `);
  return result.rows.map((row) => ({ ...row, usedByRules: SELECTABLE_RULES.filter((rule) => rule.policySet === row.key).map((rule) => rule.id) }));
}

export interface TtmPolicySetInput { key: string; name: string; note: string | null }

export async function createTtmPolicySet(input: TtmPolicySetInput): Promise<TtmPolicySet> {
  await pool.query('INSERT INTO ttm_policy_sets (key, name, note) VALUES ($1, $2, $3);', [input.key, input.name, input.note]);
  return (await listTtmPolicySets()).find((set) => set.key === input.key)!;
}

/** Deletes a set and its rows — refused for DEFAULT and for a set a rule object in the code still reads. */
export async function deleteTtmPolicySet(key: string): Promise<'deleted' | 'not_found' | 'protected'> {
  if (key === DEFAULT_POLICY_SET_KEY || SELECTABLE_RULES.some((rule) => rule.policySet === key)) return 'protected';
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ttm_policy_configs WHERE policy_set = $1;', [key]);
    const result = await client.query('DELETE FROM ttm_policy_sets WHERE key = $1;', [key]);
    await client.query('COMMIT');
    return result.rowCount === 1 ? 'deleted' : 'not_found';
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTtmPolicy(input: TtmPolicyInput): Promise<TtmPolicy> {
  const result = await pool.query<TtmPolicy>(`
    INSERT INTO ttm_policy_configs (ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active, policy_set)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${POLICY_COLUMNS};
  `, [input.ttmType, input.epicComplexityType, input.fromTtmField, input.toTtmField, input.workingDays, input.isActive, input.policySet]);
  return result.rows[0];
}

export async function updateTtmPolicy(id: number, input: TtmPolicyInput): Promise<TtmPolicy | null> {
  const result = await pool.query<TtmPolicy>(`
    UPDATE ttm_policy_configs SET ttm_type = $2, epic_complexity_type = $3,
      from_ttm_field = $4, to_ttm_field = $5, working_days = $6, is_active = $7, policy_set = $8,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING ${POLICY_COLUMNS};
  `, [id, input.ttmType, input.epicComplexityType, input.fromTtmField, input.toTtmField, input.workingDays, input.isActive, input.policySet]);
  return result.rows[0] ?? null;
}

export async function deleteTtmPolicy(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM ttm_policy_configs WHERE id = $1;', [id]);
  return result.rowCount === 1;
}

export function findActiveTtmPolicy(policies: TtmPolicy[], ttmType: TtmPolicy['ttmType'], complexity: TtmPolicy['epicComplexityType']): TtmPolicy | null {
  // Only the DEFAULT set: other sets hold just the rows that differ, and are read by the Scoring Service itself.
  return policies.find((policy) => policy.isActive && policy.policySet === DEFAULT_POLICY_SET_KEY && policy.ttmType === ttmType && policy.epicComplexityType === complexity) ?? null;
}

/** TTM-CNTT working-day budget for an Epic — resolves the active policy for its complexity, falling
 * back to CT-Lv12's budget when the Epic's own type can't be determined (missing/legacy/invalid).
 * Matches the Scoring Service's own `?? 'CT-Lv12'` default. */
export function resolveTtmCnttWorkingDays(policies: TtmPolicy[], complexity: string | null): number | null {
  const effective: EpicComplexityType = complexity && VALID_COMPLEXITY.has(complexity) ? (complexity as EpicComplexityType) : 'CT-Lv12';
  return findActiveTtmPolicy(policies, 'TTM_CNTT', effective)?.workingDays
    ?? findActiveTtmPolicy(policies, 'TTM_CNTT', 'CT-Lv12')?.workingDays
    ?? null;
}
