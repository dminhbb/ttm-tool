import type { AlertLevel, EpicComplexity } from '@/lib/ttm-rules';

export type StagePillVariant = 'd1' | 'd2' | 'd3' | 'done' | 'overdue' | 'unknown' | 'upcoming';

export interface StageCell {
  dateLabel: string | null;
  pillLabel: string;
  pillVariant: StagePillVariant;
  planLabel: string;
}

export interface EpicAlertRow {
  alertLevel: AlertLevel;
  currentStatus: string;
  domainName: string;
  epicKey: string;
  epicName: string;
  epicType: EpicComplexity | null;
  missingStandardInfo: string[];
  ownerName: string;
  projectKey: string;
  r4gDate: string | null;
  remainingWorkingDays: number | null;
  sourceType: 'CSV';
  stages: {
    design: StageCell;
    inProgress: StageCell;
    r4g: StageCell;
    release: StageCell;
  };
  t0IdeaApprovedDate: string | null;
  t1StartDate: string | null;
  targetR4gDate: string | null;
  ttmCnttElapsedWorkingDays: number | null;
  ttmCnttTargetWorkingDays: number;
  ttmE2eElapsedWorkingDays: number | null;
  ttmE2eTargetWorkingDays: number;
}

export type EpicAlertAccessRole = 'CBQL_PHONG' | 'LEAD' | 'PM_SM';

export interface EpicAlertResponse {
  accessRole: EpicAlertAccessRole;
  from: string;
  lastAggregatedAt: string | null;
  rows: EpicAlertRow[];
  to: string;
  viewerName: string;
}
