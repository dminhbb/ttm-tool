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
  /** Not used by any rule — only the Release cell of the row draws it ("đã Released"). */
  releasedDone?: boolean;
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
  /** issues.previous_status — the status the Epic had before its current one (mostly empty; only
   * filled for some transitions, e.g. a Pending Epic). Used by R5. */
  previousStatus?: string | null;
  /** Story/subtask-derived phase completion AT asOf; null = no data for that date. */
  phaseCompletion: EpicPhaseCompletionFacts | null;
  /** Set when the Epic is taken out of the TTM calculation (see TtmExclusion); absent/null = counted. */
  ttmExclusion?: TtmExclusion | null;
  /** 9 fields representing cause/reasons of Fail TTM (issues table) */
  khauBa?: string | null;
  khauCo?: string | null;
  khauDev?: string | null;
  khauPmSm?: string | null;
  khauPo?: string | null;
  khauPentest?: string | null;
  khauSa?: string | null;
  khauSitUat?: string | null;
  noteLyDoKhac?: string | null;
  /** "Phòng chịu trách nhiệm chính" of a Fail TTM — issues.main_fail_dept (CSV main_fail_dept, 2026-10-14).
   * Blank or "None" (what Jira sends for an empty field) = missing (REC_MISSING_RESPONSIBLE_DEPARTMENT). */
  responsibleDepartment?: string | null;
}

/**
 * "Epic ngoại lệ" — why an Epic is outside every Time to Market calculation although it isn't
 * Cancelled (owner rule 2026-10-05, L02 of the TTM Dashboard 2 funnel). Both kinds go by that one
 * name since 2026-10-09:
 *   BLACK_LISTED    — declared in the black list (table black_listed_epics, menu "Epic ngoại lệ");
 *   PROJECT_NON_TTM — its project is marked "Time to Market = N" (Quản lý Dự án).
 * Since 2026-10-09 the Scoring Service does not judge such an Epic at all (score-epic.ts): it gets
 * the exception note only — no verdict, alert or recommendation — besides not being counted in the
 * funnel from L02 on, the TTM-CNTT (QLDA/QA) and TTM-E2E ratios, or the TTM Dashboard 2 widgets.
 */
export type TtmExclusion = 'BLACK_LISTED' | 'PROJECT_NON_TTM';

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
  /** "Bộ ngân sách" this row belongs to (spec 2026-10-25 §17); absent = DEFAULT_POLICY_SET. A set only
   * holds the rows that differ — a missing (type, complexity) row is inherited from DEFAULT_POLICY_SET. */
  policySet?: string;
}

/** The budget set every Epic used before "Bộ ngân sách" existed (Tiêu chí Time to Market as configured today). */
export const DEFAULT_POLICY_SET = 'DEFAULT';

/** Which "Bộ ngân sách" the Epic's TTM-CNTT / TTM-E2E numbers come from — set by the verdict rules of its Rule Group. */
export interface PolicySetSelection {
  cntt: string;
  e2e: string;
}

/** Epic dates a Rule Group can filter on (spec 2026-10-25 §6.1). */
export type RuleGroupDateField = 'jiraCreatedAt' | 'ideaApprovedDate' | 'startDate' | 'r4gDate' | 'dueDate';

/** One From/To bound of a Rule Group — both ends inclusive, null = open on that side. */
export interface RuleGroupDateRange {
  from: IsoDate | null;
  to: IsoDate | null;
}

/**
 * "Rule Group" (spec 2026-10-25): a range of Epics by their dates + the Rule objects that judge them. An Epic belongs
 * to the highest-priority enabled group whose every condition it meets; otherwise to the default group.
 */
export interface ScoringRuleGroup {
  id: number;
  name: string;
  /** 1 = highest. Ignored for the default group, which always comes last. */
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  conditions: Partial<Record<RuleGroupDateField, RuleGroupDateRange>>;
  /** Ids of the selectable Rule objects (registry.ts) this group runs; unknown ids are ignored. */
  ruleIds: readonly string[];
}

/** The group an Epic was judged by, as stored on its scorecard. */
export interface ScorecardRuleGroup {
  id: number;
  name: string;
  isDefault: boolean;
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
  /** Rule Groups (spec 2026-10-25). Absent or without a default group → the default group built in code
   * (DEFAULT_RULE_GROUP in registry.ts: every Rule object with defaultSelected), i.e. today's behavior. */
  ruleGroups?: readonly ScoringRuleGroup[];
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
  /** "Bộ ngân sách" the TTM-CNTT / TTM-E2E budgets below were read from. */
  cnttPolicySet: string;
  e2ePolicySet: string;
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
  /** The Rule Group that judged the Epic; null for an "Epic ngoại lệ" (not judged at all). */
  ruleGroup: ScorecardRuleGroup | null;
  /** Every finding, suppressed ones included, sorted by badge precedence within axis. */
  findings: Finding[];
  indexMembership: IndexMembership;
  derived: DerivedMetrics;
}
