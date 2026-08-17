import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { diffWorkingDays } from '@/lib/working-days';
import { computeComponentPhaseAlerts, computePhaseAlertLevel, computeTtmPhaseBaselines, epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
import type { TtmPhaseBaseline, TtmPhaseKey } from '@/lib/ttm-phase-rules';
import {
  fetchEpicAlertContext,
  isCancelledStatus,
  missingStandardInfo,
  parseDate,
  resolveTtmActualRange,
  toIsoDate,
} from '@/lib/epic-alert-service';
import { getDesignDoneDatesByEpicKey, getDevDoneDatesByEpicKey, getTestDoneDatesByEpicKey } from '@/lib/epic-milestone-history-service';
import { recordEpicAlertHistory } from '@/lib/epic-alert-history-service';
import type { EpicAlertHistoryPhase } from '@/lib/epic-alert-history-service';
import pool from '@/lib/db';
import type { EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';

const DESIGN_STATUS_INDEX = epicWorkflowStatusIndex('DESIGN');
const R4GOLIVE_STATUS_INDEX = epicWorkflowStatusIndex('R4GOLIVE');

// Temporarily off: recording a LATE phase into epic_alert_history writes on every screen view (up
// to one row per Epic per phase currently LATE), which exhausted Aiven's free-tier connection cap
// even after capping the pool and making the writes sequential (see db.ts / the write-loop below).
// Flip back to true once the target DB's connection budget can absorb it. The write path itself is
// left fully intact — this only skips calling it.
const ALERT_HISTORY_RECORDING_ENABLED = false;

function naPhaseCell(): PhaseCell {
  return { actualDate: null, alertLevel: 'NONE', baselineDate: null, isCurrentStage: false };
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
 * still blocking progress — DESIGN and R4GOLIVE included, since "no basis to record completion
 * yet" (no DESIGN_DONE milestone; R4GOLIVE has none until R4G Date is actually filled in) is
 * itself a valid reason to alert once that phase's own baseline passes. Only which single phase is
 * "hiện tại" (current — resolveCurrentStage) is status-dependent.
 */
function resolvePhaseCells(
  epicStatusIndex: number,
  baselines: Record<TtmPhaseKey, TtmPhaseBaseline>,
  designDoneDate: string | null,
  devDoneDate: string | null,
  testDoneDate: string | null,
  r4gDate: string | null,
  now: Date,
): NonReleaseStages {
  const devDone = devDoneDate !== null;
  const testDone = testDoneDate !== null;
  const currentStage = resolveCurrentStage(epicStatusIndex, devDone, testDone);
  const componentAlerts = computeComponentPhaseAlerts(baselines, devDone, testDone, now);

  const cell = (phase: TtmPhaseKey, actualDate: string | null, alertLevel: AlertLevel): PhaseCell => ({
    actualDate,
    alertLevel: actualDate !== null ? 'NONE' : alertLevel,
    baselineDate: toIsoDate(baselines[phase].date),
    isCurrentStage: currentStage === phase,
  });

  return {
    design: cell('DESIGN', designDoneDate, computePhaseAlertLevel(baselines.DESIGN.date, now, designDoneDate !== null)),
    dev: cell('DEV', devDoneDate, componentAlerts.dev),
    pentest: cell('PENTEST', null, componentAlerts.pentest),
    r4golive: cell('R4GOLIVE', r4gDate, computePhaseAlertLevel(baselines.R4GOLIVE.date, now, r4gDate !== null)),
    test: cell('TEST', testDoneDate, componentAlerts.test),
  };
}

/**
 * "Quản lý Epic 15": same Epic list and access rules as "Quản lý Epic 30" (fetchEpicAlertContext
 * is shared), but the Design/In Progress/Ready4Golive columns are replaced with five phase
 * columns (DESIGN, DEV, TEST, PENTEST, R4GOLIVE) per the phase-division core rule
 * (ttm-phase-rules.ts). Each cell is baseline (top, always computed) + actual (bottom — DESIGN,
 * DEV and TEST have real actual values via epic_milestone_history (DESIGN_DONE/DEV_DONE/TEST_DONE,
 * see epic-milestone-history-service.ts), R4GOLIVE via R4G Date; PENTEST waits on a future upgrade
 * that tracks real per-phase completion dates).
 *
 * As a side effect of being viewed, any Epic whose phase (DESIGN/DEV/TEST/PENTEST/R4GOLIVE) is
 * currently Cảnh báo muộn gets that recorded into epic_alert_history (once per Epic/phase/day —
 * see recordEpicAlertHistory's ON CONFLICT).
 */
export async function getEpicAlertRowsPhased(userId: number, role: UserRole): Promise<EpicAlertPhasedResponse> {
  const [context, designDoneDates, devDoneDates, testDoneDates] = await Promise.all([
    fetchEpicAlertContext(userId, role),
    getDesignDoneDatesByEpicKey(),
    getDevDoneDatesByEpicKey(),
    getTestDoneDatesByEpicKey(),
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
    const ttmE2eStartDate = parseDate(evaluation.ttm.e2e.fromDate);
    const ttmCnttTarget = evaluation.ttm.cntt.workingDays ?? 0;
    const ttmCnttElapsed = ttmCnttStartDate ? Math.max(0, diffWorkingDays(ttmCnttStartDate, now, holidays)) : null;
    const ttmE2eTarget = evaluation.ttm.e2e.workingDays ?? 0;
    const ttmE2eElapsed = ttmE2eStartDate ? Math.max(0, diffWorkingDays(ttmE2eStartDate, now, holidays)) : null;
    const alertLevel = evaluation.alertLevel;
    const targetR4gDate = parseDate(evaluation.ttm.cntt.targetDate ?? row.targetR4gDate);
    const remainingWorkingDays = targetR4gDate ? diffWorkingDays(now, targetR4gDate, holidays) : null;

    const baselines = startDate && ttmCnttTarget ? computeTtmPhaseBaselines(startDate, ttmCnttTarget, holidays) : null;

    // TTM-E2E isn't implemented yet, so Released has no baseline to show — only the actual Due Date.
    const releaseCell: PhaseCell = { actualDate: toIsoDate(parseDate(row.dueDate)), alertLevel: 'NONE', baselineDate: null, isCurrentStage: false };

    const stages = baselines
      ? resolvePhaseCells(
        epicStatusIndex,
        baselines,
        designDoneDates.get(row.epicKey) ?? null,
        devDoneDates.get(row.epicKey) ?? null,
        testDoneDates.get(row.epicKey) ?? null,
        row.r4gDate,
        now,
      )
      : { design: naPhaseCell(), dev: naPhaseCell(), pentest: naPhaseCell(), r4golive: naPhaseCell(), test: naPhaseCell() };

    (['design', 'dev', 'test', 'pentest', 'r4golive'] as const).forEach((key) => {
      if (stages[key].alertLevel === 'LATE') {
        lateAlertsToRecord.push({ epicKey: row.epicKey, phase: key.toUpperCase() as EpicAlertHistoryPhase, status: row.status });
      }
    });

    const ttmActualRange = resolveTtmActualRange(row, now);
    const ttmActualFrom = parseDate(ttmActualRange.fromDate);
    const ttmActualTo = parseDate(ttmActualRange.toDate);
    const ttmActualElapsed = ttmActualFrom && ttmActualTo ? diffWorkingDays(ttmActualFrom, ttmActualTo, holidays) : null;

    rows.push({
      alertLevel,
      currentStatus: row.status,
      dataLayerDate: row.aggregatedAt ?? null,
      domainName: domain,
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
      ttmActualFromDate: ttmActualRange.fromDate,
      ttmActualToDate: ttmActualRange.toDate,
      ttmCnttElapsedWorkingDays: ttmCnttElapsed,
      ttmCnttFromDate: evaluation.ttm.cntt.fromDate,
      ttmCnttFromField: evaluation.ttm.cntt.fromField,
      ttmCnttTargetWorkingDays: ttmCnttTarget,
      ttmCnttToField: evaluation.ttm.cntt.toField,
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
