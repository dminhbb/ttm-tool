import 'server-only';
import pool, { getClient } from '@/lib/db';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import type { EpicFieldChange, EpicFieldChangeField } from '@/lib/epic-field-changes';

/**
 * "Epic thay đổi dữ liệu" (owner 2026-11-11) — derived cache `epic_field_changes` (migration 20261126).
 *
 * refreshEpicFieldChanges(): ONE statement over the Epic rows of `issues` (~60k rows, ~0.3 s measured 2026-11-10): each
 * version is compared with the Epic's previous version (LAG over aggregated_at) on Start date, R4G Date, Requirement Level
 * and "Loại yêu cầu"; only "có → trống" and "có → giá trị khác" are kept (blank, "None", "NULL" = trống). The table is
 * replaced as a whole, in one transaction, by refreshDerivedCaches — the screen never runs the window query itself.
 */

/** Blank, "None" (Jira's empty value) or "NULL" → NULL; anything else trimmed. */
const NORM = (expr: string) => `CASE WHEN ${expr} IS NULL OR TRIM(${expr}) = '' OR LOWER(TRIM(${expr})) IN ('none', 'null') THEN NULL ELSE TRIM(${expr}) END`;

const REFRESH_SQL = `
  WITH v AS (
    SELECT issue_key, aggregated_at,
      start_date::text AS start_date, r4g_date::text AS r4g_date,
      ${NORM('requirement_level')} AS requirement_level, ${NORM('request_type')} AS request_type,
      LAG(start_date::text) OVER w AS p_start_date, LAG(r4g_date::text) OVER w AS p_r4g_date,
      LAG(${NORM('requirement_level')}) OVER w AS p_requirement_level, LAG(${NORM('request_type')}) OVER w AS p_request_type,
      FIRST_VALUE(jira_created_at::date) OVER (PARTITION BY issue_key ORDER BY aggregated_at DESC) AS created_date
    FROM issues
    WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    WINDOW w AS (PARTITION BY issue_key ORDER BY aggregated_at)
  )
  INSERT INTO epic_field_changes (epic_key, layer_at, field, old_value, new_value, epic_created_date)
  SELECT v.issue_key, v.aggregated_at, f.field, f.old_value, f.new_value, v.created_date
  FROM v
  CROSS JOIN LATERAL (VALUES
    ('START_DATE', v.p_start_date, v.start_date),
    ('R4G_DATE', v.p_r4g_date, v.r4g_date),
    ('REQUIREMENT_LEVEL', v.p_requirement_level, v.requirement_level),
    ('REQUEST_TYPE', v.p_request_type, v.request_type)
  ) AS f(field, old_value, new_value)
  WHERE f.old_value IS NOT NULL AND f.old_value IS DISTINCT FROM f.new_value
  ON CONFLICT (epic_key, layer_at, field) DO NOTHING
`;

/** Rebuilds the whole table (called by refreshDerivedCaches). Returns the number of changes stored. */
export async function refreshEpicFieldChanges(): Promise<number> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM epic_field_changes');
    const inserted = await client.query(REFRESH_SQL);
    await client.query('COMMIT');
    return inserted.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The stored changes of one field (the section's filter) of the Epics created on/after `createdFrom` (YYYY-MM-DD), per
 * Epic, oldest change first. */
export async function loadEpicFieldChanges(createdFrom: string, field: EpicFieldChangeField): Promise<Map<string, EpicFieldChange[]>> {
  const result = await pool.query<{ epicKey: string; layerAt: string; field: EpicFieldChangeField; oldValue: string; newValue: string | null }>(`
    -- The data layer's date as every screen reads it (aggregated_at::date, see listSelectableLayerDates).
    SELECT epic_key AS "epicKey", layer_at::date::text AS "layerAt", field, old_value AS "oldValue", new_value AS "newValue"
    FROM epic_field_changes
    WHERE epic_created_date >= $1::date AND field = $2
    ORDER BY epic_key, layer_at
  `, [createdFrom, field]);
  const map = new Map<string, EpicFieldChange[]>();
  for (const row of result.rows) {
    const list = map.get(row.epicKey) ?? [];
    list.push({ field: row.field, layerAt: row.layerAt, newValue: row.newValue, oldValue: row.oldValue });
    map.set(row.epicKey, list);
  }
  return map;
}
