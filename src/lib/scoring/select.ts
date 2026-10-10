import { BADGE_BY_ID } from './catalog';
import type { BadgeId, FindingGroup, ScoringAxis } from './catalog';
import type { EpicScorecard, Finding, IndexFlags, TtmPhaseKey } from './types';

/** Helpers so screens never re-implement precedence/suppression on their own. */

export function activeFindings(card: Pick<EpicScorecard, 'findings'>): Finding[] {
  return card.findings.filter((item) => !item.suppressedBy);
}

export function findingsByAxis(card: Pick<EpicScorecard, 'findings'>, axis: ScoringAxis): Finding[] {
  return activeFindings(card).filter((item) => BADGE_BY_ID.get(item.badge)?.axis === axis);
}

export function findingsByGroup(card: Pick<EpicScorecard, 'findings'>, group: FindingGroup): Finding[] {
  return activeFindings(card).filter((item) => BADGE_BY_ID.get(item.badge)?.group === group);
}

/** Highest-precedence active finding of an axis (findings are already precedence-sorted). */
export function primaryFinding(card: Pick<EpicScorecard, 'findings'>, axis: ScoringAxis): Finding | null {
  return findingsByAxis(card, axis)[0] ?? null;
}

export function hasBadge(card: Pick<EpicScorecard, 'findings'>, badge: BadgeId, subject?: TtmPhaseKey): boolean {
  return activeFindings(card).some((item) => item.badge === badge && (subject === undefined || item.subject === subject));
}

/** Active badge codes as stored in epic_alert_row_cache.badge_codes — subject-qualified ones twice
 * ("PHASE_LATE" and "PHASE_LATE:DEV") so SQL can filter by axis or by phase. */
export function badgeCodesOf(card: Pick<EpicScorecard, 'findings'>): string[] {
  const codes = new Set<string>();
  for (const item of activeFindings(card)) {
    codes.add(item.badge);
    if (item.subject) codes.add(`${item.badge}:${item.subject}`);
  }
  return [...codes].sort();
}

/** epic_alert_row_cache.index_flags, e.g. ["TTM_COUNTED", "TTM_ELIGIBLE", "QA_COUNTED"]. */
export function indexFlagsOf(card: Pick<EpicScorecard, 'indexMembership'>): string[] {
  const out: string[] = [];
  const push = (prefix: 'TTM' | 'QA', flags: IndexFlags) => {
    if (flags.counted) out.push(`${prefix}_COUNTED`);
    if (flags.eligible) out.push(`${prefix}_ELIGIBLE`);
    if (flags.pass) out.push(`${prefix}_PASS`);
    if (flags.fail) out.push(`${prefix}_FAIL`);
  };
  push('TTM', card.indexMembership.ttm);
  push('QA', card.indexMembership.qa);
  return out;
}

/** "Nhận xét" toolbar filter values → badge codes (replaces matchesAlertFilter/buildAlertFilterClause). */
export const FILTER_PRESETS: Record<string, readonly BadgeId[]> = {
  FAIL: ['CNTT_FAIL'],
  LATE: ['CNTT_LATE'],
  FAIL_E2E: ['E2E_FAIL'],
  ACHIEVED_CNTT: ['CNTT_PASS'],
  ACHIEVED_E2E: ['E2E_PASS'],
  STATUS_MISMATCH: ['CNTT_STATUS_MISMATCH', 'E2E_STATUS_MISMATCH', 'RELEASE_STATUS_MISMATCH'],
  DATA_ANOMALY: ['ANOMALY_R1_MISSING_START_DATE', 'ANOMALY_R3_DATE_OUT_OF_SEQUENCE', 'ANOMALY_R4_MISSING_REQUEST_TYPE', 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', 'ANOMALY_R6_SP_LEVEL_MISMATCH', 'ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', 'ANOMALY_R9_MISSING_R4G_DATE', 'ANOMALY_R10_R4G_DATE_IN_FUTURE'],
  PENDING_TOO_LONG: ['ANOMALY_R2_PENDING_TOO_LONG'],
  WAITING_GOLIVE: ['RELEASE_WAITING_GOLIVE'],
  JUSTIFY_GOLIVE: ['RELEASE_JUSTIFY_GOLIVE'],
  MISSING_FAIL_REASON: ['REC_MISSING_FAIL_REASON'],
  OUT_OF_SCOPE_CNTT: ['SCOPE_CNTT_OUT'],
};
