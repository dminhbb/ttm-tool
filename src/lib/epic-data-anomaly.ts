/**
 * Codes and stable numbers of the "Sai lệch dữ liệu" rules (R1-R11). The rules themselves — which Epic
 * breaks which — are evaluated by the Epic Scoring Service (src/lib/scoring/rules/data-quality.ts, badges
 * ANOMALY_R*); a row projected from a scorecard (scoring/projection.ts) carries them in
 * dataAnomalyViolations, and the screens group/describe them through the codes below.
 */
export type EpicAnomalyCode =
  | 'MISSING_START_DATE'
  | 'PENDING_TOO_LONG'
  | 'DATE_OUT_OF_SEQUENCE'
  | 'MISSING_REQUEST_TYPE'
  | 'MISSING_REQUIREMENT_LEVEL'
  | 'SP_LEVEL_MISMATCH'
  | 'RELEASE_STATUS_MISMATCH'
  | 'R4G_DATE_BEFORE_R4GOLIVE'
  | 'MISSING_R4G_DATE'
  | 'R4G_DATE_IN_FUTURE'
  | 'EXCEPT_PLAN_INVALID';

/** Stable numeric index (R1-R7) for each rule, carried on every violation so consumers can group by rule
 * without depending on the rule's text code or message wording. Never renumber an existing code; add
 * new rules at the end. */
export const EPIC_ANOMALY_RULE_INDEX: Record<EpicAnomalyCode, number> = {
  MISSING_START_DATE: 1,
  PENDING_TOO_LONG: 2,
  DATE_OUT_OF_SEQUENCE: 3,
  MISSING_REQUEST_TYPE: 4,
  MISSING_REQUIREMENT_LEVEL: 5,
  SP_LEVEL_MISMATCH: 6,
  RELEASE_STATUS_MISMATCH: 7,
  R4G_DATE_BEFORE_R4GOLIVE: 8,
  MISSING_R4G_DATE: 9,
  R4G_DATE_IN_FUTURE: 10,
  EXCEPT_PLAN_INVALID: 11,
};

export interface EpicAnomalyViolation {
  code: EpicAnomalyCode;
  /** See EPIC_ANOMALY_RULE_INDEX — same value as EPIC_ANOMALY_RULE_INDEX[code], carried on the
   * violation itself so callers/persistence never need a second lookup. */
  ruleIndex: number;
  /** Actionable Vietnamese message — shown to the user as "what to complete". */
  message: string;
}
