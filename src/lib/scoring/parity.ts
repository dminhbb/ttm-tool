import { addWorkingDays } from './dates';
import { isDevPeerStatus, normalizeWorkflowStatus, STATUS_INDEX } from './derive';
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
  | 'D8_ANOMALY_CHECKED_FIRST'
  | 'D9_E2E_RULE_REDEFINED'
  | 'D10_DATA_QUALITY_RULES'
  | 'D11_WORKFLOW_STATUSES'
  | 'D12_TTM_EXCLUSION'
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

/** Data-quality rules the legacy engine doesn't have (added 2026-10-04). */
const SCORING_ONLY_ANOMALY_BADGES: readonly BadgeId[] = ['ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', 'ANOMALY_R9_MISSING_R4G_DATE', 'ANOMALY_R10_R4G_DATE_IN_FUTURE'];

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

  // D8 (2026-10-01): data quality is checked first — an Epic with "Sai lệch dữ liệu" gets no
  // Đạt/Fail/Cảnh báo muộn/Sai Status on the TTM axes, where the legacy engine still judged it.
  const anomalyGate = hasDataAnomalyBadge(active);

  // ---- TTM-CNTT verdict ----
  const scoringCntt: LegacyAlertLevel = verdicts.has('CNTT_FAIL') ? 'FAIL' : verdicts.has('CNTT_LATE') ? 'LATE' : 'NONE';
  if (legacy.alertLevel !== scoringCntt) {
    const tag: ParityTag = legacy.alertLevel === 'EARLY' && scoringCntt === 'NONE' ? 'D4_EARLY_REMOVED' : anomalyGate && scoringCntt === 'NONE' ? 'D8_ANOMALY_CHECKED_FIRST' : inD5Window(cnttCompared) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED';
    push('TTM-CNTT alertLevel', legacy.alertLevel, scoringCntt, tag);
  }
  const scoringMismatch = verdicts.has('CNTT_STATUS_MISMATCH');
  if (legacy.ttmCnttStatusMismatch !== scoringMismatch) push('TTM-CNTT Sai Status', legacy.ttmCnttStatusMismatch, scoringMismatch, anomalyGate && !scoringMismatch ? 'D8_ANOMALY_CHECKED_FIRST' : inD5Window(legacy.r4gDate) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');
  const legacyAchieved = !legacy.ttmCnttStatusMismatch && legacy.alertLevel === 'NONE' && Boolean(legacy.r4gDate) && legacy.ttmActualToDate === legacy.r4gDate;
  // Since 2026-10-01 a "Sai Status" Epic keeps its pass; the legacy "Đạt" badge excluded it, so the
  // like-for-like comparison is "Đạt without Sai Status".
  const scoringAchieved = verdicts.has('CNTT_PASS') && !verdicts.has('CNTT_STATUS_MISMATCH');
  // Legacy shows "Đạt TTM-CNTT" even on a Cancelled Epic (its alertLevel is forced NONE); the
  // service reports "Không áp dụng" instead.
  if (legacyAchieved !== scoringAchieved) push('Đạt TTM-CNTT', legacyAchieved, scoringAchieved, d.isCancelled ? 'CANCELLED_NOT_APPLICABLE' : anomalyGate && !scoringAchieved ? 'D8_ANOMALY_CHECKED_FIRST' : inD5Window(legacy.r4gDate) ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');

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
    // D9 (2026-10-01): TTM-E2E was redefined — Target = T0 +wd (N − 1), a future end date past
    // Target already fails, "ongoing" fails only after Target — so it legitimately differs from the
    // legacy T0 +wd N formula.
    e2eTag = anomalyGate && !scoringE2eFail ? 'D8_ANOMALY_CHECKED_FIRST' : recordedOnTarget || ongoingOnTarget ? 'LEGACY_TIME_OF_DAY' : 'D9_E2E_RULE_REDEFINED';
    push('TTM-E2E Fail', legacy.ttmE2eAlertLevel, scoringE2eFail ? 'FAIL' : 'NONE', e2eTag);
  }
  const legacyE2eAchieved = legacy.ttmE2eAlertLevel === 'NONE' && normalizeWorkflowStatus(legacy.currentStatus) === 'RELEASED' && Boolean(legacy.r4gDate) && legacy.ttmE2eActualToDate === legacy.r4gDate;
  if (legacyE2eAchieved !== active.has('E2E_PASS')) push('Đạt TTM-E2E', legacyE2eAchieved, active.has('E2E_PASS'), anomalyGate && !active.has('E2E_PASS') ? 'D8_ANOMALY_CHECKED_FIRST' : 'D9_E2E_RULE_REDEFINED');

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
  // D10 (2026-10-04): data-quality rules changed in the service only — R1 now starts at DESIGN (legacy:
  // DEV) and covers Pending (2026-10-05), R5 no longer applies while the Epic is still at DESIGN, and
  // R8/R9 (R4G Date vs status) and R10 (future R4G Date, 2026-10-09) are new.
  const legacyRuleBadges = new Set(legacy.dataAnomalyViolations.map((item) => ANOMALY_CODE_TO_BADGE[item.code]).filter(Boolean));
  let d10 = false;
  for (const badge of Object.values(ANOMALY_CODE_TO_BADGE)) {
    if (legacyRuleBadges.has(badge) === active.has(badge)) continue;
    const explained = (badge === 'ANOMALY_R1_MISSING_START_DATE' && active.has(badge) && (d.statusIndex === STATUS_INDEX.DESIGN || /pending/i.test(legacy.currentStatus)))
      || (badge === 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL' && !active.has(badge) && d.statusIndex <= STATUS_INDEX.DESIGN);
    d10 ||= explained;
    push(`Rule ${badge}`, legacyRuleBadges.has(badge), active.has(badge), explained ? 'D10_DATA_QUALITY_RULES' : 'UNEXPLAINED');
  }
  for (const badge of SCORING_ONLY_ANOMALY_BADGES) {
    if (!active.has(badge)) continue;
    d10 = true;
    push(`Rule ${badge}`, false, true, 'D10_DATA_QUALITY_RULES');
  }
  const scoringAnomaly = hasDataAnomalyBadge(active);
  if (legacy.hasDataAnomaly !== scoringAnomaly) {
    const onlyR2R7 = legacy.hasDataAnomaly && !scoringAnomaly && [...legacyRuleBadges].every((badge) => badge === 'ANOMALY_R2_PENDING_TOO_LONG' || badge === 'RELEASE_STATUS_MISMATCH');
    push('Sai lệch dữ liệu', legacy.hasDataAnomaly, scoringAnomaly, onlyR2R7 ? 'R2_R7_NOT_ANOMALY' : d10 ? 'D10_DATA_QUALITY_RULES' : 'UNEXPLAINED');
  }

  // ---- Scope ----
  if (legacy.ttmCnttInScope === active.has('SCOPE_CNTT_OUT')) push('Phạm vi TTM-CNTT', legacy.ttmCnttInScope, !active.has('SCOPE_CNTT_OUT'), !legacy.r4gDate ? 'D5_TARGET_N_MINUS_1' : 'UNEXPLAINED');
  if (legacy.qaInScope === active.has('SCOPE_QA_OUT')) push('Phạm vi QA', legacy.qaInScope, !active.has('SCOPE_QA_OUT'), 'UNEXPLAINED');

  // ---- Phases ----
  const historical = ctx.asOf < options.today;
  // D11 (2026-10-05): Pending / Reopened rank level with "In Progress" in the service's workflow; the
  // legacy engine sorts them after RELEASED, so it puts such an Epic in the R4GOLIVE phase.
  const phaseTag: ParityTag = historical ? 'D3_PHASE_AS_OF' : isDevPeerStatus(legacy.currentStatus) ? 'D11_WORKFLOW_STATUSES' : 'UNEXPLAINED';
  for (const [legacyKey, phase] of PHASES) {
    const cell = legacy.stages[legacyKey];
    const has = (badge: BadgeId) => card.findings.some((item) => item.badge === badge && item.subject === phase && !item.suppressedBy);
    const scoringLate = has('PHASE_LATE');
    if ((cell.alertLevel === 'LATE') !== scoringLate || (cell.alertLevel === 'EARLY' && scoringLate)) {
      push(`Pha ${phase} — Trễ`, cell.alertLevel, scoringLate ? 'LATE' : 'NONE', phaseTag);
    } else if (cell.alertLevel === 'EARLY') {
      push(`Pha ${phase} — Cảnh báo sớm`, 'EARLY', 'NONE', 'D4_EARLY_REMOVED');
    }
    if (cell.isDone !== has('PHASE_DONE')) push(`Pha ${phase} — Hoàn thành`, cell.isDone, has('PHASE_DONE'), phaseTag);
    if (cell.isCurrentStage !== has('PHASE_CURRENT')) push(`Pha ${phase} — Hiện tại`, cell.isCurrentStage, has('PHASE_CURRENT'), phaseTag);
  }

  // ---- TTM-Index membership ----
  const cancelled = /cancel/i.test(legacy.currentStatus);
  const legacyCounted = !cancelled && legacy.ttmCnttInScope;
  const legacyEligible = legacyCounted && Boolean(legacy.r4gDate) && !legacy.hasDataAnomaly;
  const legacyPass = legacyEligible && legacy.alertLevel === 'NONE';
  const index = card.indexMembership.ttm;
  const tagOf = (check: string): ParityTag | null => diffs.find((item) => item.check === check)?.tag ?? null;
  const explainedBy = (...checks: string[]): ParityTag => checks.map(tagOf).find((tag): tag is ParityTag => Boolean(tag) && tag !== 'UNEXPLAINED') ?? 'UNEXPLAINED';
  // D12 (2026-10-05): "Epic ngoại lệ" (black listed) and Epics of a project with Time to Market = N are
  // outside L02 in the service — never counted — while the legacy engine doesn't know either notion.
  // The other three flags below follow from this one through explainedBy('TTM-Index: tính').
  const ttmExcluded = active.has('SCOPE_TTM_BLACK_LISTED') || active.has('SCOPE_PROJECT_NON_TTM');
  if (legacyCounted !== index.counted) push('TTM-Index: tính', legacyCounted, index.counted, ttmExcluded && !index.counted ? 'D12_TTM_EXCLUSION' : explainedBy('Phạm vi TTM-CNTT'));
  if (legacyEligible !== index.eligible) push('TTM-Index: mẫu số', legacyEligible, index.eligible, explainedBy('Sai lệch dữ liệu', 'TTM-Index: tính'));
  if (legacyPass !== index.pass) {
    const d1 = legacyPass && !index.pass && (legacy.ttmCnttStatusMismatch || !legacyAchieved);
    push('TTM-Index: đạt', legacyPass, index.pass, d1 ? 'D1_INDEX_PASS' : explainedBy('TTM-Index: mẫu số', 'TTM-CNTT alertLevel', 'Đạt TTM-CNTT', 'TTM-Index: tính'));
  }
  const legacyFail = legacyCounted && legacy.alertLevel === 'FAIL';
  if (legacyFail !== index.fail) push('TTM-Index: fail', legacyFail, index.fail, explainedBy('TTM-CNTT alertLevel', 'TTM-Index: tính'));

  // D12, widened 2026-10-09: the service doesn't judge an "Epic ngoại lệ" at all (score-epic.ts), so
  // every verdict the legacy engine still gives it — TTM-CNTT / E2E, Release, Sai lệch dữ liệu, phases —
  // is this one approved difference. The two "Phạm vi" checks stay as they are: scope is still read.
  if (ttmExcluded) {
    return diffs.map((diff) => (diff.check.startsWith('Phạm vi') ? diff : { ...diff, tag: 'D12_TTM_EXCLUSION' }));
  }
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
