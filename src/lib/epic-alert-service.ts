import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel, EpicComplexity, OffsetRule } from '@/lib/ttm-rules';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import { addWorkingDays, diffWorkingDays } from '@/lib/working-days';
import type { HolidaySet } from '@/lib/working-days';
import { getActiveHolidaySet, getDomainByProjectKeyMap } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell, StagePillVariant } from '@/lib/epic-alert-types';

const CANCELLED_OR_RELEASED = /cancel|release/i;

const TTM_CNTT_TARGET_DAYS: Record<EpicComplexity, number> = { SIMPLE: 15, COMPLEX: 30 };
const TTM_E2E_TARGET_DAYS: Record<EpicComplexity, number> = { SIMPLE: 30, COMPLEX: 50 };

// Coarse Jira-status progression, used only to decide whether Design/In Progress are already behind us.
// Unrecognized statuses (IN PO, R4GOLIVE, Ready for Golive, Released, ...) are treated as "past In Progress".
const STATUS_STAGE_INDEX: Record<string, number> = { 'To Do': 0, Design: 1, 'In Progress': 2, Pending: 2 };

function stageIndexOf(status: string): number {
  if (status in STATUS_STAGE_INDEX) return STATUS_STAGE_INDEX[status];
  if (CANCELLED_OR_RELEASED.test(status)) return -1;
  return 3;
}

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
  requirementLevel: string | null;
  startDate: string | null;
  status: string;
  targetR4gDate: string | null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function missingStandardInfo(row: EpicRow): string[] {
  const missing: string[] = [];
  if (!row.startDate) missing.push('Start Date');
  if (!row.epicType && !row.complexity) missing.push('Epic Type');
  if (!row.assignee) missing.push('Owner');
  if (!row.ideaApprovedDate) missing.push('T0');
  return missing;
}

async function resolveAccessScope(userId: number, role: UserRole): Promise<{ accessRole: EpicAlertAccessRole; sourceProjectKeys: string[] | null }> {
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

interface StageDates {
  early: Date;
  fail: Date;
  late: Date;
}

function buildStageDates(startDate: Date, rule: OffsetRule, holidays: HolidaySet): StageDates {
  return {
    early: addWorkingDays(startDate, rule.earlyOffset, holidays),
    fail: addWorkingDays(startDate, rule.failOffset, holidays),
    late: addWorkingDays(startDate, rule.lateOffset, holidays),
  };
}

function pillForRemaining(remaining: number): { pillLabel: string; pillVariant: StagePillVariant } {
  if (remaining < 0) return { pillLabel: 'Quá hạn', pillVariant: 'overdue' };
  if (remaining === 0) return { pillLabel: 'Hết hạn hôm nay', pillVariant: 'd1' };
  if (remaining === 1) return { pillLabel: 'Còn 1 ngày', pillVariant: 'd1' };
  if (remaining === 2) return { pillLabel: 'Còn 2 ngày', pillVariant: 'd2' };
  if (remaining === 3) return { pillLabel: 'Còn 3 ngày', pillVariant: 'd3' };
  return { pillLabel: `Còn ${remaining} ngày`, pillVariant: 'upcoming' };
}

/** dd/mm/yyyy, matching the client's formatDate() so plan-label text and formatted cell dates read the same. */
function formatDdMmYyyy(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** The stage the epic is currently moving through: countdown to whichever milestone (early/late/fail) hasn't been reached yet. */
function activeStageCell(now: Date, dates: StageDates, holidays: HolidaySet): StageCell {
  let target: Date;
  let planPrefix: string;
  if (now.getTime() < dates.early.getTime()) { target = dates.early; planPrefix = 'Mốc sớm'; }
  else if (now.getTime() < dates.late.getTime()) { target = dates.late; planPrefix = 'Mốc muộn'; }
  else { target = dates.fail; planPrefix = 'Hạn chót'; }
  const remaining = diffWorkingDays(now, target, holidays);
  const pill = pillForRemaining(remaining);
  return { dateLabel: toIsoDate(target), isCurrentStage: true, planLabel: `${planPrefix}: ${formatDdMmYyyy(target)}`, pillLabel: pill.pillLabel, pillVariant: pill.pillVariant };
}

function doneStageCell(dateLabel?: string | null): StageCell {
  return { dateLabel: dateLabel ?? null, isCurrentStage: false, planLabel: 'Đã hoàn thành giai đoạn', pillLabel: dateLabel ? `✓ ${dateLabel}` : '✓ Hoàn thành', pillVariant: 'done' };
}

function upcomingStageCell(startDate: Date, rule: OffsetRule | null, holidays: HolidaySet): StageCell {
  if (!rule) {
    return { dateLabel: null, isCurrentStage: false, planLabel: 'Chưa cấu hình rule cảnh báo', pillLabel: 'Chưa tới', pillVariant: 'upcoming' };
  }
  const early = addWorkingDays(startDate, rule.earlyOffset, holidays);
  const late = addWorkingDays(startDate, rule.lateOffset, holidays);
  return {
    dateLabel: null,
    isCurrentStage: false,
    planLabel: `Mốc sớm: ${formatDdMmYyyy(early)}, Mốc muộn: ${formatDdMmYyyy(late)}`,
    pillLabel: 'Chưa tới',
    pillVariant: 'upcoming',
  };
}

function naStageCell(reason: string): StageCell {
  return { dateLabel: null, isCurrentStage: false, planLabel: reason, pillLabel: 'Không tính được', pillVariant: 'unknown' };
}

/** Everything on this screen is anchored to the single most recent import batch — no date-range picking. */
export async function getEpicAlertRows(userId: number, role: UserRole): Promise<EpicAlertResponse> {
  const [scope, holidays, domainByProjectKey, statusAlertRules, viewer, latestBatch] = await Promise.all([
    resolveAccessScope(userId, role),
    getActiveHolidaySet(),
    getDomainByProjectKeyMap(),
    listActiveStatusAlertRules(),
    pool.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1', [userId]),
    pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
  ]);

  const latestAggregatedAt = latestBatch.rows[0]?.aggregatedAt ?? null;
  if (!latestAggregatedAt) {
    return { accessRole: scope.accessRole, lastAggregatedAt: null, rows: [], viewerName: viewer.rows[0]?.fullName ?? '' };
  }

  const result = await pool.query<EpicRow & { aggregatedAt: string }>(`
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
      issues.requirement_level AS "requirementLevel",
      issues.aggregated_at::text AS "aggregatedAt",
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''), '') AS project,
      COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'epicType', ''), '') AS "epicType"
    FROM issues
    LEFT JOIN import_rows
      ON import_rows.import_batch_id = issues.source_import_batch_id
      AND import_rows.normalized_data_json::jsonb ->> 'issueKey' = issues.issue_key
    WHERE UPPER(issues.issue_type) = 'EPIC'
      AND issues.aggregated_at = $1
      AND ($2::text[] IS NULL OR COALESCE(NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', ''), '') = ANY($2::text[]))
    ORDER BY issues.issue_key ASC
  `, [latestAggregatedAt, scope.sourceProjectKeys]);

  const now = new Date();
  const rows: EpicAlertRow[] = [];

  for (const row of result.rows) {
    const startDate = parseDate(row.startDate);
    const ideaApprovedDate = parseDate(row.ideaApprovedDate);
    const r4gDateParsed = parseDate(row.r4gDate);
    const complexity: EpicComplexity = row.complexity ?? 'SIMPLE';
    const domain = (row.project && domainByProjectKey.get(row.project)) ?? '';
    const stageIdx = stageIndexOf(row.status);

    const ttmCnttTarget = TTM_CNTT_TARGET_DAYS[complexity];
    const ttmCnttElapsed = startDate ? Math.max(0, diffWorkingDays(startDate, now, holidays)) : null;
    const ttmE2eTarget = TTM_E2E_TARGET_DAYS[complexity];
    const ttmE2eElapsed = ideaApprovedDate ? Math.max(0, diffWorkingDays(ideaApprovedDate, now, holidays)) : null;

    const evaluation = evaluateIssueCompliance({
      dueDate: row.dueDate,
      epicComplexityType: complexity,
      ideaApprovedDate: row.ideaApprovedDate,
      issueKey: row.epicKey,
      issueType: 'EPIC',
      r4gDate: row.r4gDate,
      startDate: row.startDate,
      status: row.status,
    }, now, holidays, statusAlertRules);
    const alertLevel = evaluation.alertLevel;
    const targetR4gDate = parseDate(evaluation.baseline.r4g?.date ?? row.targetR4gDate);
    const remainingWorkingDays = targetR4gDate ? diffWorkingDays(now, targetR4gDate, holidays) : null;
    const designRule = evaluation.baseline.design?.rule ?? null;
    const ipRule = evaluation.baseline.inProgress?.rule ?? null;

    let designCell: StageCell;
    let inProgressCell: StageCell;
    if (!startDate) {
      designCell = naStageCell('Thiếu Start Date');
      inProgressCell = naStageCell('Thiếu Start Date');
    } else if (stageIdx < 1) {
      designCell = upcomingStageCell(startDate, designRule, holidays);
      inProgressCell = upcomingStageCell(startDate, ipRule, holidays);
    } else if (stageIdx === 1) {
      designCell = designRule ? activeStageCell(now, buildStageDates(startDate, designRule, holidays), holidays) : naStageCell('Chưa cấu hình rule');
      inProgressCell = upcomingStageCell(startDate, ipRule, holidays);
    } else if (stageIdx === 2) {
      // Current Jira status is In Progress / Pending — that's authoritative even if R4G Date
      // has already been filled in ahead of the status catching up.
      designCell = doneStageCell();
      inProgressCell = ipRule ? activeStageCell(now, buildStageDates(startDate, ipRule, holidays), holidays) : naStageCell('Chưa cấu hình rule');
    } else {
      // Past In Progress (or cancelled) — engineering stages are behind us either way.
      designCell = doneStageCell();
      inProgressCell = doneStageCell();
    }

    let r4gCell: StageCell;
    if (r4gDateParsed) {
      r4gCell = doneStageCell(toIsoDate(r4gDateParsed) ?? undefined);
    } else if (stageIdx >= 3) {
      r4gCell = naStageCell('Đã qua In Progress nhưng thiếu R4G Date');
    } else if (startDate && targetR4gDate) {
      const remaining = remainingWorkingDays ?? diffWorkingDays(now, targetR4gDate, holidays);
      const pill = pillForRemaining(remaining);
      r4gCell = { dateLabel: toIsoDate(targetR4gDate), isCurrentStage: false, planLabel: `Target: ${formatDdMmYyyy(targetR4gDate)}`, pillLabel: pill.pillLabel, pillVariant: pill.pillVariant };
    } else {
      r4gCell = upcomingStageCell(startDate ?? now, null, holidays);
    }

    const releaseCell: StageCell = row.dueDate
      ? doneStageCell(toIsoDate(parseDate(row.dueDate)) ?? undefined)
      : { dateLabel: null, isCurrentStage: false, planLabel: 'Chưa có Due Date', pillLabel: 'Chưa tới', pillVariant: 'upcoming' };

    rows.push({
      alertLevel,
      currentStatus: row.status,
      domainName: domain,
      epicKey: row.epicKey,
      epicName: row.epicName,
      epicType: complexity,
      missingStandardInfo: missingStandardInfo(row),
      ownerName: row.assignee ?? '',
      projectKey: row.project ?? '',
      r4gDate: row.r4gDate,
      remainingWorkingDays,
      requirementLevel: row.requirementLevel,
      sourceType: 'CSV',
      stages: { design: designCell, inProgress: inProgressCell, r4g: r4gCell, release: releaseCell },
      t0IdeaApprovedDate: row.ideaApprovedDate,
      t1StartDate: row.startDate,
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
    accessRole: scope.accessRole,
    lastAggregatedAt: latestAggregatedAt,
    rows,
    viewerName: viewer.rows[0]?.fullName ?? '',
  };
}
