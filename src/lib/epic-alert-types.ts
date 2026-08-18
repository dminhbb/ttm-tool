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
  /** Start of the "stripe thực tế" (actual strip) — see resolveTtmActualRange in epic-alert-service.ts. */
  ttmActualElapsedWorkingDays: number | null;
  ttmActualFromDate: string | null;
  ttmActualToDate: string | null;
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

/** Cell for "Quản trị Epic": a baseline date, plus an `isDone` flag evaluated live every request
 * (completion dates are no longer recorded — see epic-phase-completion-service.ts). How these
 * render (background color, optional date text) is the frontend's call. */
export interface PhaseCell {
  /** NONE/EARLY/LATE per the phase's own baseline (see ttm-phase-rules.ts's computeComponentPhaseAlerts). FAIL is unused here. */
  alertLevel: AlertLevel;
  baselineDate: string | null;
  /** Human label of the field the baseline was counted from (e.g. "Idea Approved Date (T0)"), for
   * cells whose baseline is anchored to a specific recorded date rather than the phase chain — only
   * Release currently sets this. Null when not applicable. */
  baselineSourceDate: string | null;
  baselineSourceLabel: string | null;
  /** True for the single phase Epic 15 considers "giai đoạn hiện tại" of this Epic. */
  isCurrentStage: boolean;
  isDone: boolean;
}

export interface EpicAlertRowPhased {
  alertLevel: AlertLevel;
  currentStatus: string;
  /** Which import data layer (aggregated_at) this Epic's row currently comes from. */
  dataLayerDate: string | null;
  domainName: string;
  /** issues.due_date — shown on the Release cell's bottom line when present. */
  dueDate: string | null;
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
  /** Range of the "stripe thực tế" (actual strip) — see resolveTtmActualRange in epic-alert-service.ts. */
  ttmActualElapsedWorkingDays: number | null;
  ttmActualFromDate: string | null;
  ttmActualToDate: string | null;
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
