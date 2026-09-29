import type { BadgeId } from './catalog';
import type { ScoringParameters } from './parameters';

/** "YYYY-MM-DD" — every date the scoring service touches is a plain calendar date. */
export type IsoDate = string;

export type EpicComplexity = 'CT-Lv12' | 'CT-Lv34' | 'SP-Lv12' | 'SP-Lv34';
export type TtmPhaseKey = 'DESIGN' | 'DEV' | 'TEST' | 'PENTEST' | 'R4GOLIVE';

export interface EpicPhaseCompletionFacts {
  designDone: boolean;
  devDone: boolean;
  r4goliveDone: boolean;
  testDone: boolean;
}

/** One Epic's raw data exactly as known at `ScoringContext.asOf` (the caller loads the matching
 * data layer — see scoring-facts-service.ts). */
export interface EpicFacts {
  epicKey: string;
  status: string;
  /** issues.epic_complexity_type — null when it couldn't be resolved (rules default to CT-Lv12). */
  complexity: EpicComplexity | null;
  /** T0 */
  ideaApprovedDate: IsoDate | null;
  jiraCreatedAt: IsoDate | null;
  /** T1 */
  startDate: IsoDate | null;
  r4gDate: IsoDate | null;
  dueDate: IsoDate | null;
  /** "Phân loại yêu cầu" */
  requestType: string | null;
  requirementLevel: string | null;
  /** Story/subtask-derived phase completion AT asOf; null = no data for that date. */
  phaseCompletion: EpicPhaseCompletionFacts | null;
}

export interface ScoringHolidays {
  holidays: ReadonlySet<string>;
  /** "Ngày làm bù" — weekend dates declared working days; always win over holidays/weekends. */
  workdays: ReadonlySet<string>;
}

export interface ScoringTtmPolicy {
  epicComplexityType: EpicComplexity;
  fromTtmField: string;
  isActive: boolean;
  toTtmField: string;
  ttmType: 'TTM_CNTT' | 'TTM_E2E';
  workingDays: number;
}

export interface ScoringStatusAlertRule {
  epicComplexityType: EpicComplexity;
  epicStatus: string;
  lateAlertOffsetDays: number;
}

export interface ScoringScopeConfig {
  cnttFrom: string | null;
  cnttTo: string | null;
  qaFrom: string | null;
  qaTo: string | null;
}

export interface ScoringContext {
  /** Relative "now" — Vietnam calendar date. The service never reads the system clock. */
  asOf: IsoDate;
  holidays: ScoringHolidays;
  ttmPolicies: readonly ScoringTtmPolicy[];
  statusAlertRules: readonly ScoringStatusAlertRule[];
  scope: ScoringScopeConfig;
  parameters: ScoringParameters;
  /** Per-badge on/off overrides (scoring_rule_settings); missing = the badge's defaultEnabled. */
  ruleEnabled: Readonly<Partial<Record<BadgeId, boolean>>>;
  /** Identifies the rule code + configuration this scorecard was produced with. */
  rulesetVersion: string;
}

export interface Finding {
  badge: BadgeId;
  /** PHASE axis only. */
  subject?: TtmPhaseKey;
  message: string;
  evidence: Record<string, string | number | boolean | null>;
  /** Present = hidden by default (still returned for drill-down). */
  suppressedBy?: BadgeId[];
  /** RECOMMENDATION badges point back at the badge(s) that caused them. */
  relatedTo?: BadgeId[];
}

export interface PhaseDerived {
  baselineDate: IsoDate;
  isDone: boolean;
  isCurrent: boolean;
}

/** Numbers the screens draw (stripes, phase columns) — computed once here, never re-derived in UI. */
export interface DerivedMetrics {
  complexity: EpicComplexity;
  statusIndex: number;
  isCancelled: boolean;
  cnttFromDate: IsoDate | null;
  cnttBudgetWorkingDays: number | null;
  /** Target_CNTT = From +wd (N − 1). */
  cnttTargetDate: IsoDate | null;
  cnttLateAlertDate: IsoDate | null;
  cnttRemainingWorkingDays: number | null;
  cnttCalcBroken: boolean;
  e2eBaselineSourceDate: IsoDate | null;
  e2eBaselineFromJiraCreated: boolean;
  e2eBudgetWorkingDays: number | null;
  e2eTargetDate: IsoDate | null;
  e2eEndDate: IsoDate | null;
  e2eActualToDate: IsoDate | null;
  /** End date recorded, already reached (<= asOf) and not before T0. */
  e2eEndRecorded: boolean;
  e2eCalcBroken: boolean;
  releaseGraceDeadline: IsoDate | null;
  phases: Record<TtmPhaseKey, PhaseDerived> | null;
}

export interface IndexFlags {
  counted: boolean;
  eligible: boolean;
  pass: boolean;
  fail: boolean;
}

export interface IndexMembership {
  ttm: IndexFlags;
  qa: IndexFlags;
}

export interface EpicScorecard {
  epicKey: string;
  asOf: IsoDate;
  rulesetVersion: string;
  /** Every finding, suppressed ones included, sorted by badge precedence within axis. */
  findings: Finding[];
  indexMembership: IndexMembership;
  derived: DerivedMetrics;
}
