import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { addWorkingDays, diffWorkingDays } from '@/lib/working-days';
import { computeComponentPhaseAlerts, computePhaseAlertLevel, computeTtmPhaseBaselines, epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
import type { TtmPhaseBaseline, TtmPhaseKey } from '@/lib/ttm-phase-rules';
import {
  fetchEpicAlertContext,
  isCancelledStatus,
  missingStandardInfo,
  parseDate,
  toIsoDate,
} from '@/lib/epic-alert-service';
import { computeEpicPhaseCompletionByEpicKey } from '@/lib/epic-phase-completion-service';
import type { EpicPhaseCompletion } from '@/lib/epic-phase-completion-service';
import { recordEpicAlertHistory } from '@/lib/epic-alert-history-service';
import type { EpicAlertHistoryPhase } from '@/lib/epic-alert-history-service';
import pool from '@/lib/db';
import type { EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';

const RELEASE_BASELINE_SOURCE_LABEL = {
  ideaApproved: 'Idea Approved Date (T0)',
  startDate: 'Start Date',
  jiraCreated: 'Ngày tạo trên Jira',
} as const;

const DESIGN_STATUS_INDEX = epicWorkflowStatusIndex('DESIGN');
const R4GOLIVE_STATUS_INDEX = epicWorkflowStatusIndex('R4GOLIVE');

// Temporarily off: recording a LATE phase into epic_alert_history writes on every screen view (up
// to one row per Epic per phase currently LATE), which exhausted Aiven's free-tier connection cap
// even after capping the pool and making the writes sequential (see db.ts / the write-loop below).
// Flip back to true once the target DB's connection budget can absorb it. The write path itself is
// left fully intact — this only skips calling it.
const ALERT_HISTORY_RECORDING_ENABLED = false;

function naPhaseCell(): PhaseCell {
  return { alertLevel: 'NONE', baselineDate: null, baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false };
}

/**
 * Epic 15's "giai đoạn hiện tại" (current phase) — used only to place the current-stage marker,
 * never to gate a phase's own alert (every phase always alerts off its own baseline, see
 * resolvePhaseCells below): status DESIGN → DESIGN; status R4GOLIVE or past it → R4GOLIVE;
 * otherwise the first of DEV/TEST/PENTEST not yet satisfying its completion rule.
 */
function resolveCurrentStage(epicStatusIndex: number, devDone: boolean, testDone: boolean): TtmPhaseKey {
  if (epicStatusIndex === DESIGN_STATUS_INDEX) return 'DESIGN';
  if (epicStatusIndex >= R4GOLIVE_STATUS_INDEX) return 'R4GOLIVE';
  if (!devDone) return 'DEV';
  if (!testDone) return 'TEST';
  return 'PENTEST';
}

type NonReleaseStages = Omit<EpicAlertRowPhased['stages'], 'release'>;

/**
 * Builds the five Epic 15 phase cells for one Epic. Every phase alerts independently off its own
 * baseline (computePhaseAlertLevel), regardless of Epic status or of whether an earlier phase is
 * still blocking progress — DESIGN and R4GOLIVE included, since not yet being done (per
 * epic-phase-completion-service.ts's live rules) is itself a valid reason to alert once that
 * phase's own baseline passes. Only which single phase is "hiện tại" (current —
 * resolveCurrentStage) is status-dependent.
 */
function resolvePhaseCells(
  epicStatusIndex: number,
  baselines: Record<TtmPhaseKey, TtmPhaseBaseline>,
  completion: EpicPhaseCompletion,
  now: Date,
): NonReleaseStages {
  const currentStage = resolveCurrentStage(epicStatusIndex, completion.devDone, completion.testDone);
  const componentAlerts = computeComponentPhaseAlerts(baselines, completion.devDone, completion.testDone, now);

  const cell = (phase: TtmPhaseKey, isDone: boolean, alertLevel: AlertLevel): PhaseCell => ({
    alertLevel: isDone ? 'NONE' : alertLevel,
    baselineDate: toIsoDate(baselines[phase].date),
    baselineSourceDate: null,
    baselineSourceLabel: null,
    isCurrentStage: currentStage === phase,
    isDone,
  });

  return {
    design: cell('DESIGN', completion.designDone, computePhaseAlertLevel(baselines.DESIGN.date, now, completion.designDone)),
    dev: cell('DEV', completion.devDone, componentAlerts.dev),
    pentest: cell('PENTEST', false, componentAlerts.pentest),
    r4golive: cell('R4GOLIVE', completion.r4goliveDone, computePhaseAlertLevel(baselines.R4GOLIVE.date, now, completion.r4goliveDone)),
    test: cell('TEST', completion.testDone, componentAlerts.test),
  };
}

/**
 * "Quản trị Epic": same Epic list and access rules as "Quản lý Epic 30" (fetchEpicAlertContext is
 * shared), but the Design/In Progress/Ready4Golive columns are replaced with five phase columns
 * (DESIGN, DEV, TEST, PENTEST, R4GOLIVE) per the phase-division core rule (ttm-phase-rules.ts).
 * Each cell carries a baseline (always computed) and an `isDone` flag evaluated live from current
 * story/subtask statuses every request (see epic-phase-completion-service.ts) — completion dates
 * are no longer recorded. PENTEST still has no completion rule, per its own comment below. How
 * baseline/isDone actually render is the frontend's concern (epic-alerts-15/page.tsx).
 *
 * As a side effect of being viewed, any Epic whose phase (DESIGN/DEV/TEST/PENTEST/R4GOLIVE) is
 * currently Cảnh báo muộn gets that recorded into epic_alert_history (once per Epic/phase/day —
 * see recordEpicAlertHistory's ON CONFLICT).
 */
export async function getEpicAlertRowsPhased(userId: number, role: UserRole): Promise<EpicAlertPhasedResponse> {
  const [context, phaseCompletionByEpicKey] = await Promise.all([
    fetchEpicAlertContext(userId, role),
    computeEpicPhaseCompletionByEpicKey(),
  ]);
  if (!context.lastAggregatedAt) {
    return { accessRole: context.accessRole, lastAggregatedAt: null, rows: [], viewerName: context.viewerName };
  }
  const { entries, holidays, lastBatchId, now } = context;
  const rows: EpicAlertRowPhased[] = [];
  const lateAlertsToRecord: { epicKey: string; phase: EpicAlertHistoryPhase; status: string }[] = [];

  for (const { complexity, domain, epicStatusIndex, evaluation, hasAlertHistory, pmSmName, projectName, row, startDate } of entries) {
    // This screen never shows Cancelled epics (core logic: Cancelled/Pending are special
    // statuses outside the sequential workflow).
    if (isCancelledStatus(row.status)) continue;

    const ttmCnttStartDate = parseDate(evaluation.ttm.cntt.fromDate);
    const ttmCnttTarget = evaluation.ttm.cntt.workingDays ?? 0;
    const ttmCnttElapsed = ttmCnttStartDate ? Math.max(0, diffWorkingDays(ttmCnttStartDate, now, holidays)) : null;
    const ttmE2eTarget = evaluation.ttm.e2e.workingDays ?? 0;
    const alertLevel = evaluation.alertLevel;

    const baselines = startDate && ttmCnttTarget ? computeTtmPhaseBaselines(startDate, ttmCnttTarget, holidays) : null;

    // TTM-CNTT's own end date is defined to always equal R4GOLIVE's phase baseline (per
    // computeTtmPhaseBaselines' sequential/floor-rounded walk), not an independently-computed
    // addWorkingDays(from, totalWorkingDays) — those two can disagree once per-phase rounding
    // enters the picture. Only fall back to the independent calc when there's no Start Date to
    // walk the phases from.
    const targetR4gDate = baselines ? baselines.R4GOLIVE.date : parseDate(evaluation.ttm.cntt.targetDate ?? row.targetR4gDate);
    const remainingWorkingDays = targetR4gDate ? diffWorkingDays(now, targetR4gDate, holidays) : null;

    const completion = phaseCompletionByEpicKey.get(row.epicKey) ?? {
      designDone: false, devDone: false, r4goliveDone: false, releasedDone: false, testDone: false,
    };

    const stages = baselines
      ? resolvePhaseCells(epicStatusIndex, baselines, completion, now)
      : { design: naPhaseCell(), dev: naPhaseCell(), pentest: naPhaseCell(), r4golive: naPhaseCell(), test: naPhaseCell() };

    // Released baseline: T0 = Idea Approved Date if present; else Start Date if present; else the
    // Epic's Jira creation date (always present, so every Epic resolves a T0) — + TTM-E2E's own
    // working-day budget (ttmE2eTarget, from the active TTM_E2E policy for this Epic's complexity,
    // configured in "Cấu hình cảnh báo"), excluding weekends and the app's configured holiday
    // calendar.
    const ideaApprovedDate = parseDate(row.ideaApprovedDate);
    const [releaseBaseDate, releaseBaseSourceLabel] = ideaApprovedDate
      ? [ideaApprovedDate, RELEASE_BASELINE_SOURCE_LABEL.ideaApproved]
      : startDate
        ? [startDate, RELEASE_BASELINE_SOURCE_LABEL.startDate]
        : [parseDate(row.jiraCreatedAt), RELEASE_BASELINE_SOURCE_LABEL.jiraCreated];
    const releaseBaselineDate = releaseBaseDate && ttmE2eTarget ? addWorkingDays(releaseBaseDate, ttmE2eTarget, holidays) : null;
    const releaseCell: PhaseCell = {
      alertLevel: 'NONE',
      baselineDate: toIsoDate(releaseBaselineDate),
      baselineSourceDate: releaseBaseDate ? toIsoDate(releaseBaseDate) : null,
      baselineSourceLabel: releaseBaseDate ? releaseBaseSourceLabel : null,
      isCurrentStage: false,
      isDone: completion.releasedDone,
    };

    (['design', 'dev', 'test', 'pentest', 'r4golive'] as const).forEach((key) => {
      if (stages[key].alertLevel === 'LATE') {
        lateAlertsToRecord.push({ epicKey: row.epicKey, phase: key.toUpperCase() as EpicAlertHistoryPhase, status: row.status });
      }
    });

    // TTM-CNTT stripe "thực tế" (bottom): same start as the baseline stripe (Start Date) — ends at
    // R4G Date once recorded, else today (Epic still ongoing). This screen's own rule, distinct from
    // the shared resolveTtmActualRange used by the legacy "Quản lý Epic 30" screen (which factors in
    // Due Date / T0 for a different column layout).
    const ttmActualToDate = (row.r4gDate && parseDate(row.r4gDate)) || now;
    const ttmActualElapsed = startDate ? Math.max(0, diffWorkingDays(startDate, ttmActualToDate, holidays)) : null;

    // TTM-E2E stripe "thực tế" (bottom): same start as its baseline stripe (T0, releaseBaseDate) —
    // ends at Due Date once recorded, else today.
    const ttmE2eActualToDate = (row.dueDate && parseDate(row.dueDate)) || now;
    const ttmE2eElapsed = releaseBaseDate ? Math.max(0, diffWorkingDays(releaseBaseDate, ttmE2eActualToDate, holidays)) : null;

    rows.push({
      alertLevel,
      components: row.components,
      currentStatus: row.status,
      dataLayerDate: row.aggregatedAt ?? null,
      domainName: domain,
      dueDate: row.dueDate,
      epicKey: row.epicKey,
      epicName: row.epicName,
      epicType: complexity,
      hasAlertHistory,
      // "Thiếu T0" isn't shown on this screen — Idea Approved Date isn't part of Epic 15's scope.
      missingStandardInfo: missingStandardInfo(row).filter((item) => item !== 'T0'),
      // PM/SM of the Epic's project (projects.lead_name) — not the raw Jira assignee.
      ownerName: pmSmName,
      projectKey: row.project ?? '',
      projectName: projectName || row.project || '',
      r4gDate: row.r4gDate,
      remainingWorkingDays,
      requirementLevel: row.requirementLevel,
      sourceType: 'CSV',
      stages: { ...stages, release: releaseCell },
      t0IdeaApprovedDate: row.ideaApprovedDate,
      t1StartDate: row.startDate,
      targetR4gDate: toIsoDate(targetR4gDate) ?? row.targetR4gDate,
      ttmActualElapsedWorkingDays: ttmActualElapsed,
      ttmActualFromDate: toIsoDate(startDate),
      ttmActualToDate: toIsoDate(ttmActualToDate),
      ttmCnttElapsedWorkingDays: ttmCnttElapsed,
      ttmCnttFromDate: evaluation.ttm.cntt.fromDate,
      ttmCnttFromField: evaluation.ttm.cntt.fromField,
      ttmCnttTargetWorkingDays: ttmCnttTarget,
      ttmCnttToField: evaluation.ttm.cntt.toField,
      ttmE2eActualToDate: toIsoDate(ttmE2eActualToDate),
      ttmE2eElapsedWorkingDays: ttmE2eElapsed,
      ttmE2eTargetWorkingDays: ttmE2eTarget,
    });
  }

  // Sequential, not Promise.all: this can be dozens of INSERTs per page view (one per Epic/phase
  // currently LATE) — firing them all at once can exhaust a connection-constrained target (e.g.
  // Aiven's free tier) well before the read queries above even get a chance to release theirs.
  if (ALERT_HISTORY_RECORDING_ENABLED) {
    for (const { epicKey, phase, status } of lateAlertsToRecord) {
      await recordEpicAlertHistory(pool, epicKey, 'LATE', `${status} - ${phase}`, now, lastBatchId, phase);
    }
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
