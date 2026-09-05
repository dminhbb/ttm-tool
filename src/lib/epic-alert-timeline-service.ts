import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';

export type EpicAlertTimelineType = 'FAIL_TTM_CNTT' | 'LATE_TTM_CNTT' | 'FAIL_TTM_E2E' | 'MISSING_START_DATE' | 'DATA_ANOMALY';

export const EPIC_ALERT_TIMELINE_TYPES: readonly EpicAlertTimelineType[] = ['FAIL_TTM_CNTT', 'LATE_TTM_CNTT', 'FAIL_TTM_E2E', 'MISSING_START_DATE', 'DATA_ANOMALY'];

export type EpicAlertTimelineDetail = Record<string, string | number | null>;

export interface EpicAlertTimelineState {
  active: boolean;
  detail: EpicAlertTimelineDetail | null;
}

/** One evaluated Epic's state for all 4 alert types, as of one import batch's aggregatedAtDate. */
export type EpicAlertTimelineStates = Record<EpicAlertTimelineType, EpicAlertTimelineState>;

export interface EpicAlertTimelineEntry {
  alertType: EpicAlertTimelineType;
  detail: EpicAlertTimelineDetail | null;
  endDate: string | null;
  startDate: string;
}

interface OpenRunRow {
  alertType: EpicAlertTimelineType;
  detail: EpicAlertTimelineDetail | null;
  epicKey: string;
  lastSeenDate: string;
}

/** Builds a "($1,$2,...),($n,...)" VALUES clause and its flat parameter array from row tuples. */
function buildValuesClause(rows: unknown[][]): { clause: string; values: unknown[] } {
  const values: unknown[] = [];
  const clause = rows.map((row) => {
    const placeholders = row.map((_value, columnIndex) => `$${values.length + columnIndex + 1}`).join(', ');
    values.push(...row);
    return `(${placeholders})`;
  }).join(', ');
  return { clause, values };
}

/**
 * Diffs today's evaluated alert states (computed once per import batch, in aggregateBatchData)
 * against each epic's currently OPEN run per alert type (end_date IS NULL) and applies the
 * transition:
 * - active today, no open run yet → open a new run (start_date = last_seen_date = today).
 * - active today, open run exists → just bump last_seen_date/detail on it (start_date untouched).
 * - not active today, open run exists → close it, end_date = the run's own last_seen_date (the
 *   last day it was actually confirmed active — not necessarily "today - 1", since an import day
 *   can be skipped).
 *
 * Everything is batched into at most 3 statements total (1 SELECT + up to 2 multi-row writes)
 * regardless of how many epics are in the batch, matching the "gộp thành 1 câu ghi mỗi import"
 * approach — no per-epic round trip, safe for the hosted (Aiven/Supabase) free-tier connection cap.
 */
export async function recordEpicAlertTimelineTransitions(
  client: Pool | PoolClient,
  aggregatedAtDate: Date,
  statesByEpic: Map<string, EpicAlertTimelineStates>,
  sourceImportBatchId: number | null,
): Promise<void> {
  const epicKeys = [...statesByEpic.keys()];
  if (epicKeys.length === 0) return;
  const today = aggregatedAtDate.toISOString().slice(0, 10);

  const openRuns = await client.query<OpenRunRow>(`
    SELECT epic_key AS "epicKey", alert_type AS "alertType", last_seen_date::text AS "lastSeenDate", detail
    FROM epic_alert_timeline
    WHERE end_date IS NULL AND epic_key = ANY($1::varchar[]);
  `, [epicKeys]);
  const openByKey = new Map<string, OpenRunRow>(openRuns.rows.map((run) => [`${run.epicKey}::${run.alertType}`, run]));

  const toInsert: unknown[][] = [];
  const toContinue: unknown[][] = [];
  const toClose: unknown[][] = [];

  for (const [epicKey, states] of statesByEpic) {
    for (const alertType of EPIC_ALERT_TIMELINE_TYPES) {
      const state = states[alertType];
      const open = openByKey.get(`${epicKey}::${alertType}`);
      if (state.active) {
        if (!open) {
          toInsert.push([epicKey, alertType, today, today, state.detail ? JSON.stringify(state.detail) : null, sourceImportBatchId]);
        } else if (open.lastSeenDate !== today || JSON.stringify(open.detail) !== JSON.stringify(state.detail)) {
          toContinue.push([epicKey, alertType, today, state.detail ? JSON.stringify(state.detail) : null]);
        }
      } else if (open) {
        toClose.push([epicKey, alertType, open.lastSeenDate]);
      }
    }
  }

  if (toInsert.length > 0) {
    const { clause, values } = buildValuesClause(toInsert);
    await client.query(`
      INSERT INTO epic_alert_timeline (epic_key, alert_type, start_date, last_seen_date, detail, source_import_batch_id)
      VALUES ${clause};
    `, values);
  }
  if (toContinue.length > 0) {
    const { clause, values } = buildValuesClause(toContinue);
    await client.query(`
      UPDATE epic_alert_timeline AS t SET
        last_seen_date = v.last_seen_date::date,
        detail = v.detail::jsonb,
        updated_at = NOW()
      FROM (VALUES ${clause}) AS v(epic_key, alert_type, last_seen_date, detail)
      WHERE t.epic_key = v.epic_key::varchar AND t.alert_type = v.alert_type::varchar AND t.end_date IS NULL;
    `, values);
  }
  if (toClose.length > 0) {
    const { clause, values } = buildValuesClause(toClose);
    await client.query(`
      UPDATE epic_alert_timeline AS t SET end_date = v.end_date::date, updated_at = NOW()
      FROM (VALUES ${clause}) AS v(epic_key, alert_type, end_date)
      WHERE t.epic_key = v.epic_key::varchar AND t.alert_type = v.alert_type::varchar AND t.end_date IS NULL;
    `, values);
  }
}

/** Runs touching the visible window: still open, or closed on/after windowStart ("YYYY-MM-DD"). */
export async function listEpicAlertTimelineWindow(epicKey: string, windowStart: string): Promise<EpicAlertTimelineEntry[]> {
  const result = await pool.query<EpicAlertTimelineEntry>(`
    SELECT alert_type AS "alertType", start_date::text AS "startDate", end_date::text AS "endDate", detail
    FROM epic_alert_timeline
    WHERE epic_key = $1 AND (end_date IS NULL OR end_date >= $2::date)
    ORDER BY start_date ASC;
  `, [epicKey, windowStart]);
  return result.rows;
}

/** Lazy-loads runs that closed entirely before `before` ("YYYY-MM-DD") — oldest-first once returned. */
export async function listEpicAlertTimelineOlder(epicKey: string, before: string, limit = 20): Promise<{ entries: EpicAlertTimelineEntry[]; hasMore: boolean }> {
  const result = await pool.query<EpicAlertTimelineEntry>(`
    SELECT alert_type AS "alertType", start_date::text AS "startDate", end_date::text AS "endDate", detail
    FROM epic_alert_timeline
    WHERE epic_key = $1 AND end_date < $2::date
    ORDER BY end_date DESC
    LIMIT $3;
  `, [epicKey, before, limit + 1]);
  const hasMore = result.rows.length > limit;
  const entries = result.rows.slice(0, limit).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return { entries, hasMore };
}
