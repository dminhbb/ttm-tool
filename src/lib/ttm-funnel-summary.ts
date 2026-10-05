import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { isJustifyGolive, isWaitingGolive, ttmFunnelBucket, type TtmFunnelBucket } from '@/lib/epic-row-verdicts';
import { summarizeE2e, summarizeQaIndex, summarizeTtmCnttFromCounts, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';

/**
 * TTM Dashboard 2 numbers, computed the same way whether they come from the per-scope cache
 * (ttm-dashboard-2-cache-service.ts, unfiltered first load) or from the rows the page loads once a
 * toolbar filter is applied — so a cached number and a recomputed one can never disagree.
 */

/** The only Epic fields the funnel, the widget row, the breakdown matrix, the pie charts, their
 * filters and option lists read. */
export const TTM_FUNNEL_ROW_KEYS = [
  'alertLevel', 'currentStatus', 'domainName', 'epicType', 'hasDataAnomaly', 'ownerName', 'projectKey', 'projectName',
  'qaInScope', 'r4gDate', 'releaseAxisState', 'releaseGraceDeadline', 'requestingUnit', 'scoringBadges',
  'scoringIndexFlags', 'ttmCnttInScope', 'ttmE2eAlertLevel', 'ttmExclusion',
] as const satisfies readonly (keyof DashboardEpicRow)[];

export type TtmFunnelRow = Pick<DashboardEpicRow, (typeof TTM_FUNNEL_ROW_KEYS)[number]>;

export function toTtmFunnelRow(row: TtmFunnelRow): TtmFunnelRow {
  return Object.fromEntries(TTM_FUNNEL_ROW_KEYS.map((key) => [key, row[key]])) as TtmFunnelRow;
}

/** Dimensions the Epics are broken down by — the matrix uses domain/epicType/pmsm/project, the pie
 * chart sections all five. */
export type TtmBreakdownDimension = 'requestingUnit' | 'domain' | 'epicType' | 'pmsm' | 'project';

export const TTM_BREAKDOWN_DIMENSIONS: readonly TtmBreakdownDimension[] = ['requestingUnit', 'domain', 'epicType', 'pmsm', 'project'];

/** One value of a dimension (one matrix row / one pie slice). Counts follow the funnel criteria of
 * the Epics that carry that value. */
export interface TtmBreakdownItem {
  /** Display name (project: its name; otherwise the value itself or its "chưa gán" placeholder). */
  name: string;
  /** Value to filter Quản trị Epic by (project: its key); null for a placeholder ("Chưa gán…"). */
  linkValue: string | null;
  /** L02 — Epic trong phạm vi tính TTM (L01 − Cancelled − Epic ngoại lệ − dự án Time to Market = N). */
  total: number;
  /** L05aa — Epic đạt TTM-CNTT. */
  pass: number;
  /** L05ab + L05ba — Epic không đạt TTM-CNTT (nhóm 1 + nhóm 2). */
  fail: number;
  /** The L05ab part of `fail` (R4G Date past Target); the rest is L05ba (no R4G Date, past Target). */
  failLateR4g: number;
  /** Epics of L03 without a recorded R4G Date (L04b): đúng / chậm tiến độ (chậm = alertLevel FAIL
   * or LATE). "Sai lệch dữ liệu" Epics are NOT here since 2026-10-05 — they get no TTM verdict
   * (alertLevel always NONE under the scoring engine), so they used to pass as "đúng tiến độ". */
  ok: number;
  late: number;
  /** "Sai lệch dữ liệu" Epics of L02 (L02 − L03) — their own column, outside đúng / chậm tiến độ. */
  anomaly: number;
  /** TTM-CNTT (QA) counts of the same Epics (MVP Done / Released, inside the QA scope). */
  qaPass: number;
  qaFail: number;
  qaTotal: number;
}

/** Everything TTM Dashboard 2 shows besides the funnel itself: the widget row's operational tiles,
 * the TTM-CNTT (QA) / TTM-E2E rings and the per-dimension breakdowns (matrix + pie charts). */
export interface TtmDashboard2Insights {
  /** "Sai lệch dữ liệu" among non-Cancelled Epics (same count as TTM Dashboard's tile). */
  anomalyCount: number;
  earlyWarning: number;
  justifyGolive: number;
  lateWarning: number;
  /** True when the rows were scored by the Epic Scoring Service (no "Cảnh báo sớm" then). */
  scoringEngine: boolean;
  /** "Chờ golive": Epics without an R4G Date, and the rest counted per releaseGraceDeadline ('' =
   * none) so "Trong hạn / Quá hạn" can be split against today's date at view time. */
  waitingGolive: { byGraceDeadline: Record<string, number>; missingR4g: number; total: number };
  qa: TtmCnttSummary;
  e2e: TtmCnttSummary;
  breakdowns: Record<TtmBreakdownDimension, TtmBreakdownItem[]>;
}

/**
 * Criteria of the TTM Dashboard 2 funnel (owner naming, 2026-10-04) — the single place their ids and
 * names live. Every criterion is counted inside "Phạm vi dữ liệu cho TTM" (ttmCnttInScope) and the
 * viewer's data scope + toolbar filters; see ttmFunnelBucket for the rule of each leaf.
 */
export const TTM_FUNNEL_CRITERIA = {
  L01: { name: 'Tổng epic', definition: 'Mọi Epic trong phạm vi dữ liệu để tính toán (kể cả Cancelled)' },
  L02: { name: 'Epic trong phạm vi tính TTM', definition: 'L01 − các Epic có status Cancelled − các Epic ngoại lệ (TTM Black listed = true) − các Epic thuộc dự án có Time to Market = N' },
  L03: { name: 'Epic chuẩn hoá dữ liệu', definition: 'L02 − các Epic bị đánh dấu "Sai lệch dữ liệu"' },
  L04a: { name: 'Epic hoàn thành', definition: 'Các Epic có R4G Date trong L03' },
  L04b: { name: 'Epic chưa hoàn thành', definition: 'Các Epic không có R4G Date trong L03' },
  L05aa: { name: 'Epic đạt TTM-CNTT', definition: 'Các Epic Đạt TTM-CNTT trong L04a' },
  L05ab: { name: 'Epic không đạt TTM-CNTT (nhóm 1)', definition: 'Các Epic không Đạt TTM-CNTT trong L04a (R4G Date muộn hơn Target R4G)' },
  L05ac: { name: 'Epic chưa kết luận', definition: 'Các Epic trong L04a có R4G Date còn ở tương lai, hoặc không tính được Target R4G TTM-CNTT' },
  L05ba: { name: 'Epic không đạt TTM-CNTT (nhóm 2)', definition: 'Các Epic trong L04b đã quá Target R4G → Fail TTM-CNTT (QLDA)' },
  L05bb: { name: 'Epic trong hạn', definition: 'Các Epic trong L04b chưa quá Target R4G — vẫn còn cơ hội Đạt TTM-CNTT' },
} as const;

export type TtmFunnelCriterionId = keyof typeof TTM_FUNNEL_CRITERIA;

export interface TtmFunnelSummary {
  /** Epic count per funnel leaf (ttmFunnelBucket) — every Epic is in exactly one. OUT_OF_SCOPE
   * (outside "Phạm vi dữ liệu cho TTM") is counted here but is not part of `total`. */
  buckets: Record<TtmFunnelBucket, number>;
  /** L01 — Epics inside "Phạm vi dữ liệu cho TTM", Cancelled included. */
  total: number;
  /** Every currentStatus present in L01 (its drill-down lists them all, Cancelled included). */
  allStatuses: string[];
  /** The Cancelled ones among them (L02's drill-down). */
  cancelledStatuses: string[];
  /** Every currentStatus among the Epics outside "Phạm vi dữ liệu cho TTM" (their drill-down). */
  outOfScopeStatuses: string[];
  /** L01 popup: how many distinct domains / projects / PM-SM / requesting units. */
  scopeStats: { domains: number; pms: number; projects: number; requestingUnits: number };
  /** Widget row, matrix and pie chart numbers of the same Epic set. */
  insights: TtmDashboard2Insights;
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
  BLACK_LISTED: 0,
  CANCELLED: 0,
  DATA_ANOMALY: 0,
  NO_R4G_OVERDUE: 0,
  NO_R4G_WITHIN_TARGET: 0,
  OUT_OF_SCOPE: 0,
  PROJECT_NON_TTM: 0,
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

const BREAKDOWN_KEY: Record<TtmBreakdownDimension, (row: TtmFunnelRow) => { key: string; linkValue: string | null; name: string }> = {
  requestingUnit: (row) => (row.requestingUnit ? { key: row.requestingUnit, linkValue: row.requestingUnit, name: row.requestingUnit } : { key: '', linkValue: null, name: 'Chưa xác định' }),
  domain: (row) => (row.domainName ? { key: row.domainName, linkValue: row.domainName, name: row.domainName } : { key: '', linkValue: null, name: 'Chưa gán Domain' }),
  // An Epic whose type couldn't be resolved is judged as CT-Lv12 (same default as the rule engine).
  epicType: (row) => ({ key: row.epicType || 'CT-Lv12', linkValue: row.epicType || 'CT-Lv12', name: row.epicType || 'CT-Lv12' }),
  pmsm: (row) => (row.ownerName ? { key: row.ownerName, linkValue: row.ownerName, name: row.ownerName } : { key: '', linkValue: null, name: 'Chưa gán PM/SM' }),
  project: (row) => (row.projectKey ? { key: row.projectKey, linkValue: row.projectKey, name: row.projectName || row.projectKey } : { key: '', linkValue: null, name: 'Chưa gán' }),
};

/** Widget row / matrix / pie chart numbers. `bucketOf` = each row's funnel leaf (already computed by
 * the caller), so a breakdown's columns always add up to the funnel's criteria. */
function summarizeInsights(rows: readonly TtmFunnelRow[], bucketOf: ReadonlyMap<TtmFunnelRow, TtmFunnelBucket>): TtmDashboard2Insights {
  // Same universe as TTM Dashboard's widgets: every non-Cancelled Epic of the viewed set. The
  // operational tiles (Chậm tiến độ, Sai lệch dữ liệu, Chờ / Giải trình golive) keep counting "Epic
  // ngoại lệ" and non-TTM-project Epics — their drill-down lists in Quản trị Epic show those Epics
  // too; only the TTM numbers (matrix columns, the QA / E2E rings) leave them out.
  const active = rows.filter((row) => !isCancelledStatus(row.currentStatus || ''));
  const waitingGolive: TtmDashboard2Insights['waitingGolive'] = { byGraceDeadline: {}, missingR4g: 0, total: 0 };
  let anomalyCount = 0;
  let earlyWarning = 0;
  let justifyGolive = 0;
  let lateWarning = 0;
  for (const row of active) {
    if (row.ttmCnttInScope && row.alertLevel === 'LATE') lateWarning += 1;
    else if (row.ttmCnttInScope && row.alertLevel === 'EARLY') earlyWarning += 1;
    if (row.hasDataAnomaly) anomalyCount += 1;
    if (isJustifyGolive(row)) justifyGolive += 1;
    if (isWaitingGolive(row)) {
      waitingGolive.total += 1;
      if (!row.r4gDate) waitingGolive.missingR4g += 1;
      else waitingGolive.byGraceDeadline[row.releaseGraceDeadline ?? ''] = (waitingGolive.byGraceDeadline[row.releaseGraceDeadline ?? ''] ?? 0) + 1;
    }
  }

  const breakdowns = {} as Record<TtmBreakdownDimension, TtmBreakdownItem[]>;
  for (const dimension of TTM_BREAKDOWN_DIMENSIONS) {
    const groups = new Map<string, { item: TtmBreakdownItem; rows: TtmFunnelRow[] }>();
    for (const row of active) {
      const { key, linkValue, name } = BREAKDOWN_KEY[dimension](row);
      let group = groups.get(key);
      if (!group) {
        group = { item: { anomaly: 0, fail: 0, failLateR4g: 0, late: 0, linkValue, name, ok: 0, pass: 0, qaFail: 0, qaPass: 0, qaTotal: 0, total: 0 }, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
      const bucket = bucketOf.get(row);
      // Not part of L02: outside "Phạm vi dữ liệu cho TTM", "Epic ngoại lệ", project Time to Market = N.
      if (bucket === 'OUT_OF_SCOPE' || bucket === 'BLACK_LISTED' || bucket === 'PROJECT_NON_TTM') continue;
      group.item.total += 1;
      if (bucket === 'R4G_PASS') group.item.pass += 1;
      else if (bucket === 'R4G_LATE' || bucket === 'NO_R4G_OVERDUE') group.item.fail += 1;
      if (bucket === 'R4G_LATE') group.item.failLateR4g += 1;
      if (bucket === 'DATA_ANOMALY') group.item.anomaly += 1;
      // "Đúng / Chậm tiến độ": Epics still on their way to R4G (no R4G Date yet, no Sai lệch dữ liệu).
      if (bucket === 'NO_R4G_OVERDUE' || bucket === 'NO_R4G_WITHIN_TARGET') {
        if (row.alertLevel === 'FAIL' || row.alertLevel === 'LATE') group.item.late += 1;
        else group.item.ok += 1;
      }
    }
    breakdowns[dimension] = [...groups.values()]
      .map(({ item, rows: groupRows }) => {
        const qa = summarizeQaIndex(groupRows);
        return { ...item, qaFail: qa.fail, qaPass: qa.pass, qaTotal: qa.total };
      })
      .filter((item) => item.total > 0 || item.qaTotal > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  }

  return {
    anomalyCount,
    breakdowns,
    e2e: summarizeE2e(active),
    earlyWarning,
    justifyGolive,
    lateWarning,
    qa: summarizeQaIndex(active),
    scoringEngine: rows.some((row) => Boolean(row.scoringBadges)),
    waitingGolive,
  };
}

export function summarizeTtmFunnel(rows: readonly TtmFunnelRow[]): TtmFunnelSummary {
  const buckets = { ...EMPTY_TTM_FUNNEL_BUCKETS };
  const bucketOf = new Map<TtmFunnelRow, TtmFunnelBucket>();
  const allStatuses = new Set<string>();
  const cancelledStatuses = new Set<string>();
  const outOfScopeStatuses = new Set<string>();
  const domains = new Set<string>();
  const projects = new Set<string>();
  const pms = new Set<string>();
  const units = new Set<string>();
  for (const row of rows) {
    const bucket = ttmFunnelBucket(row);
    bucketOf.set(row, bucket);
    buckets[bucket] += 1;
    // Outside "Phạm vi dữ liệu cho TTM": counted in its own bucket only, never part of L01.
    if (bucket === 'OUT_OF_SCOPE') {
      if (row.currentStatus) outOfScopeStatuses.add(row.currentStatus);
      continue;
    }
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
    insights: summarizeInsights(rows, bucketOf),
    outOfScopeStatuses: [...outOfScopeStatuses].sort(),
    scopeStats: { domains: domains.size, pms: pms.size, projects: projects.size, requestingUnits: units.size },
    total: rows.length - buckets.OUT_OF_SCOPE,
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

/** Every criterion L01…L05bb derived from the leaves (L02 = L01 − Cancelled − Epic ngoại lệ −
 * dự án Time to Market = N; L03 = L04a + L04b). */
export function ttmFunnelLayers(summary: TtmFunnelSummary) {
  const { buckets } = summary;
  const l1 = summary.total;
  // `?? 0`: a summary cached before these two buckets existed has no such keys.
  const l2 = l1 - buckets.CANCELLED - (buckets.BLACK_LISTED ?? 0) - (buckets.PROJECT_NON_TTM ?? 0);
  const l3 = l2 - buckets.DATA_ANOMALY;
  const l4a = buckets.R4G_PASS + buckets.R4G_LATE + buckets.R4G_NOT_SCORED;
  const l4b = buckets.NO_R4G_OVERDUE + buckets.NO_R4G_WITHIN_TARGET;
  return {
    l1, l2, l3, l4a, l4b,
    l5aa: buckets.R4G_PASS, l5ab: buckets.R4G_LATE, l5ac: buckets.R4G_NOT_SCORED,
    l5ba: buckets.NO_R4G_OVERDUE, l5bb: buckets.NO_R4G_WITHIN_TARGET,
  };
}

/**
 * TTM-CNTT (QLDA) of the funnel's Epic set — Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba), Tỷ lệ %
 * Fail = (L05ab + L05ba) / the same denominator. Same formula (summarizeTtmCnttFromCounts) as every
 * other TTM-CNTT (QLDA) number in the app, so this never drifts from the header index.
 */
export function ttmFunnelCnttIndex(summary: TtmFunnelSummary): TtmCnttSummary {
  const { l2, l4a, l5aa, l5ab, l5ba } = ttmFunnelLayers(summary);
  return summarizeTtmCnttFromCounts(l4a, l5aa, l5ab + l5ba, l2);
}

/** "Chờ golive" split against `today` ("YYYY-MM-DD", Vietnam) — same rule as waitingGoliveBucket. */
export function splitWaitingGolive(waitingGolive: TtmDashboard2Insights['waitingGolive'], today: string): { missingR4g: number; overdue: number; withinGrace: number } {
  let withinGrace = 0;
  let overdue = 0;
  for (const [deadline, count] of Object.entries(waitingGolive.byGraceDeadline)) {
    if (deadline && today <= deadline) withinGrace += count;
    else overdue += count;
  }
  return { missingR4g: waitingGolive.missingR4g, overdue, withinGrace };
}

/** A breakdown item's TTM-CNTT (QLDA) / TTM-CNTT (QA) ratios — the app-wide formula. */
export function breakdownIndexes(item: TtmBreakdownItem): { qa: TtmCnttSummary; qlda: TtmCnttSummary } {
  return {
    qa: summarizeTtmCnttFromCounts(item.qaPass + item.qaFail, item.qaPass, item.qaFail, item.qaTotal),
    qlda: summarizeTtmCnttFromCounts(item.pass + item.fail, item.pass, item.fail, item.total),
  };
}
