import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';
import type { EpicAnomalyCode, EpicAnomalyViolation } from '@/lib/epic-data-anomaly';
import { buildValuesClause } from '@/lib/epic-alert-timeline-service';

/**
 * Current-state persistence for "Epic bị sai lệch dữ liệu" (see epic-data-anomaly.ts for the rule
 * engine) — one row per (epic_key, rule_code) currently violated, refreshed on every
 * aggregateBatchData() run (import-service.ts). Unlike epic_alert_timeline (which tracks continuous
 * "runs" with start/end dates for the alert-history UI), this table only ever holds the latest
 * evaluated state: a rule that stops applying to an Epic has its row deleted, not closed. This is
 * what lets rule-level stats be a plain `GROUP BY rule_code` query instead of parsing the joined
 * message string epic_alert_timeline's single DATA_ANOMALY run stores.
 */
export interface EpicDataAnomalyRuleStat {
  epicCount: number;
  ruleCode: EpicAnomalyCode;
  ruleIndex: number;
}

/**
 * Upserts one row per currently-violated rule for every epic in `violationsByEpic`, then deletes
 * any previously-stored row for those same epics whose rule is no longer violated. Batched into at
 * most 2 statements total regardless of epic count — same connection-cap reasoning as
 * recordEpicAlertTimelineTransitions (Aiven/Supabase free-tier connection cap).
 */
export async function recordEpicDataAnomalyViolations(
  client: Pool | PoolClient,
  detectedAtDate: Date,
  violationsByEpic: Map<string, EpicAnomalyViolation[]>,
  sourceImportBatchId: number | null,
): Promise<void> {
  const epicKeys = [...violationsByEpic.keys()];
  if (epicKeys.length === 0) return;
  const detectedAt = detectedAtDate.toISOString().slice(0, 10);

  const toUpsert: unknown[][] = [];
  const keptKeys: string[] = [];
  for (const [epicKey, violations] of violationsByEpic) {
    for (const violation of violations) {
      toUpsert.push([epicKey, violation.code, violation.ruleIndex, violation.message, detectedAt, sourceImportBatchId]);
      keptKeys.push(`${epicKey}::${violation.code}`);
    }
  }

  if (toUpsert.length > 0) {
    const { clause, values } = buildValuesClause(toUpsert);
    await client.query(`
      INSERT INTO epic_data_anomaly_violations (epic_key, rule_code, rule_index, message, detected_at, source_import_batch_id)
      VALUES ${clause}
      ON CONFLICT (epic_key, rule_code) DO UPDATE SET
        rule_index = EXCLUDED.rule_index,
        message = EXCLUDED.message,
        detected_at = EXCLUDED.detected_at,
        source_import_batch_id = EXCLUDED.source_import_batch_id,
        updated_at = NOW();
    `, values);
  }

  // Drop rows for epics evaluated this batch whose rule is no longer violated.
  await client.query(`
    DELETE FROM epic_data_anomaly_violations
    WHERE epic_key = ANY($1::varchar[])
      AND NOT (epic_key || '::' || rule_code = ANY($2::text[]));
  `, [epicKeys, keptKeys]);
}

/** Epic count currently breaking each rule — the "thống kê theo từng nhóm rule" query. */
export async function getEpicDataAnomalyRuleStats(): Promise<EpicDataAnomalyRuleStat[]> {
  const result = await pool.query<EpicDataAnomalyRuleStat>(`
    SELECT rule_code AS "ruleCode", rule_index AS "ruleIndex", COUNT(DISTINCT epic_key)::int AS "epicCount"
    FROM epic_data_anomaly_violations
    GROUP BY rule_code, rule_index
    ORDER BY rule_index ASC;
  `);
  return result.rows;
}

/** All rules currently violated by one Epic — used by Epic detail/history views if needed. */
export async function getEpicDataAnomalyViolations(epicKey: string): Promise<EpicAnomalyViolation[]> {
  const result = await pool.query<EpicAnomalyViolation>(`
    SELECT rule_code AS "code", rule_index AS "ruleIndex", message
    FROM epic_data_anomaly_violations
    WHERE epic_key = $1
    ORDER BY rule_index ASC;
  `, [epicKey]);
  return result.rows;
}
