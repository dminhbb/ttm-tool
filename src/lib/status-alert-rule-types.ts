export const EPIC_COMPLEXITY_TYPES = ['SIMPLE', 'COMPLEX'] as const;
export const DEFAULT_EPIC_STATUSES = ['Design', 'In Progress'] as const;

export type EpicComplexityType = (typeof EPIC_COMPLEXITY_TYPES)[number];

export interface StatusAlertRule {
  createdAt: string;
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  id: number;
  isActive: boolean;
  lateAlertOffsetDays: number;
  updatedAt: string;
}

export interface StatusAlertRuleInput {
  earlyAlertOffsetDays: number;
  epicComplexityType: EpicComplexityType;
  epicStatus: string;
  isActive: boolean;
  lateAlertOffsetDays: number;
}
