import pool from '@/lib/db';
import { lateOffsetDays } from '@/lib/scoring/derive';
import type { StatusAlertRule, StatusAlertRuleInput } from '@/lib/status-alert-rule-types';

const RULE_COLUMNS = `
  id,
  epic_complexity_type AS "epicComplexityType",
  epic_status AS "epicStatus",
  early_alert_offset_days AS "earlyAlertOffsetDays",
  late_alert_offset_days AS "lateAlertOffsetDays",
  late_alert_percent::float8 AS "lateAlertPercent",
  is_active AS "isActive",
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`;

/** Returns alert rules in a deterministic display and evaluation order. */
export async function listStatusAlertRules(): Promise<StatusAlertRule[]> {
  const result = await pool.query<StatusAlertRule>(`
    SELECT ${RULE_COLUMNS}
    FROM epic_status_alert_rules
    ORDER BY
      CASE epic_complexity_type
        WHEN 'CT-Lv12' THEN 1 WHEN 'CT-Lv34' THEN 2 WHEN 'SP-Lv12' THEN 3 WHEN 'SP-Lv34' THEN 4
        ELSE 5
      END,
      CASE epic_status WHEN 'Design' THEN 1 ELSE 2 END;
  `);
  return result.rows;
}

/** Loads only enabled rules for a single monitoring refresh, avoiding per-Epic queries. */
export async function listActiveStatusAlertRules(): Promise<StatusAlertRule[]> {
  const result = await pool.query<StatusAlertRule>(`
    SELECT ${RULE_COLUMNS}
    FROM epic_status_alert_rules
    WHERE is_active = TRUE;
  `);
  return result.rows;
}

/** Working days the percent means at the DEFAULT TTM-CNTT budget of the Epic type (kept in late_alert_offset_days). */
export async function approximateLateOffsetDays(complexity: string, percent: number): Promise<number> {
  const result = await pool.query<{ workingDays: number }>(`
    SELECT working_days AS "workingDays" FROM ttm_policy_configs
    WHERE policy_set = 'DEFAULT' AND ttm_type = 'TTM_CNTT' AND is_active AND epic_complexity_type = $1;
  `, [complexity]);
  const budget = result.rows[0]?.workingDays;
  return budget ? lateOffsetDays(percent, budget) : 0;
}

export async function createStatusAlertRule(input: StatusAlertRuleInput): Promise<StatusAlertRule> {
  const lateDays = await approximateLateOffsetDays(input.epicComplexityType, input.lateAlertPercent);
  const result = await pool.query<StatusAlertRule>(`
    INSERT INTO epic_status_alert_rules (
      epic_complexity_type,
      epic_status,
      early_alert_offset_days,
      late_alert_offset_days,
      late_alert_percent,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${RULE_COLUMNS};
  `, [
    input.epicComplexityType,
    input.epicStatus,
    input.earlyAlertOffsetDays,
    lateDays,
    input.lateAlertPercent,
    input.isActive,
  ]);
  return result.rows[0];
}

export async function updateStatusAlertRule(id: number, input: StatusAlertRuleInput): Promise<StatusAlertRule | null> {
  const lateDays = await approximateLateOffsetDays(input.epicComplexityType, input.lateAlertPercent);
  const result = await pool.query<StatusAlertRule>(`
    UPDATE epic_status_alert_rules
    SET
      epic_complexity_type = $2,
      epic_status = $3,
      early_alert_offset_days = $4,
      late_alert_offset_days = $5,
      late_alert_percent = $6,
      is_active = $7,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING ${RULE_COLUMNS};
  `, [
    id,
    input.epicComplexityType,
    input.epicStatus,
    input.earlyAlertOffsetDays,
    lateDays,
    input.lateAlertPercent,
    input.isActive,
  ]);
  return result.rows[0] ?? null;
}

export async function deleteStatusAlertRule(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM epic_status_alert_rules WHERE id = $1;', [id]);
  return result.rowCount === 1;
}
