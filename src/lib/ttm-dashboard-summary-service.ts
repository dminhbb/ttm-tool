import 'server-only';
import pool from '@/lib/db';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { getEpicAlertRowCacheMeta, queryDashboardEpicRows } from '@/lib/epic-alert-row-cache-query-service';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { toDashboardEpicRow } from '@/lib/epic-alert-types';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { summarizeQaIndex, summarizeTtmCntt } from '@/lib/ttm-cntt-qa';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { computeQaInScope, computeTtmCnttInScope } from '@/lib/ttm-scope-rules';
import type { UserRole } from '@/lib/auth-types';

/**
 * Server-side mirror of the "TTM dashboard" screen (src/app/dashboard-new/page.tsx) — that page
 * computes every widget client-side from GET /api/dashboard-new's row set, so an MCP/AI caller
 * (which has no browser) needs the same aggregation done here. Every number below deliberately
 * reuses the exact helpers/rules the page itself uses (summarizeTtmCntt, summarizeQaIndex, the
 * ttmCnttInScope gate, the pipeline-phase classification) — keep them in sync with that page when
 * its widget logic changes.
 */

/** Same row source as GET /api/dashboard-new: epic_alert_row_cache scoped to this viewer when the
 * cache exists, otherwise the live computation. Cancelled Epics are always excluded. */
export async function loadDashboardEpicRows(userId: number, role: UserRole): Promise<{ lastAggregatedAt: string | null; rows: DashboardEpicRow[] }> {
  const cacheMeta = await getEpicAlertRowCacheMeta();
  if (cacheMeta.hasCache) {
    const [scope, latestBatch] = await Promise.all([
      resolveAccessScope(userId, role),
      pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
    ]);
    return { lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null, rows: await queryDashboardEpicRows(scope) };
  }
  const context = await getEpicAlertRowsPhased(userId, role);
  return {
    lastAggregatedAt: context.lastAggregatedAt,
    rows: context.rows.filter((row) => !isCancelledStatus(row.currentStatus || '')).map(toDashboardEpicRow),
  };
}

export type DashboardDimension = 'domain' | 'project' | 'pmsm' | 'epicType' | 'requestingUnit';

export interface TtmDashboardSummaryFilters {
  domain?: string;
  /** Breakdown-matrix dimension (the "Phân tích theo" selector on the page). Default 'project'. */
  dimension?: DashboardDimension;
  /** Max Epics listed per detail list (waiting golive, pending, anomaly, ...). */
  listLimit?: number;
  pmSm?: string;
  projectKeys?: string[];
  /** "Phạm vi dữ liệu cho TTM" override (the page's Advanced Filters). undefined = keep the admin
   * default already baked into each row; null = explicitly unbounded. */
  ttmScopeCnttFrom?: string | null;
  ttmScopeCnttTo?: string | null;
  ttmScopeQaFrom?: string | null;
  ttmScopeQaTo?: string | null;
}

interface CompactEpic {
  alertLevel: string;
  currentStatus: string;
  domainName: string | null;
  epicKey: string;
  epicName: string;
  ownerName: string;
  projectKey: string;
  r4gDate: string | null;
  releaseGraceDeadline?: string | null;
  ttmCnttInScope: boolean;
  ttmE2eAlertLevel: string;
}

function compact(row: DashboardEpicRow): CompactEpic {
  return {
    alertLevel: row.alertLevel,
    currentStatus: row.currentStatus,
    domainName: row.domainName,
    epicKey: row.epicKey,
    epicName: row.epicName,
    ownerName: row.ownerName,
    projectKey: row.projectKey,
    r4gDate: row.r4gDate,
    releaseGraceDeadline: row.releaseGraceDeadline,
    ttmCnttInScope: row.ttmCnttInScope,
    ttmE2eAlertLevel: row.ttmE2eAlertLevel,
  };
}

function dimensionKeyOf(row: DashboardEpicRow, dimension: DashboardDimension): string {
  switch (dimension) {
    case 'domain': return row.domainName || 'Chưa gán Domain';
    case 'pmsm': return row.ownerName || 'Chưa gán PM/SM';
    case 'epicType': return row.epicType || 'CT-Lv12';
    case 'requestingUnit': return row.requestingUnit || 'Chưa xác định';
    default: return row.projectName || row.projectKey || 'Chưa gán';
  }
}

function describeIndex(summary: TtmCnttSummary) {
  return { eligible: summary.eligible, fail: summary.fail, pass: summary.pass, pct: Math.round(summary.pctPrecise * 10) / 10, total: summary.total };
}

export async function getTtmDashboardSummary(userId: number, role: UserRole, filters: TtmDashboardSummaryFilters = {}) {
  const [{ lastAggregatedAt, rows: allRows }, ttmIndexGlobal] = await Promise.all([
    loadDashboardEpicRows(userId, role),
    getTtmIndexGlobalCache().catch(() => null),
  ]);

  const hasScopeOverride = [filters.ttmScopeCnttFrom, filters.ttmScopeCnttTo, filters.ttmScopeQaFrom, filters.ttmScopeQaTo].some((value) => value !== undefined);
  const projectKeys = (filters.projectKeys ?? []).map((key) => key.toLowerCase());
  const domain = filters.domain?.toLowerCase();
  const pmSm = filters.pmSm?.toLowerCase();

  const rows = allRows
    .filter((row) => !isCancelledStatus(row.currentStatus || ''))
    .filter((row) => projectKeys.length === 0 || projectKeys.includes(row.projectKey.toLowerCase()))
    .filter((row) => !domain || (row.domainName ?? '').toLowerCase() === domain)
    .filter((row) => !pmSm || row.ownerName.split(',').map((name) => name.trim().toLowerCase()).includes(pmSm))
    .map((row) => {
      if (!hasScopeOverride) return row;
      const config = {
        cnttFrom: filters.ttmScopeCnttFrom ?? null,
        cnttTo: filters.ttmScopeCnttTo ?? null,
        qaFrom: filters.ttmScopeQaFrom ?? null,
        qaTo: filters.ttmScopeQaTo ?? null,
      };
      return { ...row, qaInScope: computeQaInScope(row.r4gDate, config), ttmCnttInScope: computeTtmCnttInScope(row.r4gDate, row.targetR4gDate, config) };
    });

  // Executive KPI tiles — same counting rules as executiveMetrics on the page.
  let lateWarning = 0;
  let earlyWarning = 0;
  let failE2e = 0;
  let dataAnomaly = 0;
  let waitingGolive = 0;
  let releaseEarlyWarning = 0;
  let justifyGolive = 0;
  let outOfScopeCntt = 0;
  const statusDistribution = new Map<string, number>();
  for (const row of rows) {
    if (row.ttmCnttInScope && row.alertLevel === 'LATE') lateWarning += 1;
    else if (row.ttmCnttInScope && row.alertLevel === 'EARLY') earlyWarning += 1;
    if (!row.ttmCnttInScope) outOfScopeCntt += 1;
    if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
    if (row.hasDataAnomaly) dataAnomaly += 1;
    if (row.releaseAxisState === 'WAITING_GOLIVE') waitingGolive += 1;
    else if (row.releaseAxisState === 'EARLY_WARNING') releaseEarlyWarning += 1;
    else if (row.releaseAxisState === 'JUSTIFY_GOLIVE') justifyGolive += 1;
    const status = row.currentStatus || '(trống)';
    statusDistribution.set(status, (statusDistribution.get(status) ?? 0) + 1);
  }
  const ttmCntt = summarizeTtmCntt(rows);
  const qaIndex = summarizeQaIndex(rows);

  // Pipeline phases — same classification as pipelinePhases on the page.
  const phaseLabels = ['1. To Do', '2. Design', '3. In Progress', '4. Ready for Golive', '5. Released'];
  const phaseBuckets = phaseLabels.map(() => ({ alertCount: 0, count: 0 }));
  for (const row of rows) {
    const status = (row.currentStatus || '').trim().toUpperCase();
    let index = 2;
    if (row.stages.release.isDone && row.dueDate) index = 4;
    else if (status === 'TO DO' || status === 'BACKLOG' || status === 'IN PO') index = 0;
    else if (row.stages.r4golive.isCurrentStage) index = 3;
    else if (row.stages.design.isCurrentStage) index = 1;
    phaseBuckets[index].count += 1;
    if ((row.ttmCnttInScope && (row.alertLevel === 'FAIL' || row.alertLevel === 'LATE')) || row.ttmE2eAlertLevel === 'FAIL') phaseBuckets[index].alertCount += 1;
  }

  // Top 5 risk projects — same as topRiskProjects on the page.
  const riskMap = new Map<string, { fail: number; name: string; projectKey: string; total: number }>();
  for (const row of rows) {
    const key = row.projectKey || 'Chưa gán';
    const bucket = riskMap.get(key) ?? { fail: 0, name: row.projectName || key, projectKey: key, total: 0 };
    bucket.total += 1;
    if ((row.ttmCnttInScope && row.alertLevel === 'FAIL') || row.ttmE2eAlertLevel === 'FAIL') bucket.fail += 1;
    riskMap.set(key, bucket);
  }
  const topRiskProjects = [...riskMap.values()].sort((a, b) => b.fail - a.fail).slice(0, 5);

  // Breakdown matrix — same bucket rules as dimensionMatrix on the page.
  const dimension = filters.dimension ?? 'project';
  const matrix = new Map<string, { late: number; ok: number; rows: DashboardEpicRow[] }>();
  for (const row of rows) {
    const key = dimensionKeyOf(row, dimension);
    const bucket = matrix.get(key) ?? { late: 0, ok: 0, rows: [] };
    bucket.rows.push(row);
    const isQldaJudged = Boolean(row.ttmCnttInScope && row.r4gDate && !row.hasDataAnomaly);
    if (row.ttmCnttInScope && !isQldaJudged) {
      if (row.alertLevel === 'FAIL' || row.alertLevel === 'LATE') bucket.late += 1;
      else bucket.ok += 1;
    }
    matrix.set(key, bucket);
  }
  const breakdown = [...matrix.entries()]
    .map(([name, bucket]) => ({
      name,
      total: bucket.rows.length,
      dungTienDo: bucket.ok,
      chamTienDo: bucket.late,
      ttmIndexQlda: describeIndex(summarizeTtmCntt(bucket.rows)),
      qaIndex: describeIndex(summarizeQaIndex(bucket.rows)),
    }))
    .sort((a, b) => b.total - a.total);

  const listLimit = filters.listLimit ?? 20;
  const listOf = (predicate: (row: DashboardEpicRow) => boolean) => {
    const matched = rows.filter(predicate);
    return { total: matched.length, epics: matched.slice(0, listLimit).map(compact) };
  };

  return {
    lastAggregatedAt,
    appliedFilters: {
      dimension,
      domain: filters.domain ?? null,
      pmSm: filters.pmSm ?? null,
      projectKeys: filters.projectKeys ?? [],
      ttmScopeOverride: hasScopeOverride
        ? { cnttFrom: filters.ttmScopeCnttFrom ?? null, cnttTo: filters.ttmScopeCnttTo ?? null, qaFrom: filters.ttmScopeQaFrom ?? null, qaTo: filters.ttmScopeQaTo ?? null }
        : 'mặc định (Cấu hình cảnh báo → Phạm vi dữ liệu cho TTM)',
    },
    kpi: {
      tongSoEpic: rows.length,
      ttmIndexQlda: describeIndex(ttmCntt),
      qaIndex: describeIndex(qaIndex),
      failTtmCntt: ttmCntt.fail,
      canhBaoMuon: lateWarning,
      canhBaoSom: earlyWarning,
      failTtmE2e: failE2e,
      saiLechDuLieu: dataAnomaly,
      choGolive: waitingGolive,
      canhBaoSomRelease: releaseEarlyWarning,
      giaiTrinhGolive: justifyGolive,
      ngoaiPhamViTtmCntt: outOfScopeCntt,
    },
    ttmIndexGlobal,
    statusDistribution: Object.fromEntries([...statusDistribution.entries()].sort((a, b) => b[1] - a[1])),
    pipelinePhases: phaseLabels.map((label, index) => ({ label, ...phaseBuckets[index] })),
    topRiskProjects,
    breakdown,
    lists: {
      choGolive: listOf((row) => row.releaseAxisState === 'WAITING_GOLIVE'),
      giaiTrinhGolive: listOf((row) => row.releaseAxisState === 'JUSTIFY_GOLIVE'),
      pending: listOf((row) => (row.currentStatus || '').toLowerCase().includes('pending')),
      saiLechDuLieu: listOf((row) => row.hasDataAnomaly),
      failTtmCntt: listOf((row) => row.ttmCnttInScope && row.alertLevel === 'FAIL'),
      failTtmE2e: listOf((row) => row.ttmE2eAlertLevel === 'FAIL'),
    },
    glossary: {
      ttmIndexQlda: 'TTM-Index (QLDA): tỉ lệ Epic Đạt TTM-CNTT trên số Epic đủ điều kiện (đã có R4G Date, không sai lệch dữ liệu, trong phạm vi TTM-CNTT). pct tính theo %.',
      qaIndex: 'QA-Index: cùng tỉ lệ TTM-CNTT nhưng chỉ xét Epic status MVP Done/Released và nằm trong phạm vi "R4G for TTM (QA)".',
      dungTienDo_chamTienDo: 'Chỉ đếm các Epic chưa có phán quyết TTM-CNTT (chưa có R4G Date hoặc đang sai lệch dữ liệu) trong phạm vi TTM-CNTT; Chậm = đang FAIL/LATE.',
      pipelinePhases: 'alertCount = số Epic trong pha đang FAIL/LATE TTM-CNTT hoặc FAIL TTM-E2E.',
      chiTietRule: 'Dùng tool search_product_docs để tra cứu chi tiết các rule tính toán/cảnh báo trong Tài liệu sản phẩm.',
    },
  };
}
