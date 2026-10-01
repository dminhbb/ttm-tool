import { addWorkingDays } from './dates';
import { normalizeWorkflowStatus } from './derive';
import { hasDataAnomalyBadge } from './score-epic';
import type { BadgeId } from './catalog';
import type { EpicScorecard, Finding, ScoringContext, TtmPhaseKey } from './types';

/**
 * Parallel-run check: compares a scorecard against the legacy engine's row for the same Epic and
 * sorts every difference into either an INTENTIONAL tag (a decision the owner approved on
 * 2026-09-29) or UNEXPLAINED. Only used while both engines run side by side.
 */

type LegacyAlertLevel = 'NONE' | 'EARLY' | 'LATE' | 'FAIL';

export interface LegacyPhaseCell {
  alertLevel: LegacyAlertLevel;
  isCurrentStage: boolean;
  isDone: boolean;
}

/** The subset of EpicAlertRowPhased the comparison needs. */
export interface LegacyRowSnapshot {
  epicKey: string;
  currentStatus: string;
  alertLevel: LegacyAlertLevel;
  ttmE2eAlertLevel: LegacyAlertLevel;
  ttmCnttStatusMismatch: boolean;
  releaseAxisState: 'NONE' | 'WAITING_GOLIVE' | 'EARLY_WARNING' | 'JUSTIFY_GOLIVE';
  dataAnomalyViolations: { code: string }[];
  hasDataAnomaly: boolean;
  ttmCnttInScope: boolean;
  qaInScope: boolean;
  r4gDate: string | null;
  ttmActualToDate: string | null;
  ttmE2eActualToDate: string | null;
  stages: Record<'design' | 'dev' | 'test' | 'pentest' | 'r4golive', LegacyPhaseCell>;
}

export type ParityTag =
  | 'D1_INDEX_PASS'
  | 'D3_PHASE_AS_OF'
  | 'D4_EARLY_REMOVED'
  | 'D5_TARGET_N_MINUS_1'
  | 'D7_WAITING_GOLIVE_REDEFINED'
  | 'R2_R7_NOT_ANOMALY'
  | 'LEGACY_TIME_OF_DAY'
  | 'CANCELLED_NOT_APPLICABLE'
  | 'UNEXPLAINED';

export interface ParityDiff {
  check: string;
  legacy: string;
  scoring: string;
  tag: ParityTag;
}

export interface ParityOptions {
  /** true when the legacy rows were computed with the live clock (new Date(), time of day
   * included) rather than pinned to an asOfDate at midnight. */
  legacyLiveClock: boolean;
  /** Today's Vietnam date — phase-completion diffs for an older asOf are expected (D3). */
  today: string;
}

const ANOMALY_CODE_TO_BADGE: Record<string, BadgeId> = {
  MISSING_START_DATE: 'ANOMALY_R1_MISSING_START_DATE',
  PENDING_TOO_LONG: 'ANOMALY_R2_PENDING_TOO_LONG',
  DATE_OUT_OF_SEQUENCE: 'ANOMALY_R3_DATE_OUT_OF_SEQUENCE',
  MISSING_REQUEST_TYPE: 'ANOMALY_R4_MISSING_REQUEST_TYPE',
  MISSING_REQUIREMENT_LEVEL: 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL',
  SP_LEVEL_MISMATCH: 'ANOMALY_R6_SP_LEVEL_MISMATCH',
  RELEASE_STATUS_MISMATCH: 'RELEASE_STATUS_MISMATCH',
};

const PHASES: [keyof LegacyRowSnapshot['stages'], TtmPhaseKey][] = [['design', 'DESIGN'], ['dev', 'DEV'], ['test', 'TEST'], ['pentest', 'PENTEST'], ['r4golive', 'R4GOLIVE']];

/** Legacy verdicts ignore the "Phạm vi" gate (the screen hides them instead), so compare against
 * findings that are active or hidden ONLY by SCOPE_CNTT_OUT. */
function verdictSet(findings: readonly Finding[]): Set<BadgeId> {
  return new Set(findings.filter((item) => !item.suppressedBy || item.suppressedBy.every((by) => by === 'SCOPE_CNTT_OUT')).map((item) => item.badge));
}

export function compareWithLegacy(card: EpicScorecard, legacy: LegacyRowSnapshot, ctx: ScoringContext, options: ParityOptions): ParityDiff[] {
  const diffs: ParityDiff[] = [];
  const d = card.derived;
  const verdicts = verdictSet(card.findings);
  const active = new Set(card.findings.filter((item) => !item.suppressedBy).map((item) => item.badge));
  const push = (check: string, legacyValue: unknown, scoringValue: unknown, tag: ParityTag) => {
    diffs.push({ check, legacy: String(legacyValue), scoring: String(scoringValue), tag });
  };

  // D5: legacy Target_CNTT = From +wd N, new = From +wd (N − 1). A compared date v inside
  // (newTarget, legacyTarget] — or, on the live clock, legacy failing only from the legacy target
  // day onward — explains any CNTT/scope difference.
  const legacyTarget = d.cnttFromDate && d.cnttBudgetWorkingDays ? addWorkingDays(d.cnttFromDate, d.cnttBudgetWorkingDays, ctx.holidays) : null;
  const inD5Window = (value: string | null) => Boolean(value && d.cnttTargetDate && legacyTarget && value > d.cnttTargetDate && value <= legacyTarget);
  const cnttCompared = legacy.r4gDate ?? ctx.asOf;

  // ---- TTM-CNTT verdict ----
  const scoringCntt: LegacyAlertLevel = verdicts.has('CNTT_FAIL') ? 'FAIL' : verdicts.has('CNTT_LATE') ? 'LATE' : 'NONE';
  if (legacy.alertLevel !== scoringCntt) {
    const tag: ParityTag = legacy.alertLevel === 'EARLY' && scoringCntt === 'NONE' ? 'D4_EARLY_REMOVED' : inD5Window(cnttCompared) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED';
    push('TTM-CNTT alertLevel', legacy.alertLevel, scoringCntt, tag);
  }
  const scoringMismatch = verdicts.has('CNTT_STATUS_MISMATCH');
  if (legacy.ttmCnttStatusMismatch !== scoringMismatch) push('TTM-CNTT Sai Status', legacy.ttmCnttStatusMismatch, scoringMismatch, inD5Window(legacy.r4gDate) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');
  const legacyAchieved = !legacy.ttmCnttStatusMismatch && legacy.alertLevel === 'NONE' && Boolean(legacy.r4gDate) && legacy.ttmActualToDate === legacy.r4gDate;
  const scoringAchieved = verdicts.has('CNTT_PASS') && !verdicts.has('CNTT_STATUS_MISMATCH');
  // Legacy shows "Đạt TTM-CNTT" even on a Cancelled Epic (its alertLevel is forced NONE); the
  // service reports "Không áp dụng" instead.
  if (legacyAchieved !== scoringAchieved) push('Đạt TTM-CNTT', legacyAchieved, scoringAchieved, d.isCancelled ? 'CANCELLED_NOT_APPLICABLE' : inD5Window(legacy.r4gDate) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');

  // ---- TTM-E2E ----
  // Legacy compares Date objects: a recorded end date parsed as UTC midnight (07:00 in Vietnam)
  // is "after" a same-day target built at local midnight — so on a non-UTC server an end date equal
  // to the target counts as Fail. On the pinned-asOf path the reverse happens for "today". The
  // service compares plain dates, identically on every server.
  const scoringE2eFail = active.has('E2E_FAIL');
  let e2eTag: ParityTag | null = null;
  if ((legacy.ttmE2eAlertLevel === 'FAIL') !== scoringE2eFail) {
    const recordedOnTarget = d.e2eEndRecorded && d.e2eEndDate === d.e2eTargetDate;
    const ongoingOnTarget = !options.legacyLiveClock && !d.e2eEndRecorded && ctx.asOf === d.e2eTargetDate;
    e2eTag = recordedOnTarget || ongoingOnTarget ? 'LEGACY_TIME_OF_DAY' : 'UNEXPLAINED';
    push('TTM-E2E Fail', legacy.ttmE2eAlertLevel, scoringE2eFail ? 'FAIL' : 'NONE', e2eTag);
  }
  const legacyE2eAchieved = legacy.ttmE2eAlertLevel === 'NONE' && normalizeWorkflowStatus(legacy.currentStatus) === 'RELEASED' && Boolean(legacy.r4gDate) && legacy.ttmE2eActualToDate === legacy.r4gDate;
  if (legacyE2eAchieved !== active.has('E2E_PASS')) push('Đạt TTM-E2E', legacyE2eAchieved, active.has('E2E_PASS'), e2eTag ?? 'UNEXPLAINED');

  // ---- Release ----
  const scoringRelease = active.has('RELEASE_JUSTIFY_GOLIVE') ? 'JUSTIFY_GOLIVE' : active.has('RELEASE_WAITING_GOLIVE') ? 'WAITING_GOLIVE' : 'NONE';
  if (legacy.releaseAxisState !== scoringRelease) {
    // D7 (2026-10-01): "Chờ golive" is now status-based (R4GOLIVE, or RELEASED without Due Date) and
    // no longer tied to R4G Date/grace timing, so it legitimately disagrees with the legacy
    // (R4G Date + grace + status ≤ R4GOLIVE) formula on either side of this comparison.
    const tag: ParityTag = legacy.releaseAxisState === 'EARLY_WARNING' && scoringRelease === 'NONE'
      ? 'D4_EARLY_REMOVED'
      : legacy.releaseAxisState === 'WAITING_GOLIVE' || scoringRelease === 'WAITING_GOLIVE'
        ? 'D7_WAITING_GOLIVE_REDEFINED'
        : 'UNEXPLAINED';
    push('Trục Release', legacy.releaseAxisState, scoringRelease, tag);
  }

  // ---- Data quality rules (R1–R7, same badge presence) ----
  const legacyRuleBadges = new Set(legacy.dataAnomalyViolations.map((item) => ANOMALY_CODE_TO_BADGE[item.code]).filter(Boolean));
  for (const badge of Object.values(ANOMALY_CODE_TO_BADGE)) {
    if (legacyRuleBadges.has(badge) !== active.has(badge)) push(`Rule ${badge}`, legacyRuleBadges.has(badge), active.has(badge), 'UNEXPLAINED');
  }
  const scoringAnomaly = hasDataAnomalyBadge(active);
  if (legacy.hasDataAnomaly !== scoringAnomaly) {
    const onlyR2R7 = legacy.hasDataAnomaly && !scoringAnomaly && [...legacyRuleBadges].every((badge) => badge === 'ANOMALY_R2_PENDING_TOO_LONG' || badge === 'RELEASE_STATUS_MISMATCH');
    push('Sai lệch dữ liệu', legacy.hasDataAnomaly, scoringAnomaly, onlyR2R7 ? 'R2_R7_NOT_ANOMALY' : 'UNEXPLAINED');
  }

  // ---- Scope ----
  if (legacy.ttmCnttInScope === active.has('SCOPE_CNTT_OUT')) push('Phạm vi TTM-CNTT', legacy.ttmCnttInScope, !active.has('SCOPE_CNTT_OUT'), !legacy.r4gDate ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');
  if (legacy.qaInScope === active.has('SCOPE_QA_OUT')) push('Phạm vi QA', legacy.qaInScope, !active.has('SCOPE_QA_OUT'), 'UNEXPLAINED');

  // ---- Phases ----
  const historical = ctx.asOf < options.today;
  for (const [legacyKey, phase] of PHASES) {
    const cell = legacy.stages[legacyKey];
    const has = (badge: BadgeId) => card.findings.some((item) => item.badge === badge && item.subject === phase && !item.suppressedBy);
    const scoringLate = has('PHASE_LATE');
    if ((cell.alertLevel === 'LATE') !== scoringLate || (cell.alertLevel === 'EARLY' && scoringLate)) {
      push(`Pha ${phase} — Trễ`, cell.alertLevel, scoringLate ? 'LATE' : 'NONE', historical ? 'D3_PHASE_AS_OF' : 'UNEXPLAINED');
    } else if (cell.alertLevel === 'EARLY') {
      push(`Pha ${phase} — Cảnh báo sớm`, 'EARLY', 'NONE', 'D4_EARLY_REMOVED');
    }
    if (cell.isDone !== has('PHASE_DONE')) push(`Pha ${phase} — Hoàn thành`, cell.isDone, has('PHASE_DONE'), historical ? 'D3_PHASE_AS_OF' : 'UNEXPLAINED');
    if (cell.isCurrentStage !== has('PHASE_CURRENT')) push(`Pha ${phase} — Hiện tại`, cell.isCurrentStage, has('PHASE_CURRENT'), historical ? 'D3_PHASE_AS_OF' : 'UNEXPLAINED');
  }

  // ---- TTM-Index membership ----
  const cancelled = /cancel/i.test(legacy.currentStatus);
  const legacyCounted = !cancelled && legacy.ttmCnttInScope;
  const legacyEligible = legacyCounted && Boolean(legacy.r4gDate) && !legacy.hasDataAnomaly;
  const legacyPass = legacyEligible && legacy.alertLevel === 'NONE';
  const index = card.indexMembership.ttm;
  const tagOf = (check: string): ParityTag | null => diffs.find((item) => item.check === check)?.tag ?? null;
  const explainedBy = (...checks: string[]): ParityTag => checks.map(tagOf).find((tag): tag is ParityTag => Boolean(tag) && tag !== 'UNEXPLAINED') ?? 'UNEXPLAINED';
  if (legacyCounted !== index.counted) push('TTM-Index: tính', legacyCounted, index.counted, explainedBy('Phạm vi TTM-CNTT'));
  if (legacyEligible !== index.eligible) push('TTM-Index: mẫu số', legacyEligible, index.eligible, explainedBy('Sai lệch dữ liệu', 'TTM-Index: tính'));
  if (legacyPass !== index.pass) {
    const d1 = legacyPass && !index.pass && (legacy.ttmCnttStatusMismatch || !legacyAchieved);
    push('TTM-Index: đạt', legacyPass, index.pass, d1 ? 'D1_INDEX_PASS' : explainedBy('TTM-Index: mẫu số', 'TTM-CNTT alertLevel', 'Đạt TTM-CNTT'));
  }
  const legacyFail = legacyCounted && legacy.alertLevel === 'FAIL';
  if (legacyFail !== index.fail) push('TTM-Index: fail', legacyFail, index.fail, explainedBy('TTM-CNTT alertLevel', 'TTM-Index: tính'));

  return diffs;
}

export interface ParitySummary {
  asOf: string;
  epicCount: number;
  identicalEpics: number;
  epicsWithIntentionalDiffsOnly: number;
  epicsWithUnexplainedDiffs: number;
  byTag: Record<string, number>;
  byCheck: Record<string, { intentional: number; unexplained: number }>;
  unexplainedSamples: { epicKey: string; diffs: ParityDiff[] }[];
  intentionalSamples: { epicKey: string; diffs: ParityDiff[] }[];
}

export function summarizeParity(asOf: string, results: { epicKey: string; diffs: ParityDiff[] }[], sampleLimit = 30): ParitySummary {
  const summary: ParitySummary = {
    asOf, epicCount: results.length, identicalEpics: 0, epicsWithIntentionalDiffsOnly: 0, epicsWithUnexplainedDiffs: 0,
    byTag: {}, byCheck: {}, unexplainedSamples: [], intentionalSamples: [],
  };
  for (const result of results) {
    if (!result.diffs.length) { summary.identicalEpics += 1; continue; }
    const unexplained = result.diffs.some((item) => item.tag === 'UNEXPLAINED');
    if (unexplained) {
      summary.epicsWithUnexplainedDiffs += 1;
      if (summary.unexplainedSamples.length < sampleLimit) summary.unexplainedSamples.push(result);
    } else {
      summary.epicsWithIntentionalDiffsOnly += 1;
      if (summary.intentionalSamples.length < sampleLimit) summary.intentionalSamples.push(result);
    }
    for (const diff of result.diffs) {
      summary.byTag[diff.tag] = (summary.byTag[diff.tag] ?? 0) + 1;
      const bucket = (summary.byCheck[diff.check] ??= { intentional: 0, unexplained: 0 });
      if (diff.tag === 'UNEXPLAINED') bucket.unexplained += 1;
      else bucket.intentional += 1;
    }
  }
  return summary;
}
