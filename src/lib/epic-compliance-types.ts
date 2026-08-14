import type { AlertLevel, EpicComplexity, OffsetRule } from '@/lib/ttm-rules';

/** Literal Jira type; hierarchy is resolved by issue-hierarchy.ts. */
export type ComplianceIssueType = string;

export type ComplianceState = 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT' | 'NOT_EVALUABLE' | 'NOT_APPLICABLE';
export type ComplianceSeverity = 'ERROR' | 'INFO' | 'WARNING';

export interface ComplianceIssueInput {
  dueDate?: string | null;
  epicComplexityType?: EpicComplexity | null;
  epicKey?: string | null;
  ideaApprovedDate?: string | null;
  issueKey: string;
  issueType: ComplianceIssueType;
  parentKey?: string | null;
  r4gDate?: string | null;
  startDate?: string | null;
  status: string;
}

export interface BaselineMilestone {
  date: string | null;
  earlyAlertDate?: string | null;
  lateAlertDate?: string | null;
  rule?: OffsetRule;
}

export interface ComplianceFinding {
  code: string;
  message: string;
  severity: ComplianceSeverity;
}

export interface ComplianceIssueResult {
  alertLevel: AlertLevel;
  baseline: {
    design: BaselineMilestone | null;
    inProgress: BaselineMilestone | null;
    r4g: BaselineMilestone | null;
    released: BaselineMilestone | null;
  };
  compliance: ComplianceState;
  findings: ComplianceFinding[];
  issueKey: string;
  issueType: ComplianceIssueType;
  hierarchyLevel: 1 | 2 | 3;
  status: string;
  workflow: {
    isSpecialStatus: boolean;
    statusKnown: boolean;
    statusOrder: number | null;
    type: 'EPIC' | 'STORY' | 'SUBTASK';
  };
  ttm: {
    cntt: TtmBaseline;
    e2e: TtmBaseline;
  };
}

export interface TtmBaseline {
  fromDate: string | null;
  fromField: string | null;
  targetDate: string | null;
  toField: string | null;
  workingDays: number | null;
}

export interface ComplianceEvaluationResponse {
  evaluatedAt: string;
  items: ComplianceIssueResult[];
}
