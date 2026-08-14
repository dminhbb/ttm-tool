import type { AlertLevel, EpicComplexity } from '@/lib/ttm-rules';

export type StagePillVariant = 'done' | 'earlyAlert' | 'lateAlert' | 'unknown' | 'upcoming';

export interface StageCell {
  dateLabel: string | null;
  isCurrentStage: boolean;
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
  hasAlertHistory: boolean;
  missingStandardInfo: string[];
  ownerName: string;
  projectKey: string;
  r4gDate: string | null;
  remainingWorkingDays: number | null;
  requirementLevel: string | null;
  sourceType: 'CSV';
  stages: {
    design: StageCell;
    inProgress: StageCell;
    r4g: StageCell;
    release: StageCell;
  };
  t0IdeaApprovedDate: string | null;
  t1StartDate: string | null;
  ttmCnttFromDate: string | null;
  ttmCnttFromField: string | null;
  ttmCnttToField: string | null;
  targetR4gDate: string | null;
  ttmCnttElapsedWorkingDays: number | null;
  ttmCnttTargetWorkingDays: number;
  ttmE2eElapsedWorkingDays: number | null;
  ttmE2eTargetWorkingDays: number;
}

export type EpicAlertAccessRole = 'CBQL_PHONG' | 'LEAD' | 'PM_SM';

export interface EpicAlertResponse {
  accessRole: EpicAlertAccessRole;
  lastAggregatedAt: string | null;
  rows: EpicAlertRow[];
  viewerName: string;
}

/** Two-line cell for the phase-split screen ("Quản lý Epic 15"): baseline (top) vs actual (bottom). */
export interface PhaseCell {
  actualDate: string | null;
  baselineDate: string | null;
  /** True when the Epic's current status is already past this phase's mapped status. */
  isPastStatus: boolean;
}

export interface EpicAlertRowPhased {
  alertLevel: AlertLevel;
  /** Raw Jira "Assignee" on the Epic — distinct from ownerName (the project's configured PM/SM). */
  assigneeName: string;
  currentStatus: string;
  /** Which import data layer (aggregated_at) this Epic's row currently comes from. */
  dataLayerDate: string | null;
  domainName: string;
  epicKey: string;
  epicName: string;
  epicType: EpicComplexity | null;
  hasAlertHistory: boolean;
  missingStandardInfo: string[];
  /** PM/SM of the Epic's project (projects.lead_name) — not the Jira assignee. */
  ownerName: string;
  projectKey: string;
  /** Human-readable project name (projects.project_name), distinct from projectKey. */
  projectName: string;
  r4gDate: string | null;
  remainingWorkingDays: number | null;
  requirementLevel: string | null;
  sourceType: 'CSV';
  stages: {
    design: PhaseCell;
    dev: PhaseCell;
    pentest: PhaseCell;
    r4golive: PhaseCell;
    release: PhaseCell;
    test: PhaseCell;
  };
  t0IdeaApprovedDate: string | null;
  t1StartDate: string | null;
  targetR4gDate: string | null;
  ttmCnttElapsedWorkingDays: number | null;
  ttmCnttFromDate: string | null;
  ttmCnttFromField: string | null;
  ttmCnttTargetWorkingDays: number;
  ttmCnttToField: string | null;
  ttmE2eElapsedWorkingDays: number | null;
  ttmE2eTargetWorkingDays: number;
}

export interface EpicAlertPhasedResponse {
  accessRole: EpicAlertAccessRole;
  lastAggregatedAt: string | null;
  rows: EpicAlertRowPhased[];
  viewerName: string;
}
