import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { ttmFunnelBucket, type TtmFunnelBucket } from '@/lib/epic-row-verdicts';

/**
 * TTM Dashboard 2 numbers, computed the same way whether they come from the per-scope cache
 * (ttm-dashboard-2-cache-service.ts, unfiltered first load) or from the rows the page loads once a
 * toolbar filter is applied — so a cached number and a recomputed one can never disagree.
 */

/** The only Epic fields the funnel, its filters and its option lists read. */
export const TTM_FUNNEL_ROW_KEYS = [
  'alertLevel', 'currentStatus', 'domainName', 'hasDataAnomaly', 'ownerName', 'projectKey', 'r4gDate',
  'requestingUnit', 'scoringIndexFlags', 'ttmCnttInScope',
] as const satisfies readonly (keyof DashboardEpicRow)[];

export type TtmFunnelRow = Pick<DashboardEpicRow, (typeof TTM_FUNNEL_ROW_KEYS)[number]>;

export function toTtmFunnelRow(row: TtmFunnelRow): TtmFunnelRow {
  return {
    alertLevel: row.alertLevel,
    currentStatus: row.currentStatus,
    domainName: row.domainName,
    hasDataAnomaly: row.hasDataAnomaly,
    ownerName: row.ownerName,
    projectKey: row.projectKey,
    r4gDate: row.r4gDate,
    requestingUnit: row.requestingUnit,
    scoringIndexFlags: row.scoringIndexFlags,
    ttmCnttInScope: row.ttmCnttInScope,
  };
}

export interface TtmFunnelSummary {
  /** Epic count per funnel leaf (ttmFunnelBucket) — every Epic is in exactly one. */
  buckets: Record<TtmFunnelBucket, number>;
  total: number;
  /** Every currentStatus present (Layer 1's drill-down lists them all, Cancelled included). */
  allStatuses: string[];
  /** The Cancelled ones among them (Layer 2's drill-down). */
  cancelledStatuses: string[];
  /** Layer 1 popup: how many distinct domains / projects / PM-SM / requesting units. */
  scopeStats: { domains: number; pms: number; projects: number; requestingUnits: number };
}

export interface TtmDashboard2FilterOptions {
  domainProjectKeys: Record<string, string[]>;
  domains: string[];
  pmSms: string[];
  projects: string[];
  requestingUnits: string[];
}

export interface TtmDashboard2Filters {
  domain: string;
  pmSms: string[];
  projects: string[];
  requestingUnits: string[];
}

export function hasActiveTtmDashboard2Filter(filters: TtmDashboard2Filters): boolean {
  return Boolean(filters.domain || filters.projects.length || filters.pmSms.length || filters.requestingUnits.length);
}

export const EMPTY_TTM_FUNNEL_BUCKETS: Readonly<Record<TtmFunnelBucket, number>> = {
  CANCELLED: 0,
  DATA_ANOMALY: 0,
  NO_R4G_OVERDUE: 0,
  NO_R4G_WITHIN_TARGET: 0,
  OUT_OF_SCOPE: 0,
  R4G_LATE: 0,
  R4G_NOT_SCORED: 0,
  R4G_PASS: 0,
};

function ownerNames(row: Pick<TtmFunnelRow, 'ownerName'>): string[] {
  return (row.ownerName || '').split(',').map((name) => name.trim()).filter(Boolean);
}

export function filterTtmDashboard2Rows<T extends TtmFunnelRow>(rows: readonly T[], filters: TtmDashboard2Filters): T[] {
  return rows.filter((row) => {
    if (filters.projects.length > 0 && !filters.projects.includes(row.projectKey)) return false;
    if (filters.domain && row.domainName !== filters.domain) return false;
    if (filters.pmSms.length > 0 && !ownerNames(row).some((name) => filters.pmSms.includes(name))) return false;
    if (filters.requestingUnits.length > 0 && (!row.requestingUnit || !filters.requestingUnits.includes(row.requestingUnit))) return false;
    return true;
  });
}

export function summarizeTtmFunnel(rows: readonly TtmFunnelRow[]): TtmFunnelSummary {
  const buckets = { ...EMPTY_TTM_FUNNEL_BUCKETS };
  const allStatuses = new Set<string>();
  const cancelledStatuses = new Set<string>();
  const domains = new Set<string>();
  const projects = new Set<string>();
  const pms = new Set<string>();
  const units = new Set<string>();
  for (const row of rows) {
    const bucket = ttmFunnelBucket(row);
    buckets[bucket] += 1;
    if (row.currentStatus) {
      allStatuses.add(row.currentStatus);
      if (bucket === 'CANCELLED') cancelledStatuses.add(row.currentStatus);
    }
    if (row.domainName) domains.add(row.domainName);
    if (row.projectKey) projects.add(row.projectKey);
    if (row.requestingUnit) units.add(row.requestingUnit);
    for (const name of ownerNames(row)) pms.add(name);
  }
  return {
    allStatuses: [...allStatuses].sort(),
    buckets,
    cancelledStatuses: [...cancelledStatuses].sort(),
    scopeStats: { domains: domains.size, pms: pms.size, projects: projects.size, requestingUnits: units.size },
    total: rows.length,
  };
}

export function buildTtmDashboard2FilterOptions(rows: readonly TtmFunnelRow[]): TtmDashboard2FilterOptions {
  const domainProjects = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.domainName || !row.projectKey) continue;
    domainProjects.set(row.domainName, (domainProjects.get(row.domainName) ?? new Set<string>()).add(row.projectKey));
  }
  const byVi = (a: string, b: string) => a.localeCompare(b, 'vi');
  return {
    domainProjectKeys: Object.fromEntries([...domainProjects].map(([domain, keys]) => [domain, [...keys].sort()])),
    domains: [...domainProjects.keys()].sort(),
    pmSms: [...new Set(rows.flatMap(ownerNames))].sort(byVi),
    projects: [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(),
    requestingUnits: [...new Set(rows.map((row) => row.requestingUnit).filter((unit): unit is string => Boolean(unit)))].sort(byVi),
  };
}

/** Layer totals derived from the leaves (L3 = L4A + L4B + L4C). */
export function ttmFunnelLayers(summary: TtmFunnelSummary) {
  const { buckets } = summary;
  const l1 = summary.total;
  const l2 = l1 - buckets.CANCELLED;
  const l3 = l2 - buckets.DATA_ANOMALY;
  const l4a = buckets.R4G_PASS + buckets.R4G_LATE + buckets.R4G_NOT_SCORED;
  const l4b = buckets.NO_R4G_OVERDUE + buckets.NO_R4G_WITHIN_TARGET;
  return { l1, l2, l3, l4a, l4b };
}
