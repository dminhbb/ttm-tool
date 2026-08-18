import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel, EpicComplexity, OffsetRule } from '@/lib/ttm-rules';
import { resolveOffsetRule } from '@/lib/ttm-rules';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import { addWorkingDays, diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { getActiveHolidaySet, getDomainByProjectKeyMap, getProjectMetaByProjectKeyMap } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import { getEpicKeysWithAlertHistory } from '@/lib/epic-alert-history-service';
import { EPIC_WORKFLOW_STATUS_ORDER, epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
import { isCancelledStatus, isPendingStatus } from '@/lib/issue-status-rules';
import { EPIC_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell } from '@/lib/epic-alert-types';


// Canonical Epic workflow order (core logic — an Epic moves through these statuses strictly in
// order). "R4G Date" on the Epic is the completion date of R4GOLIVE. Statuses that don't match
// anything here sort after everything — same "already past" convention.
export const STATUS_ORDER = EPIC_WORKFLOW_STATUS_ORDER;

export function statusOrderIndex(status: string): number {
  return epicWorkflowStatusIndex(status);
}

// Cancelled/Pending (core logic, shared across Epic/Story/Subtask) — see issue-status-rules.ts.
export { isCancelledStatus, isPendingStatus };

export interface EpicRow {
  aggregatedAt: string;
  assignee: string | null;
  complexity: EpicComplexity | null;
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  epicType: string | null;
  ideaApprovedDate: string | null;
  /** issues.jira_created_at — when the Epic was created in the source Jira system, distinct from startDate (T1). */
  jiraCreatedAt: string | null;
  project: string | null;
  r4gDate: string | null;
  requirementLevel: string | null;
  startDate: string | null;
  status: string;
  targetR4gDate: string | null;
}

export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function missingStandardInfo(row: EpicRow): string[] {
  const missing: string[] = [];
  if (!row.startDate) missing.push('Start Date');
  if (!row.epicType && !row.complexity) missing.push('Epic Type');
  if (!row.ideaApprovedDate) missing.push('T0');
  return missing;
}

export interface TtmActualRange {
  fromDate: string | null;
  toDate: string | null;
}

/**
 * Range the "stripe thực tế" (actual, bottom strip) of the TTM-CNTT column draws for, per the
 * core rule: Due Date wins over R4G Date whenever both are present.
 * - Due Date present, no T0 (Idea Approved Date) → Start Date → Due Date.
 * - Due Date present, T0 present → T0 → Due Date.
 * - No Due Date, R4G Date present → Start Date → R4G Date.
 * - Neither present → Start Date → today (the Epic is still ongoing, no completion date yet).
 */
export function resolveTtmActualRange(
  row: Pick<EpicRow, 'dueDate' | 'ideaApprovedDate' | 'r4gDate' | 'startDate'>,
  now: Date,
): TtmActualRange {
  if (row.dueDate) return { fromDate: row.ideaApprovedDate ?? row.startDate, toDate: row.dueDate };
  if (row.r4gDate) return { fromDate: row.startDate, toDate: row.r4gDate };
  return { fromDate: row.startDate, toDate: toIsoDate(now) };
}

export async function resolveAccessScope(userId: number, role: UserRole): Promise<{ accessRole: EpicAlertAccessRole; sourceProjectKeys: string[] | null }> {
  if (role === 'SUPERADMIN') return { accessRole: 'CBQL_PHONG', sourceProjectKeys: null };
  if (role === 'ADMIN') {
    const result = await pool.query<{ sourceProjectKey: string }>(`
      SELECT DISTINCT p.source_project_key AS "sourceProjectKey"
      FROM projects p
      JOIN user_domains ud ON ud.domain_id = p.domain_id
      WHERE ud.user_id = $1 AND p.is_active;
    `, [userId]);
    return { accessRole: 'LEAD', sourceProjectKeys: result.rows.map((row) => row.sourceProjectKey) };
  }
  const result = await pool.query<{ sourceProjectKey: string }>(`
    SELECT p.source_project_key AS "sourceProjectKey"
    FROM projects p
    JOIN user_projects up ON up.project_id = p.id
    WHERE up.user_id = $1 AND p.is_active;
  `, [userId]);
  return { accessRole: 'PM_SM', sourceProjectKeys: result.rows.map((row) => row.sourceProjectKey) };
}

/** dd/mm/yyyy, matching the client's formatDate() so plan-label text and formatted cell dates read the same. */
function formatDdMmYyyy(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function doneStageCell(dateLabel?: string | null): StageCell {
  return { dateLabel: dateLabel ?? null, isCurrentStage: false, planLabel: 'Đã hoàn thành giai đoạn', pillLabel: dateLabel ? `✓ ${dateLabel}` : '✓ Hoàn thành', pillVariant: 'done' };
}

function naStageCell(reason: string): StageCell {
  return { dateLabel: null, isCurrentStage: false, planLabel: reason, pillLabel: 'Không tính được', pillVariant: 'unknown' };
}

/**
 * Renders a single status-column cell for an Epic, per BRD 03 §4 (rules TTM-CNTT-1…6):
 * target = T1 + late-alert offset configured for that column's status. Comparison is against
 * where the Epic's *current* Jira status sits in STATUS_ORDER relative to the column's status —
 * not against whether a downstream date field (e.g. R4G Date) happens to be filled in already.
 *
 * - Epic already past this status (TTM-CNTT-6, extended to any today): "done" — icon, or the
 *   actual completion date when the caller has one (only R4GOLIVE has this, via R4G Date).
 * - Epic hasn't reached this status yet (TTM-CNTT-1, extended past the early milestone): shows
 *   the target date, labelled "Target" before the early milestone and "Past target" after it.
 * - Epic is currently in this status (TTM-CNTT-2…5): "Target" date text while today is before the
 *   late milestone, "Cảnh báo sớm" exactly on the early milestone, "Cảnh báo muộn" on/after late.
 */
function statusStageCell(
  columnIndex: number,
  epicIndex: number,
  startDate: Date,
  now: Date,
  holidays: HolidaySet,
  rule: OffsetRule | null,
  actualDoneDate?: string | null,
): StageCell {
  if (!rule) return naStageCell('Chưa cấu hình rule cảnh báo');

  const early = addWorkingDays(startDate, rule.earlyOffset, holidays);
  const target = addWorkingDays(startDate, rule.lateOffset, holidays);

  if (epicIndex > columnIndex) {
    return doneStageCell(actualDoneDate ?? undefined);
  }

  if (epicIndex < columnIndex) {
    const pastEarly = diffWorkingDays(now, early, holidays) <= 0;
    return {
      dateLabel: toIsoDate(target),
      isCurrentStage: false,
      planLabel: `${pastEarly ? 'Past target' : 'Target'}: ${formatDdMmYyyy(target)}`,
      pillLabel: 'Chưa tới',
      pillVariant: 'upcoming',
    };
  }

  if (diffWorkingDays(now, early, holidays) === 0) {
    return { dateLabel: null, isCurrentStage: true, planLabel: 'Cảnh báo sớm', pillLabel: 'Cảnh báo sớm', pillVariant: 'earlyAlert' };
  }
  if (diffWorkingDays(now, target, holidays) <= 0) {
    return { dateLabel: null, isCurrentStage: true, planLabel: 'Cảnh báo muộn', pillLabel: 'Cảnh báo muộn', pillVariant: 'lateAlert' };
  }
  return { dateLabel: toIsoDate(target), isCurrentStage: true, planLabel: `Target: ${formatDdMmYyyy(target)}`, pillLabel: '', pillVariant: 'upcoming' };
}

export interface EvaluatedEpicEntry {
  complexity: EpicComplexity;
  domain: string;
  epicStatusIndex: number;
  evaluation: ReturnType<typeof evaluateIssueCompliance>;
  hasAlertHistory: boolean;
  pmSmName: string;
  projectName: string;
  row: EpicRow;
  startDate: Date | null;
}

export interface EpicAlertContext {
  accessRole: EpicAlertAccessRole;
  entries: EvaluatedEpicEntry[];
  holidays: HolidaySet;
  lastAggregatedAt: string | null;
  /** import_batches.id of the latest batch — attached to any alert history row recorded off this context. */
  lastBatchId: number | null;
  now: Date;
  statusAlertRules: Awaited<ReturnType<typeof listActiveStatusAlertRules>>;
  viewerName: string;
}

/**
 * Shared fetch used by every Epic Alerts screen ("Quản lý Epic 30", "Quản lý Epic 15", …):
 * resolves access scope, reads each Epic's latest known `issues` row (daily imports are
 * incremental, so no single batch is a complete snapshot — DISTINCT ON + aggregated_at DESC
 * picks up the most recent data per Epic regardless of which day it was last touched), evaluates
 * TTM compliance once per Epic, and applies the shared Released-epic visibility rule. Screens
 * differ only in how they turn `entries` into stage cells.
 */
export async function fetchEpicAlertContext(userId: number, role: UserRole): Promise<EpicAlertContext> {
  const [scope, holidays, domainByProjectKey, projectMetaByProjectKey, statusAlertRules, ttmPolicies, epicKeysWithAlertHistory, viewer, latestBatch] = await Promise.all([
    resolveAccessScope(userId, role),
    getActiveHolidaySet(),
    getDomainByProjectKeyMap(),
    getProjectMetaByProjectKeyMap(),
    listActiveStatusAlertRules(),
    listTtmPolicies(true),
    getEpicKeysWithAlertHistory(),
    pool.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1', [userId]),
    pool.query<{ aggregatedAt: string; id: number }>('SELECT id, aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
  ]);

  const viewerName = viewer.rows[0]?.fullName ?? '';
  const latestAggregatedAt = latestBatch.rows[0]?.aggregatedAt ?? null;
  const lastBatchId = latestBatch.rows[0]?.id ?? null;
  const now = new Date();
  if (!latestAggregatedAt) {
    return { accessRole: scope.accessRole, entries: [], holidays, lastAggregatedAt: null, lastBatchId: null, now, statusAlertRules, viewerName };
  }

  const result = await pool.query<EpicRow>(`
    SELECT DISTINCT ON (issues.issue_key)
      issues.issue_key AS "epicKey",
      issues.issue_name AS "epicName",
      issues.current_status AS status,
      issues.epic_complexity_type AS complexity,
      issues.assignee_name AS assignee,
      issues.start_date::text AS "startDate",
      issues.idea_approved_date::text AS "ideaApprovedDate",
      issues.jira_created_at::text AS "jiraCreatedAt",
      issues.r4g_date::text AS "r4gDate",
      issues.target_r4g_date::text AS "targetR4gDate",
      issues.due_date::text AS "dueDate",
      issues.requirement_level AS "requirementLevel",
      issues.aggregated_at::text AS "aggregatedAt",
      COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) AS project,
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'epicType', ''), '') AS "epicType"
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE UPPER(issues.issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
      AND ($1::text[] IS NULL OR COALESCE(
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''),
        NULLIF(SPLIT_PART(issues.issue_key, '-', 1), ''),
        ''
      ) = ANY($1::text[]))
    ORDER BY issues.issue_key ASC, issues.aggregated_at DESC
  `, [scope.sourceProjectKeys]);

  const releasedStatusIndex = statusOrderIndex('Released');
  const entries: EvaluatedEpicEntry[] = [];

  for (const row of result.rows) {
    const hasAlertHistory = epicKeysWithAlertHistory.has(row.epicKey);
    const epicStatusIndex = statusOrderIndex(row.status);
    // Default visibility rule: Released epics only stay on the list if they were ever flagged
    // Cảnh báo muộn/Fail TTM in their accumulated alert history; everything else always shows.
    if (epicStatusIndex === releasedStatusIndex && !hasAlertHistory) continue;

    const startDate = parseDate(row.startDate);
    const complexity: EpicComplexity = row.complexity ?? 'SIMPLE';
    const domain = (row.project && domainByProjectKey.get(row.project)) ?? '';
    const projectMeta = row.project ? projectMetaByProjectKey.get(row.project) : undefined;
    const pmSmName = projectMeta?.leadName ?? '';
    const projectName = projectMeta?.projectName ?? '';

    const evaluation = evaluateIssueCompliance({
      dueDate: row.dueDate,
      epicComplexityType: complexity,
      ideaApprovedDate: row.ideaApprovedDate,
      issueKey: row.epicKey,
      issueType: 'EPIC',
      r4gDate: row.r4gDate,
      startDate: row.startDate,
      status: row.status,
    }, now, holidays, statusAlertRules, ttmPolicies);

    entries.push({ complexity, domain, epicStatusIndex, evaluation, hasAlertHistory, pmSmName, projectName, row, startDate });
  }

  return { accessRole: scope.accessRole, entries, holidays, lastAggregatedAt: latestAggregatedAt, lastBatchId, now, statusAlertRules, viewerName };
}

/**
 * Daily imports are incremental — a given import batch only contains issues whose `updated`
 * field falls on that day, so no single batch is a complete snapshot. Each Epic therefore uses
 * its own latest known row from the accumulated `issues` history (`DISTINCT ON` + `aggregated_at
 * DESC`), not a shared "latest batch" filter — an Epic untouched today still shows its most
 * recent known data instead of disappearing from the list.
 */
export async function getEpicAlertRows(userId: number, role: UserRole): Promise<EpicAlertResponse> {
  const context = await fetchEpicAlertContext(userId, role);
  if (!context.lastAggregatedAt) {
    return { accessRole: context.accessRole, lastAggregatedAt: null, rows: [], viewerName: context.viewerName };
  }
  const { entries, holidays, now, statusAlertRules } = context;
  const rows: EpicAlertRow[] = [];

  for (const { complexity, domain, epicStatusIndex, evaluation, hasAlertHistory, row, startDate } of entries) {
    const ttmCnttStartDate = parseDate(evaluation.ttm.cntt.fromDate);
    const ttmE2eStartDate = parseDate(evaluation.ttm.e2e.fromDate);
    const ttmCnttTarget = evaluation.ttm.cntt.workingDays ?? 0;
    const ttmCnttElapsed = ttmCnttStartDate ? Math.max(0, diffWorkingDays(ttmCnttStartDate, now, holidays)) : null;
    const ttmE2eTarget = evaluation.ttm.e2e.workingDays ?? 0;
    const ttmE2eElapsed = ttmE2eStartDate ? Math.max(0, diffWorkingDays(ttmE2eStartDate, now, holidays)) : null;
    const alertLevel = evaluation.alertLevel;
    const targetR4gDate = parseDate(evaluation.ttm.cntt.targetDate ?? row.targetR4gDate);
    const remainingWorkingDays = targetR4gDate ? diffWorkingDays(now, targetR4gDate, holidays) : null;
    const designRule = resolveOffsetRule(complexity, 'Design', statusAlertRules);
    const ipRule = resolveOffsetRule(complexity, 'In Progress', statusAlertRules);
    const r4gRule = resolveOffsetRule(complexity, 'R4GOLIVE', statusAlertRules);

    let designCell: StageCell;
    let inProgressCell: StageCell;
    let r4gCell: StageCell;
    if (!startDate) {
      designCell = naStageCell('Thiếu Start Date');
      inProgressCell = naStageCell('Thiếu Start Date');
      r4gCell = naStageCell('Thiếu Start Date');
    } else {
      designCell = statusStageCell(statusOrderIndex('Design'), epicStatusIndex, startDate, now, holidays, designRule);
      inProgressCell = statusStageCell(statusOrderIndex('DEV'), epicStatusIndex, startDate, now, holidays, ipRule);
      r4gCell = statusStageCell(statusOrderIndex('R4GOLIVE'), epicStatusIndex, startDate, now, holidays, r4gRule, row.r4gDate);
    }

    const releaseCell: StageCell = row.dueDate
      ? doneStageCell(toIsoDate(parseDate(row.dueDate)) ?? undefined)
      : { dateLabel: null, isCurrentStage: false, planLabel: 'Chưa có Due Date', pillLabel: 'Chưa tới', pillVariant: 'upcoming' };

    const ttmActualRange = resolveTtmActualRange(row, now);
    const ttmActualFrom = parseDate(ttmActualRange.fromDate);
    const ttmActualTo = parseDate(ttmActualRange.toDate);
    const ttmActualElapsed = ttmActualFrom && ttmActualTo ? diffWorkingDays(ttmActualFrom, ttmActualTo, holidays) : null;

    rows.push({
      alertLevel,
      currentStatus: row.status,
      domainName: domain,
      epicKey: row.epicKey,
      epicName: row.epicName,
      epicType: complexity,
      hasAlertHistory,
      missingStandardInfo: missingStandardInfo(row),
      projectKey: row.project ?? '',
      r4gDate: row.r4gDate,
      remainingWorkingDays,
      requirementLevel: row.requirementLevel,
      sourceType: 'CSV',
      stages: { design: designCell, inProgress: inProgressCell, r4g: r4gCell, release: releaseCell },
      t0IdeaApprovedDate: row.ideaApprovedDate,
      t1StartDate: row.startDate,
      ttmActualElapsedWorkingDays: ttmActualElapsed,
      ttmActualFromDate: ttmActualRange.fromDate,
      ttmActualToDate: ttmActualRange.toDate,
      ttmCnttFromDate: evaluation.ttm.cntt.fromDate,
      ttmCnttFromField: evaluation.ttm.cntt.fromField,
      ttmCnttToField: evaluation.ttm.cntt.toField,
      targetR4gDate: toIsoDate(targetR4gDate) ?? row.targetR4gDate,
      ttmCnttElapsedWorkingDays: ttmCnttElapsed,
      ttmCnttTargetWorkingDays: ttmCnttTarget,
      ttmE2eElapsedWorkingDays: ttmE2eElapsed,
      ttmE2eTargetWorkingDays: ttmE2eTarget,
    });
  }

  const alertRank: Record<AlertLevel, number> = { FAIL: 0, LATE: 1, EARLY: 2, NONE: 3 };
  rows.sort((a, b) => {
    const rankDiff = alertRank[a.alertLevel] - alertRank[b.alertLevel];
    if (rankDiff !== 0) return rankDiff;
    return (a.remainingWorkingDays ?? Infinity) - (b.remainingWorkingDays ?? Infinity);
  });

  return {
    accessRole: context.accessRole,
    lastAggregatedAt: context.lastAggregatedAt,
    rows,
    viewerName: context.viewerName,
  };
}
