import 'server-only';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';
import { vnTodayIso } from '@/lib/epic-row-verdicts';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { getTtmDashboard2Snapshot, loadTtmDashboard2Rows } from '@/lib/ttm-dashboard-2-cache-service';
import {
  breakdownIndexes,
  filterTtmDashboard2Rows,
  hasActiveTtmDashboard2Filter,
  splitWaitingGolive,
  summarizeTtmFunnel,
  TTM_FUNNEL_CRITERIA,
  ttmFunnelCnttIndex,
  ttmFunnelLayers,
  type TtmBreakdownDimension,
  type TtmDashboard2Filters,
  type TtmFunnelCriterionId,
} from '@/lib/ttm-funnel-summary';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

/**
 * "TTM Dashboard 2" for a caller without a browser (the MCP tool get_ttm_dashboard) — the same
 * numbers the screen shows, from the same source: the per-scope cache when no filter is given,
 * otherwise the viewer's Epic rows filtered and summarized with the screen's own functions
 * (ttm-funnel-summary.ts). Nothing is recomputed differently here, so an AI answer and the screen
 * can't disagree.
 */

export interface TtmDashboard2SummaryFilters {
  /** Breakdown dimension (matrix tabs / pie chart sections). Default 'project'. */
  dimension?: TtmBreakdownDimension;
  domain?: string;
  pmSms?: string[];
  projectKeys?: string[];
  requestingUnits?: string[];
}

function describeIndex(summary: TtmCnttSummary) {
  return {
    denominator: summary.denominator,
    fail: summary.fail,
    failPct: summary.denominator > 0 ? Math.round(summary.failPctPrecise * 10) / 10 : null,
    pass: summary.pass,
    pct: summary.denominator > 0 ? Math.round(summary.pctPrecise * 10) / 10 : null,
  };
}

/** Filter values are matched case-insensitively against the options of the viewer's own scope; a
 * value that matches nothing is kept as typed, so the filter then (correctly) selects no Epic. */
function resolveValues(values: readonly string[] | undefined, options: readonly string[]): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
    .map((value) => options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value);
}

export async function getTtmDashboard2Summary(userId: number, role: UserRole, input: TtmDashboard2SummaryFilters = {}) {
  const [snapshot, ttmIndexGlobal, latestBatch] = await Promise.all([
    getTtmDashboard2Snapshot(userId, role),
    getTtmIndexGlobalCache().catch(() => null),
    pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
  ]);

  const options = snapshot.filterOptions;
  const filters: TtmDashboard2Filters = {
    domain: resolveValues(input.domain ? [input.domain] : [], options.domains)[0] ?? '',
    pmSms: resolveValues(input.pmSms, options.pmSms),
    projects: resolveValues(input.projectKeys, options.projects),
    requestingUnits: resolveValues(input.requestingUnits, options.requestingUnits),
  };
  const funnel = hasActiveTtmDashboard2Filter(filters)
    ? summarizeTtmFunnel(filterTtmDashboard2Rows(await loadTtmDashboard2Rows(userId, role), filters))
    : snapshot.summary;

  const layers = ttmFunnelLayers(funnel);
  const counts: Record<TtmFunnelCriterionId, number> = {
    L01: layers.l1, L02: layers.l2, L03: layers.l3, L04a: layers.l4a, L04b: layers.l4b,
    L05aa: layers.l5aa, L05ab: layers.l5ab, L05ac: layers.l5ac, L05ba: layers.l5ba, L05bb: layers.l5bb,
  };
  const { insights } = funnel;
  const waiting = splitWaitingGolive(insights.waitingGolive, vnTodayIso());
  const dimension = input.dimension ?? 'project';

  return {
    screen: 'TTM Dashboard 2 (/ttm-dashboard-2)',
    lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null,
    appliedFilters: { dimension, domain: filters.domain || null, pmSms: filters.pmSms, projectKeys: filters.projects, requestingUnits: filters.requestingUnits },
    funnel: {
      criteria: (Object.keys(TTM_FUNNEL_CRITERIA) as TtmFunnelCriterionId[]).map((id) => ({ id, ...TTM_FUNNEL_CRITERIA[id], count: counts[id] })),
      cancelled: funnel.buckets.CANCELLED,
      epicNgoaiLe: funnel.buckets.BLACK_LISTED ?? 0,
      duAnKhongTinhTtm: funnel.buckets.PROJECT_NON_TTM ?? 0,
      saiLechDuLieu: funnel.buckets.DATA_ANOMALY,
      ngoaiPhamViDuLieuChoTtm: funnel.buckets.OUT_OF_SCOPE,
      scopeStats: funnel.scopeStats,
    },
    indexes: {
      ttmCnttQlda: describeIndex(ttmFunnelCnttIndex(funnel)),
      ttmCnttQa: describeIndex(insights.qa),
      ttmE2e: describeIndex(insights.e2e),
    },
    widgets: {
      tongSoEpic: layers.l2,
      failTtmCntt: layers.l5ab + layers.l5ba,
      epicDanhGia: layers.l5aa + layers.l5ab + layers.l5ba,
      chamTienDo: insights.lateWarning,
      ...(insights.scoringEngine ? {} : { canhBaoSom: insights.earlyWarning }),
      saiLechDuLieu: insights.anomalyCount,
      choGolive: { total: insights.waitingGolive.total, thieuR4gDate: waiting.missingR4g, trongHan: waiting.withinGrace, quaHan: waiting.overdue },
      giaiTrinhGolive: insights.justifyGolive,
    },
    breakdown: insights.breakdowns[dimension].map((item) => {
      const { qa, qlda } = breakdownIndexes(item);
      return {
        name: item.name,
        tongSoEpic: item.total,
        passTtm: item.pass,
        failTtm: item.fail,
        failTreR4g: item.failLateR4g,
        failThieuR4g: item.fail - item.failLateR4g,
        epicDanhGia: qlda.denominator,
        ttmCnttQldaPct: qlda.denominator > 0 ? Math.round(qlda.pctPrecise * 10) / 10 : null,
        ttmCnttQa: item.qaTotal > 0 ? { pass: item.qaPass, fail: item.qaFail, pct: qa.denominator > 0 ? Math.round(qa.pctPrecise * 10) / 10 : null } : null,
        saiLechDuLieu: item.anomaly,
        dungTienDo: item.ok,
        chamTienDo: item.late,
      };
    }),
    ttmIndexGlobal: ttmIndexGlobal
      ? { computedAt: ttmIndexGlobal.computedAt, ttmCnttQlda: describeIndex(ttmIndexGlobal.ttm), ttmCnttQa: describeIndex(ttmIndexGlobal.qa), ttmE2e: describeIndex(ttmIndexGlobal.e2e) }
      : null,
    filterOptions: { domains: options.domains, pmSms: options.pmSms, projectKeys: options.projects, requestingUnits: options.requestingUnits },
    glossary: {
      funnel: 'Phễu chỉ tính Epic trong "Phạm vi dữ liệu cho TTM" và phạm vi quyền của người gọi. L02 = L01 − Cancelled − Epic ngoại lệ (TTM Black listed) − Epic thuộc dự án có Time to Market = N; L03 = L02 − Sai lệch dữ liệu = L04a + L04b; L04a = L05aa + L05ab + L05ac; L04b = L05ba + L05bb.',
      indexes: 'Cả 3 chỉ số: pct = Tỷ lệ % Pass = pass / denominator, denominator = pass + fail (chỉ Epic đã có kết luận; Cancelled, Epic ngoại lệ, dự án Time to Market = N, Sai lệch dữ liệu, chưa kết luận không tính); pct = null khi chưa có Epic nào được kết luận. TTM-CNTT (QLDA): pass = L05aa, fail = L05ab + L05ba. TTM-CNTT (QA): cùng công thức, chỉ Epic MVP Done / Released trong "R4G for TTM (QA)". TTM-E2E: Đạt / (Đạt + Fail) TTM-E2E, không áp "Phạm vi dữ liệu cho TTM".',
      widgets: 'tongSoEpic = L02; failTtmCntt = L05ab + L05ba; epicDanhGia = L05aa + L05ab + L05ba. chamTienDo, saiLechDuLieu, choGolive, giaiTrinhGolive đếm trên mọi Epic không Cancelled của tập đang xem.',
      breakdown: 'Mỗi dòng dùng cùng tiêu chí với phễu. dungTienDo / chamTienDo chỉ đếm Epic chưa có R4G Date và không Sai lệch dữ liệu (chậm = đang Fail hoặc Cảnh báo muộn); Epic Sai lệch dữ liệu đếm riêng ở saiLechDuLieu.',
      ttmIndexGlobal: 'Chỉ số toàn công ty trên banner — tính trên toàn bộ Epic, không phụ thuộc quyền/bộ lọc.',
      danhSachEpic: 'Tool này chỉ trả số liệu tổng hợp. Danh sách Epic sau mỗi con số: dùng list_epic_alerts với tham số nhanXet (dữ liệu màn Quản trị Epic), ví dụ nhanXet = TTM_PASS_IN_SCOPE cho L05aa.',
      chiTietRule: 'Dùng search_product_docs (mục 21 "TTM Dashboard 2", mục 9.1 rule Sai lệch dữ liệu) để tra cứu rule tính toán.',
    },
  };
}
