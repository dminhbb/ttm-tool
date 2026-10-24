import type { AlertLevel, EpicComplexity } from '@/lib/ttm-rules';
import type { EpicAnomalyViolation } from '@/lib/epic-data-anomaly';
import type { Finding, TtmExclusion } from '@/lib/scoring/types';

export type { EpicAnomalyViolation } from '@/lib/epic-data-anomaly';

/** "Trục Release" state kept on the row for the readers that still show one value; the badges (scoringBadges) carry the full picture. */
export type ReleaseAxisState = 'NONE' | 'WAITING_GOLIVE' | 'EARLY_WARNING' | 'JUSTIFY_GOLIVE';

export type EpicAlertAccessRole = 'CBQL_PHONG' | 'LEAD' | 'PM_SM';

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
  /** issues.components (Epic's own Jira Component/s) — used by the Components filter. */
  components: string[];
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
  /** True when this Epic breaks any "sai lệch dữ liệu" rule — see the ANOMALY_R* badges of the
   * Epic Scoring Service (scoring/rules/data-quality.ts). alertLevel and ttmE2eAlertLevel are forced to 'NONE' whenever this is
   * true; the frontend shows "Không tính được", groups these rows at the bottom (highlighted) and
   * lists dataAnomalyViolations so the user knows exactly what to complete. */
  hasDataAnomaly: boolean;
  /** Every rule this Epic currently violates (empty when hasDataAnomaly is false). */
  dataAnomalyViolations: EpicAnomalyViolation[];
  missingStandardInfo: string[];
  /** PM/SM of the Epic's project — comma-joined when there are several, derived live from
   * user_projects (getProjectMetaByProjectKeyMap) — not the Jira assignee. */
  ownerName: string;
  projectKey: string;
  /** Human-readable project name (projects.project_name), distinct from projectKey. */
  projectName: string;
  r4gDate: string | null;
  /** "Trục Release" (Chờ golive/Cảnh báo sớm/Giải trình Golive) — see the RELEASE_* badges of the
   * Epic Scoring Service (scoring/rules/release.ts). 'NONE' when nothing to say on this axis (either genuinely clean, or the
   * RELEASE_STATUS_MISMATCH anomaly rule owns the badge instead — see epic-data-anomaly.ts). */
  releaseAxisState: ReleaseAxisState;
  /** R4G Date + RELEASE_DUE_GRACE_WORKING_DAYS working days — null until R4G Date is recorded. */
  releaseGraceDeadline: string | null;
  remainingWorkingDays: number | null;
  /** "Đơn vị yêu cầu" — issues.requesting_unit. */
  requestingUnit: string | null;
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
  /** "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo) — see computeTtmCnttInScope in
   * ttm-scope-config-service.ts. False hides the Nhận xét cell's TTM-CNTT badges (FAIL/LATE/EARLY/
   * NONE/Sai Status/Đạt) behind a neutral "Ngoài phạm vi TTM-CNTT" state instead, and excludes this
   * row from every TTM-CNTT pass/fail/eligible count (summarizeTtmCntt). True for every Epic while
   * no admin bound is configured (the default) — never changes existing behavior on its own. */
  ttmCnttInScope: boolean;
  /** Same gate, "R4G for TTM (QA)" bounds — see computeQaInScope. Only narrows QA-Index's own
   * eligible/pass/fail/total; does not affect the TTM-CNTT badge or ttmCnttInScope. */
  qaInScope: boolean;
  /** Range of the "stripe thực tế" (actual strip) — see resolveTtmActualRange in epic-alert-service.ts. */
  ttmActualElapsedWorkingDays: number | null;
  ttmActualFromDate: string | null;
  /** Fail TTM-E2E — see ComplianceIssueResult.e2eAlertLevel. FAIL/NONE only, independent of alertLevel. */
  ttmE2eAlertLevel: AlertLevel;
  ttmActualToDate: string | null;
  ttmCnttElapsedWorkingDays: number | null;
  ttmCnttFromDate: string | null;
  ttmCnttFromField: string | null;
  /** "Sai Status" (TTM-CNTT) — see resolveTtmCnttStatusMismatch in epic-alert-service.ts: R4G Date
   * is recorded and on schedule, but the Epic's status hasn't actually advanced to/past R4GOLIVE
   * yet. The "Nhận xét" cell shows a "Sai Status" badge instead of Đạt/Fail while this is true, and
   * the TTM-CNTT actual stripe stays red (with a "*") even though its length is within budget. */
  ttmCnttStatusMismatch: boolean;
  /** Epic Scoring Service result, present only when the display engine is 'scoring' (see
   * scoring/projection.ts) — the legacy fields above then already carry the projected verdicts.
   * `scoringBadges`: active badge codes (subject-qualified ones twice, e.g. "PHASE_LATE:DEV");
   * `scoringIndexFlags`: TTM-/QA-Index membership (e.g. "TTM_ELIGIBLE"); `scoringFindings`: every
   * finding with its message, for tooltips/detail. */
  /** Only with "Chỉ Epic thay đổi từ ngày X": the Epic's state TODAY, next to the state on the viewed date the row shows. */
  changeSince?: { currentAlertLevel: AlertLevel; currentBadges: string[]; currentStatus: string };
  scoringAsOf?: string;
  scoringBadges?: string[];
  scoringIndexFlags?: string[];
  scoringFindings?: Finding[];
  /** "Epic ngoại lệ" — the Epic has a row in black_listed_epics (shown as a black dot next to its
   * key). Stamped on by applyTtmExclusions (black-listed-epic-service.ts) for both display engines;
   * absent on rows no reader has stamped yet (treated as false). */
  ttmBlackListed?: boolean;
  /** Why this Epic is outside the TTM calculation although not Cancelled (black listed, or its
   * project has Time to Market = N) — see TtmExclusion. Null/absent = counted as usual. */
  ttmExclusion?: TtmExclusion | null;
  ttmCnttTargetWorkingDays: number;
  ttmCnttToField: string | null;
  /** Ends the TTM-E2E "stripe thực tế" (bottom strip) — R4G Date once recorded and in the past,
   * else today. Start of that same strip is stages.release.baselineSourceDate (T0), shared with the
   * baseline strip above it. */
  ttmE2eActualToDate: string | null;
  ttmE2eElapsedWorkingDays: number | null;
  ttmE2eTargetWorkingDays: number;
}

/** The slice of EpicAlertRowPhased that TTM Dashboard (dashboard-new) actually reads — every
 * metric/list/filter there is derived from just these fields, so its API ships this instead of the
 * full row (stages' baselines, strips, timelines… are ~90% of each row's JSON and unused there).
 * Keep DASHBOARD_EPIC_ROW_KEYS in sync: the cache-backed read builds the same shape in SQL from it. */
export const DASHBOARD_EPIC_ROW_KEYS = [
  'alertLevel', 'components', 'currentStatus', 'dataAnomalyViolations', 'domainName', 'dueDate', 'epicKey', 'epicName',
  'epicType', 'hasDataAnomaly', 'ownerName', 'projectKey', 'projectName', 'qaInScope', 'r4gDate',
  'releaseAxisState', 'releaseGraceDeadline', 'requestingUnit', 'scoringBadges', 'scoringIndexFlags',
  'targetR4gDate', 'ttmBlackListed', 'ttmCnttInScope', 'ttmE2eAlertLevel', 'ttmExclusion',
] as const satisfies readonly (keyof EpicAlertRowPhased)[];

export type DashboardEpicRow = Pick<EpicAlertRowPhased, (typeof DASHBOARD_EPIC_ROW_KEYS)[number]> & {
  stages: {
    design: Pick<PhaseCell, 'isCurrentStage'>;
    r4golive: Pick<PhaseCell, 'isCurrentStage'>;
    release: Pick<PhaseCell, 'isDone'>;
  };
};

export function toDashboardEpicRow(row: EpicAlertRowPhased): DashboardEpicRow {
  const slim = Object.fromEntries(DASHBOARD_EPIC_ROW_KEYS.map((key) => [key, row[key]])) as Pick<EpicAlertRowPhased, (typeof DASHBOARD_EPIC_ROW_KEYS)[number]>;
  return {
    ...slim,
    stages: {
      design: { isCurrentStage: row.stages.design.isCurrentStage },
      r4golive: { isCurrentStage: row.stages.r4golive.isCurrentStage },
      release: { isDone: row.stages.release.isDone },
    },
  };
}

export interface EpicAlertPhasedResponse {
  accessRole: EpicAlertAccessRole;
  /** Distinct `issues.aggregated_at` dates, newest first, capped at 365 — the newest 5 render as
   * quick-pick chips in the "Chọn lớp dữ liệu" advanced filter, every older one in a dropdown
   * beside them. */
  availableLayerDates: string[];
  /** Selectable date without an import that day (a weekly snapshot date) → the import day its state comes from ("lấy từ lần import ngày X"). */
  layerDateSources?: Record<string, string>;
  /** With "Chỉ Epic thay đổi từ ngày X": how many Epics exist today that did not yet exist on that date. */
  newSinceCount?: number;
  /** Echoes EpicAlertFilters.asOfDate — see EpicAlertResponse.asOfDate. */
  asOfDate: string | null;
  lastAggregatedAt: string | null;
  rows: EpicAlertRowPhased[];
  viewerName: string;
}
