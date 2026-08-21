import type { UserRole } from '@/lib/auth-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import type {
  DashboardAtRiskEpic,
  DashboardAvailableProject,
  DashboardProjectStats,
  DashboardResponse,
  DashboardStats,
} from '@/lib/dashboard-types';

/** Epics with this many working days or fewer left to their TTM-CNTT target (and not already
 * FAIL) count as "sắp đến hạn" — deliberately the same horizon as a single sprint. */
const DASHBOARD_UPCOMING_DEADLINE_WINDOW_DAYS = 5;
/** How many rows the "Epic cần chú ý nhất" list shows, per stats block. */
const DASHBOARD_TOP_AT_RISK_LIMIT = 5;

/** Combined severity across both alerts — FAIL on either TTM-CNTT or TTM-E2E ranks above a plain
 * LATE/EARLY on TTM-CNTT alone. */
function combinedSeverity(alertLevel: AlertLevel, ttmE2eAlertLevel: AlertLevel): number {
  if (alertLevel === 'FAIL' || ttmE2eAlertLevel === 'FAIL') return 0;
  if (alertLevel === 'LATE') return 1;
  if (alertLevel === 'EARLY') return 2;
  return 3;
}

/**
 * Pure aggregation over whatever slice of rows the caller passes in — called once for "overall"
 * (every selected project's rows together) and once per project (that project's rows only), so the
 * two levels can never disagree on how a number is derived.
 */
export function computeDashboardStats(rows: EpicAlertRowPhased[]): DashboardStats {
  const statusCounts = new Map<string, number>();
  let failCntt = 0;
  let failE2e = 0;
  let lateWarning = 0;
  let earlyWarning = 0;
  let simple = 0;
  let complex = 0;
  let missingDataCount = 0;
  let achievedTtmCount = 0;
  let achievedTtmEligibleCount = 0;
  let upcomingDeadlineCount = 0;

  for (const row of rows) {
    statusCounts.set(row.currentStatus, (statusCounts.get(row.currentStatus) ?? 0) + 1);
    if (row.alertLevel === 'FAIL') failCntt += 1;
    else if (row.alertLevel === 'LATE') lateWarning += 1;
    else if (row.alertLevel === 'EARLY') earlyWarning += 1;
    if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
    if (row.epicType === 'COMPLEX') complex += 1;
    else if (row.epicType === 'SIMPLE') simple += 1;
    if (row.missingStandardInfo.length > 0) missingDataCount += 1;
    if (row.r4gDate) {
      achievedTtmEligibleCount += 1;
      if (row.alertLevel === 'NONE') achievedTtmCount += 1;
    }
    if (row.alertLevel !== 'FAIL' && row.remainingWorkingDays !== null && row.remainingWorkingDays >= 0 && row.remainingWorkingDays <= DASHBOARD_UPCOMING_DEADLINE_WINDOW_DAYS) {
      upcomingDeadlineCount += 1;
    }
  }

  const topAtRisk: DashboardAtRiskEpic[] = [...rows]
    .filter((row) => row.alertLevel !== 'NONE' || row.ttmE2eAlertLevel === 'FAIL')
    .sort((a, b) => {
      const rankDiff = combinedSeverity(a.alertLevel, a.ttmE2eAlertLevel) - combinedSeverity(b.alertLevel, b.ttmE2eAlertLevel);
      if (rankDiff !== 0) return rankDiff;
      return (a.remainingWorkingDays ?? Infinity) - (b.remainingWorkingDays ?? Infinity);
    })
    .slice(0, DASHBOARD_TOP_AT_RISK_LIMIT)
    .map((row) => ({
      alertLevel: row.alertLevel,
      epicKey: row.epicKey,
      epicName: row.epicName,
      projectKey: row.projectKey,
      remainingWorkingDays: row.remainingWorkingDays,
      ttmE2eAlertLevel: row.ttmE2eAlertLevel,
    }));

  return {
    achievedTtmCount,
    achievedTtmEligibleCount,
    alerts: { earlyWarning, failCntt, failE2e, lateWarning },
    complexity: { complex, simple },
    epicCount: rows.length,
    missingDataCount,
    statusDistribution: [...statusCounts.entries()]
      .map(([status, count]) => ({ count, status }))
      .sort((a, b) => b.count - a.count),
    topAtRisk,
    upcomingDeadlineCount,
  };
}

function projectDisplayName(rows: EpicAlertRowPhased[]): string {
  return rows.find((row) => row.projectName)?.projectName ?? rows[0]?.projectKey ?? '';
}

/**
 * Full dashboard payload for one user. `selectedProjectKeys` is optional/ignored when the caller
 * doesn't need the gate (see resolveDashboardGate below) — every accessible row is used instead.
 * Always recomputed live off the same "Quản trị Epic (đầy đủ)" pipeline (getEpicAlertRowsPhased) —
 * no separate snapshot/aggregate table exists to read from instead (see epic-alert-phase-service.ts).
 */
export async function getDashboardData(userId: number, role: UserRole, selectedProjectKeys: string[] | null): Promise<DashboardResponse> {
  const context = await getEpicAlertRowsPhased(userId, role);

  const rowsByProject = new Map<string, EpicAlertRowPhased[]>();
  for (const row of context.rows) {
    if (!row.projectKey) continue;
    rowsByProject.set(row.projectKey, [...(rowsByProject.get(row.projectKey) ?? []), row]);
  }

  const availableProjects: DashboardAvailableProject[] = [...rowsByProject.entries()]
    .map(([projectKey, rows]) => ({ epicCount: rows.length, projectKey, projectName: projectDisplayName(rows) }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'vi'));

  // SUPERVISOR/SUPERADMIN/ADMIN always gate (their accessible project set is system-wide by
  // definition); a USER (PM/SM) only gates once they'd otherwise be dumped into 4+ project panels
  // at once.
  const requiresSelection = role !== 'USER' || availableProjects.length >= 4;

  const effectiveSelection = requiresSelection
    ? (selectedProjectKeys ?? []).filter((key) => rowsByProject.has(key))
    : availableProjects.map((project) => project.projectKey);

  if (requiresSelection && effectiveSelection.length === 0) {
    return {
      accessRole: context.accessRole,
      availableProjects,
      lastAggregatedAt: context.lastAggregatedAt,
      overall: null,
      perProject: [],
      requiresSelection: true,
      selectedProjects: [],
    };
  }

  const selectedRows = effectiveSelection.flatMap((key) => rowsByProject.get(key) ?? []);
  const perProject: DashboardProjectStats[] = effectiveSelection
    .map((projectKey) => {
      const rows = rowsByProject.get(projectKey) ?? [];
      return { ...computeDashboardStats(rows), projectKey, projectName: projectDisplayName(rows) };
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'vi'));

  return {
    accessRole: context.accessRole,
    availableProjects,
    lastAggregatedAt: context.lastAggregatedAt,
    overall: computeDashboardStats(selectedRows),
    perProject,
    requiresSelection,
    selectedProjects: effectiveSelection,
  };
}
