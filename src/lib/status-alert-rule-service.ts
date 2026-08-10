import pool from '@/lib/db';
import type { StatusAlertRule, StatusAlertRuleInput } from '@/lib/status-alert-rule-types';

const RULE_COLUMNS = `
  id,
  epic_complexity_type AS "epicComplexityType",
  epic_status AS "epicStatus",
  early_alert_offset_days AS "earlyAlertOffsetDays",
  late_alert_offset_days AS "lateAlertOffsetDays",
  fail_offset_days AS "failOffsetDays",
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
      CASE epic_complexity_type WHEN 'SIMPLE' THEN 1 ELSE 2 END,
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

export async function createStatusAlertRule(input: StatusAlertRuleInput): Promise<StatusAlertRule> {
  const result = await pool.query<StatusAlertRule>(`
    INSERT INTO epic_status_alert_rules (
      epic_complexity_type,
      epic_status,
      early_alert_offset_days,
      late_alert_offset_days,
      fail_offset_days,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${RULE_COLUMNS};
  `, [
    input.epicComplexityType,
    input.epicStatus,
    input.earlyAlertOffsetDays,
    input.lateAlertOffsetDays,
    input.failOffsetDays,
    input.isActive,
  ]);
  return result.rows[0];
}

export async function updateStatusAlertRule(id: number, input: StatusAlertRuleInput): Promise<StatusAlertRule | null> {
  const result = await pool.query<StatusAlertRule>(`
    UPDATE epic_status_alert_rules
    SET
      epic_complexity_type = $2,
      epic_status = $3,
      early_alert_offset_days = $4,
      late_alert_offset_days = $5,
      fail_offset_days = $6,
      is_active = $7,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING ${RULE_COLUMNS};
  `, [
    id,
    input.epicComplexityType,
    input.epicStatus,
    input.earlyAlertOffsetDays,
    input.lateAlertOffsetDays,
    input.failOffsetDays,
    input.isActive,
  ]);
  return result.rows[0] ?? null;
}
