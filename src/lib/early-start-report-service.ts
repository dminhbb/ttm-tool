import pool from '@/lib/db';
import type { AccessScope } from '@/lib/epic-alert-service';
import { buildAccessScopeClause } from '@/lib/epic-alert-row-cache-query-service';
import { buildEarlyStartReport, type EarlyStartReport, type EarlyStartReportRow } from '@/lib/early-start-report';

/** row_data keys "Báo cáo Epic start sớm" reads — the rest of each cached row never leaves the database. */
const EARLY_START_ROW_KEYS: readonly (keyof EarlyStartReportRow)[] = [
  'alertLevel', 'currentStatus', 'dataLayerDate', 'domainName', 'dueDate', 'epicKey', 'epicName', 'hasDataAnomaly',
  'ownerName', 'projectKey', 'r4gDate', 'ruleGroupName', 'scoringEarlyStart', 'scoringIndexFlags', 't0IdeaApprovedDate',
  't1StartDate', 'ttmBlackListed', 'ttmCnttInScope', 'ttmExclusion',
];

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04): read straight from epic_alert_row_cache — the newest data layer, as
 * scored by the Scoring Service (rule "Start sớm") — within the viewer's report scope (same as "Báo cáo Epic").
 */
export async function getEarlyStartReport(scope: AccessScope): Promise<EarlyStartReport> {
  const params: unknown[] = [];
  const accessClause = buildAccessScopeClause(scope, params);
  const fieldsSql = EARLY_START_ROW_KEYS.map((key) => `'${key}', row_data->'${key}'`).join(', ');
  const [rows, meta] = await Promise.all([
    pool.query<{ row: EarlyStartReportRow }>(`SELECT jsonb_build_object(${fieldsSql}) AS row FROM epic_alert_row_cache WHERE ${accessClause};`, params),
    pool.query<{ computedAt: string | null }>('SELECT MAX(computed_at)::text AS "computedAt" FROM epic_alert_row_cache;'),
  ]);
  return buildEarlyStartReport(rows.rows.map((item) => item.row), meta.rows[0]?.computedAt ?? null);
}
