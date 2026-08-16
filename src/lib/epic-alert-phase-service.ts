import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { diffWorkingDays } from '@/lib/working-days';
import { computeTtmPhaseBaselines, epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
import type { TtmPhaseKey } from '@/lib/ttm-phase-rules';
import {
  fetchEpicAlertContext,
  isCancelledStatus,
  missingStandardInfo,
  parseDate,
  toIsoDate,
} from '@/lib/epic-alert-service';
import { getDesignDoneDatesByEpicKey, getDevDoneDatesByEpicKey, getTestDoneDatesByEpicKey } from '@/lib/epic-milestone-history-service';
import type { EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';

// Jira status granularity doesn't distinguish DEV/TEST/PENTEST — all three sit under the single
// "In Progress" Epic status, so they share the same "is this phase already past?" comparison.
const PHASE_COLUMN_STATUS_INDEX: Record<TtmPhaseKey, number> = {
  DESIGN: epicWorkflowStatusIndex('DESIGN'),
  DEV: epicWorkflowStatusIndex('DEV'),
  TEST: epicWorkflowStatusIndex('TEST'),
  PENTEST: epicWorkflowStatusIndex('PENTEST'),
  R4GOLIVE: epicWorkflowStatusIndex('R4GOLIVE'),
};

function naPhaseCell(): PhaseCell {
  return { actualDate: null, baselineDate: null, isPastStatus: false };
}

/**
 * "Quản lý Epic 15": same Epic list and access rules as "Quản lý Epic 30" (fetchEpicAlertContext
 * is shared), but the Design/In Progress/Ready4Golive columns are replaced with five phase
 * columns (DESIGN, DEV, TEST, PENTEST, R4GOLIVE) per the phase-division core rule
 * (ttm-phase-rules.ts). Each cell is baseline (top, always computed) + actual (bottom — DESIGN,
 * DEV and TEST have real actual values via epic_milestone_history (DESIGN_DONE/DEV_DONE/TEST_DONE,
 * see epic-milestone-history-service.ts), R4GOLIVE via R4G Date; PENTEST waits on a future upgrade
 * that tracks real per-phase completion dates).
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
  const { entries, holidays, now } = context;
  const rows: EpicAlertRowPhased[] = [];

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
    const phaseCell = (phase: TtmPhaseKey, actualDate: string | null): PhaseCell => (
      baselines
        ? { actualDate, baselineDate: toIsoDate(baselines[phase].date), isPastStatus: epicStatusIndex > PHASE_COLUMN_STATUS_INDEX[phase] }
        : naPhaseCell()
    );

    // TTM-E2E isn't implemented yet, so Released has no baseline to show — only the actual Due Date.
    const releaseCell: PhaseCell = { actualDate: toIsoDate(parseDate(row.dueDate)), baselineDate: null, isPastStatus: false };

    rows.push({
      alertLevel,
      assigneeName: row.assignee ?? '',
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
      stages: {
        design: phaseCell('DESIGN', designDoneDates.get(row.epicKey) ?? null),
        dev: phaseCell('DEV', devDoneDates.get(row.epicKey) ?? null),
        pentest: phaseCell('PENTEST', null),
        r4golive: phaseCell('R4GOLIVE', row.r4gDate),
        release: releaseCell,
        test: phaseCell('TEST', testDoneDates.get(row.epicKey) ?? null),
      },
      t0IdeaApprovedDate: row.ideaApprovedDate,
      t1StartDate: row.startDate,
      targetR4gDate: toIsoDate(targetR4gDate) ?? row.targetR4gDate,
      ttmCnttElapsedWorkingDays: ttmCnttElapsed,
      ttmCnttFromDate: evaluation.ttm.cntt.fromDate,
      ttmCnttFromField: evaluation.ttm.cntt.fromField,
      ttmCnttTargetWorkingDays: ttmCnttTarget,
      ttmCnttToField: evaluation.ttm.cntt.toField,
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
