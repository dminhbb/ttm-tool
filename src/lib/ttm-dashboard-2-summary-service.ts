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
  roundEpicCount,
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
  /** Rule Group names (Rule Management). */
  ruleGroups?: string[];
}

/** The widget "Thiếu lý do" of the screen (DashboardInsights.tsx) with what a chatbot needs to read it: both halves, their share of the Fail TTM-CNTT Epics, and where to list them. */
function describeMissingReason(stage: number, department: number, failTtmCntt: number) {
  const pct = (count: number) => (failTtmCntt > 0 ? Math.round((count / failTtmCntt) * 1000) / 10 : null);
  return {
    tong: stage + department,
    khauFail: stage,
    chiuTnChinh: department,
    epicFailTtmCntt: failTtmCntt,
    tyLeKhauFailPct: pct(stage),
    tyLeChiuTnChinhPct: pct(department),
    nhanXet: { tong: 'MISSING_FAIL_REASON', khauFail: 'MISSING_FAIL_STAGE', chiuTnChinh: 'MISSING_RESPONSIBLE_DEPARTMENT' },
    moTa: 'Epic Fail TTM-CNTT có R4G Date muộn hơn Target nhưng chưa ghi lý do: khauFail = chưa có thông tin khâu fail (BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT, Lý do khác); chiuTnChinh = chưa có "Phòng chịu trách nhiệm chính" (trống hoặc None). 1 Epic có thể thiếu cả hai.',
  };
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
    components: [],
    domain: resolveValues(input.domain ? [input.domain] : [], options.domains)[0] ?? '',
    pmSms: resolveValues(input.pmSms, options.pmSms),
    projects: resolveValues(input.projectKeys, options.projects),
    requestingUnits: resolveValues(input.requestingUnits, options.requestingUnits),
    ruleGroups: resolveValues(input.ruleGroups, options.ruleGroups ?? []),
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
    appliedFilters: { dimension, domain: filters.domain || null, pmSms: filters.pmSms, projectKeys: filters.projects, requestingUnits: filters.requestingUnits, ruleGroups: filters.ruleGroups },
    funnel: {
      criteria: (Object.keys(TTM_FUNNEL_CRITERIA) as TtmFunnelCriterionId[]).map((id) => ({ id, ...TTM_FUNNEL_CRITERIA[id], count: counts[id] })),
      cancelled: funnel.buckets.CANCELLED,
      epicNgoaiLe: funnel.buckets.BLACK_LISTED ?? 0,
      duAnKhongTinhTtm: funnel.buckets.PROJECT_NON_TTM ?? 0,
      khongApDungRuleTtmCntt: funnel.buckets.NO_CNTT_RULE ?? 0,
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
      saiLechDuLieu: insights.anomalyCount,
      choGolive: { total: insights.waitingGolive.total, thieuR4gDate: waiting.missingR4g, trongHan: waiting.withinGrace, quaHan: waiting.overdue },
      giaiTrinhGolive: insights.justifyGolive,
      thieuLyDo: describeMissingReason(insights.missingFailReason, insights.missingResponsibleDepartment ?? 0, layers.l5ab + layers.l5ba),
    },
    // Counts go out as the screen shows them: whole Epics. Only the PM/SM dimension holds shares (an
    // Epic of n PM/SMs is 1/n for each — see TtmBreakdownItem); the percentages use the unrounded shares.
    breakdown: insights.breakdowns[dimension].map((item) => {
      const { qa, qlda } = breakdownIndexes(item);
      return {
        name: item.name,
        tongSoEpic: roundEpicCount(item.total),
        passTtm: roundEpicCount(item.pass),
        failTtm: roundEpicCount(item.fail),
        failTreR4g: roundEpicCount(item.failLateR4g),
        failThieuR4g: roundEpicCount(item.fail - item.failLateR4g),
        epicDanhGia: roundEpicCount(qlda.denominator),
        ttmCnttQldaPct: qlda.denominator > 0 ? Math.round(qlda.pctPrecise * 10) / 10 : null,
        ttmCnttQa: item.qaTotal > 0 ? { pass: roundEpicCount(item.qaPass), fail: roundEpicCount(item.qaFail), pct: qa.denominator > 0 ? Math.round(qa.pctPrecise * 10) / 10 : null } : null,
        saiLechDuLieu: roundEpicCount(item.anomaly),
        thieuLyDo: { khauFail: roundEpicCount(item.missingStage ?? 0), chiuTnChinh: roundEpicCount(item.missingDepartment ?? 0) },
        dungTienDo: roundEpicCount(item.ok),
        chamTienDo: roundEpicCount(item.late),
      };
    }),
    ttmIndexGlobal: ttmIndexGlobal
      ? { computedAt: ttmIndexGlobal.computedAt, ttmCnttQlda: describeIndex(ttmIndexGlobal.ttm), ttmCnttQa: describeIndex(ttmIndexGlobal.qa), ttmE2e: describeIndex(ttmIndexGlobal.e2e) }
      : null,
    filterOptions: { domains: options.domains, pmSms: options.pmSms, projectKeys: options.projects, requestingUnits: options.requestingUnits, ruleGroups: options.ruleGroups ?? [] },
    glossary: {
      funnel: 'Phễu chỉ tính Epic trong "Phạm vi dữ liệu cho TTM" và phạm vi quyền của người gọi. L02 = L01 − Cancelled − Epic ngoại lệ; "Epic ngoại lệ" gồm 2 loại: Epic trong danh sách Black listed (epicNgoaiLe) và Epic thuộc dự án có Time to Market = N (duAnKhongTinhTtm) — Scoring Service không xét các Epic này; L03 = L02 − Sai lệch dữ liệu = L04a + L04b; L04a = L05aa + L05ab + L05ac; L04b = L05ba + L05bb.',
      indexes: 'Cả 3 chỉ số: pct = Tỷ lệ % Pass = pass / denominator, denominator = pass + fail (chỉ Epic đã có kết luận; Cancelled, Epic ngoại lệ, Sai lệch dữ liệu, chưa kết luận không tính); pct = null khi chưa có Epic nào được kết luận. TTM-CNTT (QLDA): pass = L05aa, fail = L05ab + L05ba. TTM-CNTT (QA): cùng công thức, chỉ Epic MVP Done / Released trong "R4G for TTM (QA)". TTM-E2E: Đạt / (Đạt + Fail) TTM-E2E, không áp "Phạm vi dữ liệu cho TTM".',
      widgets: 'tongSoEpic = L02; failTtmCntt = L05ab + L05ba; epicDanhGia = L05aa + L05ab + L05ba. thieuLyDo.tong = khauFail + chiuTnChinh (Epic Fail TTM-CNTT có R4G Date muộn hơn Target nhưng chưa có thông tin khâu fail / chưa có phòng chịu trách nhiệm chính — 1 Epic có thể thiếu cả hai nên tong có thể lớn hơn số Epic); tyLeKhauFailPct / tyLeChiuTnChinhPct = khauFail, chiuTnChinh trên số Epic Fail TTM-CNTT (failTtmCntt); nhanXet = giá trị tham số nhanXet của list_epic_alerts để lấy danh sách Epic; mỗi dòng breakdown có thieuLyDo riêng. chamTienDo, saiLechDuLieu, choGolive, giaiTrinhGolive đếm trên các Epic của tập đang xem, không tính Epic Cancelled và Epic ngoại lệ (từ 09/10/2026).',
      breakdown: 'Mỗi dòng dùng cùng tiêu chí với phễu. dungTienDo / chamTienDo chỉ đếm Epic chưa có R4G Date và không Sai lệch dữ liệu (chậm = đang Fail hoặc Cảnh báo muộn); Epic Sai lệch dữ liệu đếm riêng ở saiLechDuLieu.',
      ttmIndexGlobal: 'Chỉ số toàn công ty trên banner — tính trên toàn bộ Epic, không phụ thuộc quyền/bộ lọc.',
      danhSachEpic: 'Tool này chỉ trả số liệu tổng hợp. Danh sách Epic sau mỗi con số: dùng list_epic_alerts với tham số nhanXet (dữ liệu màn Quản trị Epic), ví dụ nhanXet = TTM_PASS_IN_SCOPE cho L05aa.',
      chiTietRule: 'Dùng search_product_docs (mục 21 "TTM Dashboard 2", mục 9.1 rule Sai lệch dữ liệu) để tra cứu rule tính toán.',
    },
  };
}
