import pool from '@/lib/db';
import type { EpicComplexity } from '@/lib/ttm-rules';
import { computeTtmAlert } from '@/lib/ttm-rules';
import { diffWorkingDays } from '@/lib/working-days';
import { getActiveHolidaySet, getDomainByProjectKeyMap } from '@/lib/master-data-service';
import type { EpicMonitoringResponse, MonitoredEpic } from '@/lib/epic-monitoring-types';

const CANCELLED_OR_RELEASED = /cancel|release/i;

interface EpicRow {
  assignee: string | null;
  complexity: EpicComplexity | null;
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  epicType: string | null;
  ideaApprovedDate: string | null;
  project: string | null;
  r4gDate: string | null;
  startDate: string | null;
  status: string;
  targetR4gDate: string | null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function missingStandardInfo(row: EpicRow): string[] {
  const missing: string[] = [];
  if (!row.startDate) missing.push('Start Date');
  if (!row.epicType && !row.complexity) missing.push('Epic Type');
  if (!row.assignee) missing.push('Owner');
  if (!row.ideaApprovedDate) missing.push('T0');
  return missing;
}

export async function getEpicMonitoring(from: string, to: string): Promise<EpicMonitoringResponse> {
  const [result, holidays, domainByProjectKey] = await Promise.all([
    pool.query<EpicRow>(`
    SELECT DISTINCT ON (issues.issue_key)
      issues.issue_key AS "epicKey",
      issues.issue_name AS "epicName",
      issues.current_status AS status,
      issues.epic_complexity_type AS complexity,
      issues.assignee_name AS assignee,
      issues.start_date::text AS "startDate",
      issues.idea_approved_date::text AS "ideaApprovedDate",
      issues.r4g_date::text AS "r4gDate",
      issues.target_r4g_date::text AS "targetR4gDate",
      issues.due_date::text AS "dueDate",
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''), '') AS project,
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'epicType', ''), '') AS "epicType"
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE UPPER(issues.issue_type) = 'EPIC'
      AND issues.aggregated_at BETWEEN $1 AND $2
    ORDER BY issues.issue_key ASC, issues.aggregated_at DESC
    `, [from, to]),
    getActiveHolidaySet(),
    getDomainByProjectKeyMap(),
  ]);

  const now = new Date();
  const panel1: MonitoredEpic[] = [];
  const panel2: MonitoredEpic[] = [];
  const panel3: MonitoredEpic[] = [];

  for (const row of result.rows) {
    const startDate = parseDate(row.startDate);
    const ideaApprovedDate = parseDate(row.ideaApprovedDate);
    const daysSinceT0 = ideaApprovedDate ? diffWorkingDays(ideaApprovedDate, now, holidays) : null;
    const domain = (row.project && domainByProjectKey.get(row.project)) ?? '';

    if (row.status === 'To Do') {
      panel3.push({
        alertLevel: 'NONE',
        assignee: row.assignee ?? '',
        daysRemaining: null,
        daysSinceT0,
        domain,
        dueDate: row.dueDate,
        epicKey: row.epicKey,
        epicName: row.epicName,
        epicType: row.epicType || row.complexity,
        ideaApprovedDate: row.ideaApprovedDate,
        missingStandardInfo: [],
        project: row.project ?? '',
        r4gDate: row.r4gDate,
        startDate: row.startDate,
        status: row.status,
        targetR4gDate: row.targetR4gDate,
      });
      continue;
    }

    if (!startDate && !CANCELLED_OR_RELEASED.test(row.status)) {
      panel2.push({
        alertLevel: 'NONE',
        assignee: row.assignee ?? '',
        daysRemaining: null,
        daysSinceT0,
        domain,
        dueDate: row.dueDate,
        epicKey: row.epicKey,
        epicName: row.epicName,
        epicType: row.epicType || row.complexity,
        ideaApprovedDate: row.ideaApprovedDate,
        missingStandardInfo: missingStandardInfo(row),
        project: row.project ?? '',
        r4gDate: row.r4gDate,
        startDate: row.startDate,
        status: row.status,
        targetR4gDate: row.targetR4gDate,
      });
      continue;
    }

    const alert = computeTtmAlert({
      complexity: row.complexity,
      currentDate: now,
      holidays,
      r4gDate: parseDate(row.r4gDate),
      startDate,
      status: row.status,
      targetR4gDate: parseDate(row.targetR4gDate),
    });

    panel1.push({
      alertLevel: alert.level,
      assignee: row.assignee ?? '',
      daysRemaining: alert.daysRemaining,
      daysSinceT0,
      domain,
      dueDate: row.dueDate,
      epicKey: row.epicKey,
      epicName: row.epicName,
      epicType: row.epicType || row.complexity,
      ideaApprovedDate: row.ideaApprovedDate,
      missingStandardInfo: missingStandardInfo(row),
      project: row.project ?? '',
      r4gDate: row.r4gDate,
      startDate: row.startDate,
      status: row.status,
      targetR4gDate: alert.targetR4gDate ? alert.targetR4gDate.toISOString().slice(0, 10) : row.targetR4gDate,
    });
  }

  const alertRank: Record<string, number> = { FAIL: 0, LATE: 1, EARLY: 2, NONE: 3 };
  panel1.sort((a, b) => {
    const rankDiff = alertRank[a.alertLevel] - alertRank[b.alertLevel];
    if (rankDiff !== 0) return rankDiff;
    if (b.missingStandardInfo.length !== a.missingStandardInfo.length) return b.missingStandardInfo.length - a.missingStandardInfo.length;
    return (a.targetR4gDate ?? '').localeCompare(b.targetR4gDate ?? '');
  });

  panel2.sort((a, b) => {
    if (b.missingStandardInfo.length !== a.missingStandardInfo.length) return b.missingStandardInfo.length - a.missingStandardInfo.length;
    return (b.daysSinceT0 ?? 0) - (a.daysSinceT0 ?? 0);
  });

  panel3.sort((a, b) => (b.daysSinceT0 ?? 0) - (a.daysSinceT0 ?? 0));

  return { from, panel1, panel2, panel3, to };
}
