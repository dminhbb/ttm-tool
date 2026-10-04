import { BADGE_BY_ID } from './catalog';
import type { BadgeId } from './catalog';
import { PHASE_KEYS } from './derive';
import { badgeCodesOf, indexFlagsOf } from './select';
import type { EpicScorecard, Finding, TtmPhaseKey } from './types';
import type { EpicAlertRowPhased, EpicAnomalyViolation, PhaseCell } from '@/lib/epic-alert-types';

/**
 * Display engine 'scoring' (M4): rewrites the verdict fields of a legacy EpicAlertRowPhased from the
 * Epic's scorecard, so every existing reader — cache columns and SQL filters, TTM-Index, Dashboard,
 * MCP, the Epic screens — shows the Scoring Service's result without learning a new row shape.
 * Non-verdict fields (names, dates, stripes' actual range…) are kept as they are.
 */

const ANOMALY_BADGE_TO_LEGACY: Partial<Record<BadgeId, { code: EpicAnomalyViolation['code']; ruleIndex: number }>> = {
  ANOMALY_R1_MISSING_START_DATE: { code: 'MISSING_START_DATE', ruleIndex: 1 },
  ANOMALY_R3_DATE_OUT_OF_SEQUENCE: { code: 'DATE_OUT_OF_SEQUENCE', ruleIndex: 3 },
  ANOMALY_R4_MISSING_REQUEST_TYPE: { code: 'MISSING_REQUEST_TYPE', ruleIndex: 4 },
  ANOMALY_R5_MISSING_REQUIREMENT_LEVEL: { code: 'MISSING_REQUIREMENT_LEVEL', ruleIndex: 5 },
  ANOMALY_R6_SP_LEVEL_MISMATCH: { code: 'SP_LEVEL_MISMATCH', ruleIndex: 6 },
  ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE: { code: 'R4G_DATE_BEFORE_R4GOLIVE', ruleIndex: 8 },
  ANOMALY_R9_MISSING_R4G_DATE: { code: 'MISSING_R4G_DATE', ruleIndex: 9 },
};

const LEGACY_PHASE_KEY: Record<TtmPhaseKey, 'design' | 'dev' | 'test' | 'pentest' | 'r4golive'> = {
  DESIGN: 'design', DEV: 'dev', TEST: 'test', PENTEST: 'pentest', R4GOLIVE: 'r4golive',
};

/** Legacy verdict fields ignore the "Phạm vi" gate — the screens show "Ngoài phạm vi TTM-CNTT"
 * from ttmCnttInScope instead — so read findings active or hidden only by SCOPE_CNTT_OUT. */
function verdictBadges(findings: readonly Finding[]): Set<BadgeId> {
  return new Set(findings.filter((item) => !item.suppressedBy || item.suppressedBy.every((by) => by === 'SCOPE_CNTT_OUT')).map((item) => item.badge));
}

export function projectScorecardOntoRow(row: EpicAlertRowPhased, card: EpicScorecard): EpicAlertRowPhased {
  const active = card.findings.filter((item) => !item.suppressedBy);
  const activeBadges = new Set(active.map((item) => item.badge));
  const verdicts = verdictBadges(card.findings);
  const phaseHas = (badge: BadgeId, phase: TtmPhaseKey) => active.some((item) => item.badge === badge && item.subject === phase);

  const dataAnomalyViolations: EpicAnomalyViolation[] = active.flatMap((item) => {
    const legacy = ANOMALY_BADGE_TO_LEGACY[item.badge];
    return legacy && BADGE_BY_ID.get(item.badge)?.group === 'ALERT' ? [{ code: legacy.code, ruleIndex: legacy.ruleIndex, message: item.message }] : [];
  });

  const stages = { ...row.stages };
  for (const phase of PHASE_KEYS) {
    const key = LEGACY_PHASE_KEY[phase];
    const derived = card.derived.phases?.[phase];
    const cell: PhaseCell = {
      ...row.stages[key],
      alertLevel: phaseHas('PHASE_LATE', phase) ? 'LATE' : 'NONE',
      isDone: phaseHas('PHASE_DONE', phase),
      isCurrentStage: phaseHas('PHASE_CURRENT', phase),
      baselineDate: derived?.baselineDate ?? null,
    };
    stages[key] = cell;
  }

  return {
    ...row,
    alertLevel: verdicts.has('CNTT_FAIL') ? 'FAIL' : verdicts.has('CNTT_LATE') ? 'LATE' : 'NONE',
    ttmCnttStatusMismatch: verdicts.has('CNTT_STATUS_MISMATCH'),
    ttmE2eAlertLevel: activeBadges.has('E2E_FAIL') ? 'FAIL' : 'NONE',
    releaseAxisState: activeBadges.has('RELEASE_JUSTIFY_GOLIVE') ? 'JUSTIFY_GOLIVE' : activeBadges.has('RELEASE_WAITING_GOLIVE') ? 'WAITING_GOLIVE' : 'NONE',
    releaseGraceDeadline: card.derived.releaseGraceDeadline ?? row.releaseGraceDeadline,
    hasDataAnomaly: dataAnomalyViolations.length > 0,
    dataAnomalyViolations,
    ttmCnttInScope: !activeBadges.has('SCOPE_CNTT_OUT'),
    qaInScope: !activeBadges.has('SCOPE_QA_OUT'),
    targetR4gDate: card.derived.cnttTargetDate ?? row.targetR4gDate,
    remainingWorkingDays: card.derived.cnttRemainingWorkingDays ?? row.remainingWorkingDays,
    stages,
    scoringAsOf: card.asOf,
    scoringBadges: badgeCodesOf(card),
    scoringIndexFlags: indexFlagsOf(card),
    scoringFindings: card.findings,
  };
}

/** Rows without a scorecard (shouldn't happen — same Epic set) are returned unchanged. */
export function projectRows(rows: readonly EpicAlertRowPhased[], cards: ReadonlyMap<string, EpicScorecard>): EpicAlertRowPhased[] {
  return rows.map((row) => {
    const card = cards.get(row.epicKey);
    return card ? projectScorecardOntoRow(row, card) : row;
  });
}
