import type { AlertLevel } from '@/lib/ttm-rules';
import type { EpicAlertAccessRole } from '@/lib/epic-alert-types';

export interface DashboardStatusCount {
  count: number;
  status: string;
}

export interface DashboardAtRiskEpic {
  alertLevel: AlertLevel;
  epicKey: string;
  epicName: string;
  projectKey: string;
  remainingWorkingDays: number | null;
  ttmE2eAlertLevel: AlertLevel;
}

/** One set of aggregated numbers — computed identically for "overall" (every selected project
 * combined) and for each individual project's own panel, from the same EpicAlertRowPhased rows
 * "Quản trị Epic (đầy đủ)" already uses (see computeDashboardStats in dashboard-service.ts). */
export interface DashboardStats {
  /** Epics with alertLevel NONE and a recorded R4G Date — "Đạt TTM". */
  achievedTtmCount: number;
  /** Epics with a recorded R4G Date — the denominator achievedTtmCount is a ratio of. */
  achievedTtmEligibleCount: number;
  alerts: {
    earlyWarning: number;
    failCntt: number;
    failE2e: number;
    lateWarning: number;
  };
  complexity: {
    complex: number;
    simple: number;
  };
  epicCount: number;
  missingDataCount: number;
  statusDistribution: DashboardStatusCount[];
  /** Highest-severity epics (FAIL first, then LATE/EARLY, then soonest remaining working days),
   * capped at DASHBOARD_TOP_AT_RISK_LIMIT. */
  topAtRisk: DashboardAtRiskEpic[];
  /** Epics with remainingWorkingDays within DASHBOARD_UPCOMING_DEADLINE_WINDOW_DAYS and not FAIL. */
  upcomingDeadlineCount: number;
}

export interface DashboardProjectStats extends DashboardStats {
  projectKey: string;
  projectName: string;
}

export interface DashboardAvailableProject {
  epicCount: number;
  projectKey: string;
  projectName: string;
}

export interface DashboardMeta {
  accessRole: EpicAlertAccessRole;
  availableProjects: DashboardAvailableProject[];
  /** True when the caller must pick 1–3 projects (see resolveDashboardGate in dashboard-service.ts)
   * before /api/dashboard?projects=... returns computed stats. */
  requiresSelection: boolean;
}

export interface DashboardResponse extends DashboardMeta {
  lastAggregatedAt: string | null;
  overall: DashboardStats | null;
  perProject: DashboardProjectStats[];
  selectedProjects: string[];
}

export const DASHBOARD_MAX_SELECTABLE_PROJECTS = 3;
export const DASHBOARD_MIN_SELECTABLE_PROJECTS = 1;
