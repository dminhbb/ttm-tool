'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretRight,
  ChartPie,
  CircleNotch,
  ClockCounterClockwise,
  Eye,
  Info,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { PillToggle } from '@/components/ui/PillToggle';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicAlertsIframeModal } from '@/components/dashboard-new/EpicAlertsIframeModal';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { BreakdownDonutSections, BreakdownMatrixCard, KpiStrip, type InsightListParams } from '@/components/ttm-dashboard-2/DashboardInsights';
import { SolidLayer, SplitLayer, type Ellipse } from '@/components/ttm-dashboard-2/FunnelLayers';
import { buildEpicAlertsDeepLink, type EpicAlertsDeepLinkAlert } from '@/lib/epic-alerts-deep-link';
import { formatTtmFailPct, formatTtmPassPct } from '@/lib/ttm-cntt-qa';
import {
  filterTtmDashboard2Rows,
  hasActiveTtmDashboard2Filter,
  summarizeTtmFunnel,
  TTM_FUNNEL_CRITERIA,
  ttmFunnelCnttIndex,
  ttmFunnelLayers,
  type TtmBreakdownDimension,
  type TtmDashboard2FilterOptions,
  type TtmDashboard2Filters,
  type TtmFunnelCriterionId,
  type TtmFunnelRow,
  type TtmFunnelSummary,
} from '@/lib/ttm-funnel-summary';
import type { TtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import '@/app/epic-alerts-15/epic-alerts-15.css';

interface ManagedUserItem {
  domainIds: number[];
  email: string;
  fullName: string;
  id: number;
  isActive: boolean;
  projectIds: number[];
  role: string;
}

interface DashboardPayload {
  actor: { email: string; fullName: string; id: number; role: string };
  /** Where `summary` came from — see ttm-dashboard-2-cache-service.ts. */
  cache: { computedAt: string | null; scopeKey: string; status: 'HIT' | 'MISS' | 'LIVE' };
  filterOptions: TtmDashboard2FilterOptions;
  isUserPreview: boolean;
  lastAggregatedAt: string | null;
  managedUsers: ManagedUserItem[];
  /** Unfiltered funnel numbers of this viewer's scope (from the cache). */
  summary: TtmFunnelSummary;
  ttmIndexGlobal: TtmIndexGlobalCache | null;
  viewAsUser: { email: string; fullName: string; id: number; role: string } | null;
}

/** A funnel criterion (TTM_FUNNEL_CRITERIA) or the Epics left outside "Phạm vi dữ liệu cho TTM". */
type NodeId = TtmFunnelCriterionId | 'OUT_OF_SCOPE';

type RightPanel = 'COMPLETED' | 'IN_PROGRESS';

/** Accordion (Panel 1 ↔ Panel 2/3) duration — keep in sync with the `duration-[700ms]!` classes
 * below (Tailwind needs them as literal class names). */
const ACCORDION_MS = 700;
/** The accordion's transition classes are `!important` on purpose: globals.css forces every
 * transition to 0.01ms under prefers-reduced-motion (e.g. Windows "Animation effects" off), which
 * made Panel 2/3 just pop in/out. This one is a short, user-triggered slide, so it always runs. */
const ACCORDION_TIMING = 'duration-[700ms]! ease-[cubic-bezier(0.4,0,0.2,1)]!';

function formatDateTime(value: string | null): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hour}:${minute}`;
}

function formatTtmIndexValue(summary: TtmCnttSummary | null | undefined): string {
  return formatTtmPassPct(summary);
}

function formatTtmIndexTooltip(firstLine: string, summary: TtmCnttSummary | null | undefined): string {
  const secondLine = summary && summary.total > 0 ? `${summary.pass}/${summary.denominator} Epic đạt TTM` : '—';
  return `${firstLine}\n${secondLine}`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';
}

function fmt(value: number): string {
  return value.toLocaleString('vi-VN');
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

interface DrillParams {
  alert?: EpicAlertsDeepLinkAlert | EpicAlertsDeepLinkAlert[];
  dataIssue?: boolean;
  status?: string[];
}

interface NodeDetail {
  heading: string;
  count: number;
  countColor: string;
  tone: { box: string; strong: string; soft: string };
  summaryLabel: string;
  ratioLine?: string;
  rule: React.ReactNode;
  formula: React.ReactNode;
  drill: (DrillParams & { title: string; label: string; count: number }) | null;
  /** Further drill-down lists of the same node (L02: one per group of Epics it drops). */
  extraDrills?: (DrillParams & { title: string; label: string; count: number })[];
  buttonClass: string;
  extra?: React.ReactNode;
}

const EMPTY_FILTER_OPTIONS: TtmDashboard2FilterOptions = { domainProjectKeys: {}, domains: [], pmSms: [], projects: [], requestingUnits: [] };

export default function TtmDashboard2Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);

  // User Preview State
  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'EXECUTIVE' | 'OPERATIONAL'>('EXECUTIVE');

  // Layer Detail Modal (opened via right-click on a layer/group)
  const [detailModalId, setDetailModalId] = useState<NodeId | null>(null);

  // Right-side detail panel (accordion). `shownRightPanel` keeps the last panel's content mounted
  // while it collapses, so closing animates too instead of the content vanishing at once.
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanel | null>(null);
  const [shownRightPanel, setShownRightPanel] = useState<RightPanel>('COMPLETED');
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isRightOpen = activeRightPanel !== null;

  // Embedded "Quản trị Epic" popup — same component (size, blurred backdrop) as TTM Dashboard.
  const [epicModal, setEpicModal] = useState<{ title: string; url: string } | null>(null);

  // Filters — Arranged in a single top row matching TTM Dashboard
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterPmSms, setFilterPmSms] = useState<string[]>([]);
  const [filterRequestingUnits, setFilterRequestingUnits] = useState<string[]>([]);

  const requestIdRef = useRef(0);

  const loadData = async (userId: number | null) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const url = userId ? `/api/ttm-dashboard-2?viewAsUserId=${userId}` : '/api/ttm-dashboard-2';
      const res = await fetch(url, { cache: 'no-store' });
      const json: unknown = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        throw new Error(
          typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string'
            ? json.error
            : 'Không thể tải dữ liệu.'
        );
      }
      const payload = json as DashboardPayload;
      setData(payload);

      const isAdminOrSupervisor = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(payload.actor.role);
      if (isAdminOrSupervisor && payload.isUserPreview) {
        setViewMode('OPERATIONAL');
      } else if (!isAdminOrSupervisor) {
        setViewMode('OPERATIONAL');
      } else {
        setViewMode('EXECUTIVE');
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData(previewUserId));
  }, [previewUserId]);

  // Stacked layout (< lg): bring the panel that just opened into view.
  useEffect(() => {
    if (!activeRightPanel || !window.matchMedia('(max-width: 1023.98px)').matches) return;
    const timer = window.setTimeout(() => rightPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), ACCORDION_MS / 2);
    return () => window.clearTimeout(timer);
  }, [activeRightPanel]);

  const isAdminOrSupervisor = useMemo(() => {
    return data ? ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(data.actor.role) : false;
  }, [data]);

  // Filter options come with the cached snapshot (the viewer's whole scope).
  const filterOptions = data?.filterOptions ?? EMPTY_FILTER_OPTIONS;
  const domainOptions = filterOptions.domains;
  const projectOptions = filterOptions.projects;
  const pmSmOptions = filterOptions.pmSms;
  const requestingUnitOptions = filterOptions.requestingUnits;

  const handleDomainFilterChange = (domain: string) => {
    setFilterDomain(domain);
    setFilterProjects(domain ? [...(filterOptions.domainProjectKeys[domain] ?? [])] : []);
  };

  const resetAllFilters = () => {
    setFilterDomain('');
    setFilterProjects([]);
    setFilterPmSms([]);
    setFilterRequestingUnits([]);
  };

  const filters = useMemo<TtmDashboard2Filters>(
    () => ({ domain: filterDomain, pmSms: filterPmSms, projects: filterProjects, requestingUnits: filterRequestingUnits }),
    [filterDomain, filterPmSms, filterProjects, filterRequestingUnits],
  );
  const isFiltered = hasActiveTtmDashboard2Filter(filters);

  // Epic rows are fetched only once a toolbar filter is applied (once per viewed scope); the
  // unfiltered numbers are the cached `data.summary`.
  const rowsKey = String(data?.viewAsUser?.id ?? 'self');
  const [rowsState, setRowsState] = useState<{ key: string; rows: TtmFunnelRow[] } | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsRetry, setRowsRetry] = useState(0);
  const rowsRequestRef = useRef<string | null>(null);
  const filterRows = rowsState?.key === rowsKey ? rowsState.rows : null;

  useEffect(() => {
    if (!data || !isFiltered || filterRows || rowsRequestRef.current === rowsKey) return;
    rowsRequestRef.current = rowsKey;
    const url = data.viewAsUser ? `/api/ttm-dashboard-2/rows?viewAsUserId=${data.viewAsUser.id}` : '/api/ttm-dashboard-2/rows';
    void fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as { error?: string; rows?: TtmFunnelRow[] };
        if (!res.ok || !json.rows) throw new Error(json.error || 'Không thể tải dữ liệu Epic cho bộ lọc.');
        if (rowsRequestRef.current !== rowsKey) return;
        setRowsState({ key: rowsKey, rows: json.rows });
        setRowsError(null);
      })
      .catch((err: unknown) => {
        if (rowsRequestRef.current === rowsKey) setRowsError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Epic cho bộ lọc.');
      })
      .finally(() => {
        if (rowsRequestRef.current === rowsKey) rowsRequestRef.current = null;
      });
  }, [data, isFiltered, filterRows, rowsKey, rowsRetry]);

  // Unfiltered → the cached snapshot. Filtered → recomputed from the rows with the very same
  // functions the cache was built with (ttm-funnel-summary.ts). While the rows are still loading,
  // the last numbers stay on screen behind a "đang tính lại" overlay.
  const filteredSummary = useMemo(
    () => (isFiltered && filterRows ? summarizeTtmFunnel(filterTtmDashboard2Rows(filterRows, filters)) : null),
    [isFiltered, filterRows, filters],
  );
  const isRecomputing = isFiltered && !filterRows;

  /** Quản trị Epic list behind a funnel number: viewer scope (or the previewed user's), this
   * screen's toolbar filters, and the node's own condition. */
  const openEpicListModal = (params: DrillParams & Partial<InsightListParams> & { title: string }) => {
    // A matrix row / pie slice narrows one dimension further (params.domain/projects/…); everything
    // else keeps this screen's toolbar filters. A Domain value on top of a Dự án filter becomes the
    // filtered projects that belong to that Domain (Quản trị Epic lets `projects` win over `domain`).
    const domainProjects = params.domain && filterProjects.length > 0
      ? filterProjects.filter((key) => (data?.filterOptions.domainProjectKeys[params.domain ?? ''] ?? []).includes(key))
      : null;
    const url = buildEpicAlertsDeepLink({
      alert: params.alert,
      dataIssue: params.dataIssue,
      domain: domainProjects ? undefined : params.domain ?? (filterProjects.length > 0 ? undefined : filterDomain || undefined),
      pmSm: params.pmSm ?? (filterPmSms.length > 0 ? filterPmSms : undefined),
      projects: params.projects ?? domainProjects ?? (params.domain ? undefined : filterProjects.length > 0 ? filterProjects : undefined),
      requestingUnit: params.requestingUnit ?? (filterRequestingUnits.length > 0 ? filterRequestingUnits : undefined),
      status: params.status,
      type: params.type,
      viewAsUserId: data?.viewAsUser?.id ?? null,
    });
    setDetailModalId(null);
    setEpicModal({ title: params.title, url });
  };

  const handleContextMenu = (e: React.MouseEvent, id: NodeId) => {
    e.preventDefault();
    setDetailModalId(id);
  };

  const toggleRightPanel = (panel: RightPanel) => {
    setShownRightPanel(panel);
    setActiveRightPanel((prev) => (prev === panel ? null : panel));
  };

  const filteredUsersForModal = useMemo(() => {
    if (!data) return [];
    if (!userSearchText.trim()) return data.managedUsers;
    const q = userSearchText.toLowerCase();
    return data.managedUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [data, userSearchText]);

  if (loading) {
    return (
      <div className="p-6 max-w-[1700px] mx-auto space-y-4">
        <TableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-[1700px] mx-auto">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const funnel: TtmFunnelSummary = (isFiltered ? filteredSummary : null) ?? data.summary;
  const { buckets } = funnel;
  const { l1, l2, l3, l4a, l4b } = ttmFunnelLayers(funnel);
  const layer1ScopeStats = funnel.scopeStats;
  const cancelledCount = buckets.CANCELLED;
  // `?? 0`: a summary cached before L02 dropped these two groups has no such buckets.
  const blackListedCount = buckets.BLACK_LISTED ?? 0;
  const nonTtmProjectCount = buckets.PROJECT_NON_TTM ?? 0;
  const anomalyCount = buckets.DATA_ANOMALY;
  const outOfScopeCount = buckets.OUT_OF_SCOPE;
  const passCount = buckets.R4G_PASS;
  const lateCount = buckets.R4G_LATE;
  const notScoredCount = buckets.R4G_NOT_SCORED;
  const overdueCount = buckets.NO_R4G_OVERDUE;
  const withinCount = buckets.NO_R4G_WITHIN_TARGET;
  // TTM-CNTT (QLDA) of exactly the Epic set on screen: Pass = L05aa / (L05aa + L05ab + L05ba).
  const cnttIndex = ttmFunnelCnttIndex(funnel);
  const judgedCount = cnttIndex.denominator;
  const failCount = cnttIndex.fail;
  const passRate = formatTtmPassPct(cnttIndex);
  const failRate = formatTtmFailPct(cnttIndex);
  const name = (id: TtmFunnelCriterionId) => TTM_FUNNEL_CRITERIA[id].name;
  const rateFormula = (
    <>
      Tỷ lệ % Pass TTM-CNTT = L05aa / (L05aa + L05ab + L05ba)<br />
      = {fmt(passCount)} / ({fmt(passCount)} + {fmt(lateCount)} + {fmt(overdueCount)}) = <b>{passRate}</b><br />
      Tỷ lệ % Fail TTM-CNTT = (L05ab + L05ba) / (L05aa + L05ab + L05ba)<br />
      = ({fmt(lateCount)} + {fmt(overdueCount)}) / {fmt(judgedCount)} = <b>{failRate}</b>
    </>
  );

  // -------------------------------------------------------------------------------------------
  // Popup content per criterion (right-click)
  // -------------------------------------------------------------------------------------------
  const nodeDetails: Record<NodeId, NodeDetail> = {
    L01: {
      heading: `L01 — ${name('L01')}`,
      count: l1,
      countColor: 'text-[#00b4d8]',
      tone: { box: 'bg-sky-50 border-sky-200', strong: 'text-sky-950', soft: 'text-sky-800' },
      summaryLabel: `${name('L01')}:`,
      ratioLine: outOfScopeCount > 0 ? `Không tính: ${fmt(outOfScopeCount)} Epic ngoài "Phạm vi dữ liệu cho TTM"` : undefined,
      rule: 'Toàn bộ Epic (kể cả Epic đã Cancelled) nằm trong “Phạm vi dữ liệu cho TTM” (Cấu hình cảnh báo), thuộc phạm vi quyền của tài khoản — hoặc của user đang được xem dưới quyền — và các bộ lọc Domain, Dự án, PM/SM, Đơn vị yêu cầu đang chọn.',
      formula: <>L01 = Tổng số Epic trong phạm vi dữ liệu để tính toán<br />= <b>{fmt(l1)} Epic</b></>,
      drill: { alert: 'IN_SCOPE_CNTT', count: l1, label: `Xem ${fmt(l1)} Epic trên Quản trị Epic`, status: funnel.allStatuses, title: `Danh sách Epic - L01 (${name('L01')})` },
      buttonClass: 'bg-[#1463f7] hover:bg-blue-700',
      extra: (
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          {[
            ['Số lượng Domain:', `${layer1ScopeStats.domains} Domain`],
            ['Số lượng Dự án:', `${layer1ScopeStats.projects} Dự án`],
            ['Số lượng PM/SM:', `${layer1ScopeStats.pms} Người`],
            ['Đơn vị yêu cầu:', `${layer1ScopeStats.requestingUnits} Đơn vị`],
          ].map(([label, value]) => (
            <div key={label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 text-[11px]">{label}</span>
              <div className="font-bold text-slate-900 font-mono mt-0.5 text-sm">{value}</div>
            </div>
          ))}
        </div>
      ),
    },
    L02: {
      heading: `L02 — ${name('L02')}`,
      count: l2,
      countColor: 'text-[#ff4d4f]',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: `${name('L02')}:`,
      ratioLine: `Đã loại trừ: ${fmt(l1 - l2)} Epic · Tỷ lệ giữ lại: ${pct(l2, l1)}`,
      rule: (
        <>
          Loại 3 nhóm Epic khỏi phạm vi tính toán Time to Market:
          <br />1. Epic có trạng thái chứa chữ <code>Cancel</code> (không phân biệt hoa/thường) — trạng thái gặp trong phạm vi hiện tại: {funnel.cancelledStatuses.length > 0 ? funnel.cancelledStatuses.map((status) => <code key={status} className="mr-1">{status}</code>) : <i>không có</i>}.
          <br />2. <b>Epic ngoại lệ</b> — Epic có <code>TTM Black listed = true</code> (khai báo ở menu “Epic ngoại lệ” hoặc trong màn Duyệt Epic).
          <br />3. Epic thuộc dự án có trường <b>Time to Market = N</b> (Quản lý Dự án).
          <br />Mỗi Epic chỉ bị trừ 1 lần, theo đúng thứ tự trên.
        </>
      ),
      formula: <>L02 = L01 ({fmt(l1)}) − Cancelled ({fmt(cancelledCount)}) − Epic ngoại lệ ({fmt(blackListedCount)}) − Dự án Time to Market = N ({fmt(nonTtmProjectCount)})<br />= <b>{fmt(l2)} Epic</b></>,
      drill: { alert: 'IN_SCOPE_CNTT', count: cancelledCount, label: `Xem ${fmt(cancelledCount)} Epic Cancelled bị loại`, status: funnel.cancelledStatuses, title: 'Danh sách Epic Cancelled (bị loại ở L02)' },
      extraDrills: [
        { alert: 'TTM_BLACK_LISTED', count: blackListedCount, label: `Xem ${fmt(blackListedCount)} Epic ngoại lệ bị loại`, title: 'Danh sách Epic ngoại lệ — TTM Black listed (bị loại ở L02)' },
        { alert: 'TTM_PROJECT_NON_TTM', count: nonTtmProjectCount, label: `Xem ${fmt(nonTtmProjectCount)} Epic thuộc dự án Time to Market = N`, title: 'Danh sách Epic thuộc dự án Time to Market = N (bị loại ở L02)' },
      ],
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    L03: {
      heading: `L03 — ${name('L03')}`,
      count: l3,
      countColor: 'text-[#0284c7]',
      tone: { box: 'bg-indigo-50 border-indigo-200', strong: 'text-indigo-950', soft: 'text-indigo-800' },
      summaryLabel: `${name('L03')}:`,
      ratioLine: `Sai lệch dữ liệu: ${fmt(anomalyCount)} Epic · Tỷ lệ đạt chuẩn: ${pct(l3, l2)}`,
      rule: 'Loại các Epic bị đánh dấu Sai lệch dữ liệu (ví dụ thiếu/ngược mốc ngày, trạng thái không khớp mốc ngày). Hệ thống không chấm Đạt/Fail cho các Epic này.',
      formula: (
        <>
          L03 = L02 ({fmt(l2)}) − Sai lệch dữ liệu ({fmt(anomalyCount)}) = <b>{fmt(l3)} Epic</b><br />
          = L04a ({fmt(l4a)}) + L04b ({fmt(l4b)})
        </>
      ),
      drill: { alert: 'DATA_ANOMALY_IN_SCOPE', count: anomalyCount, label: `Xem ${fmt(anomalyCount)} Epic Sai lệch dữ liệu`, title: 'Danh sách Epic Sai lệch dữ liệu (bị loại ở L03)' },
      buttonClass: 'bg-[#0284c7] hover:bg-sky-700',
    },
    L04a: {
      heading: `L04a — ${name('L04a')} (có R4G Date)`,
      count: l4a,
      countColor: 'text-teal-700',
      tone: { box: 'bg-teal-50 border-teal-200', strong: 'text-teal-950', soft: 'text-teal-800' },
      summaryLabel: `${name('L04a')} (có R4G Date):`,
      ratioLine: `Tỷ lệ trong L03: ${pct(l4a, l3)}`,
      rule: 'Các Epic thuộc L03 đã có R4G Date.',
      formula: <>L04a = L05aa ({fmt(passCount)}) + L05ab ({fmt(lateCount)}) + L05ac ({fmt(notScoredCount)})<br />= <b>{fmt(l4a)} Epic</b></>,
      drill: { alert: 'TTM_ELIGIBLE_IN_SCOPE', count: l4a, label: `Xem ${fmt(l4a)} Epic hoàn thành`, title: `Danh sách Epic - L04a (${name('L04a')})` },
      buttonClass: 'bg-teal-600 hover:bg-teal-700',
    },
    L05aa: {
      heading: `L05aa — ${name('L05aa')}`,
      count: passCount,
      countColor: 'text-emerald-600',
      tone: { box: 'bg-emerald-50 border-emerald-200', strong: 'text-emerald-950', soft: 'text-emerald-800' },
      summaryLabel: `${name('L05aa')}:`,
      ratioLine: `Tỷ lệ % Pass TTM-CNTT: ${passRate} (${fmt(passCount)}/${fmt(judgedCount)})`,
      rule: 'Các Epic thuộc L04a được chấm Đạt TTM-CNTT: R4G Date đã tới và không muộn hơn Target R4G.',
      formula: rateFormula,
      drill: { alert: 'TTM_PASS_IN_SCOPE', count: passCount, label: `Xem ${fmt(passCount)} Epic đạt TTM-CNTT`, title: `Danh sách Epic - L05aa (${name('L05aa')})` },
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    },
    L05ab: {
      heading: `L05ab — ${name('L05ab')}`,
      count: lateCount,
      countColor: 'text-rose-600',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: `${name('L05ab')}:`,
      ratioLine: `Tỷ lệ % Fail TTM-CNTT: ${failRate} (${fmt(failCount)}/${fmt(judgedCount)}) · trong L04a: ${pct(lateCount, l4a)}`,
      rule: 'Các Epic thuộc L04a không Đạt TTM-CNTT: R4G Date muộn hơn Target R4G → Fail TTM-CNTT (QLDA). Cùng con số với “Trễ R4G” ở TTM Dashboard.',
      formula: rateFormula,
      drill: { alert: 'TTM_LATE_IN_SCOPE', count: lateCount, label: `Xem ${fmt(lateCount)} Epic không đạt (nhóm 1)`, title: `Danh sách Epic - L05ab (${name('L05ab')})` },
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    L05ac: {
      heading: `L05ac — ${name('L05ac')}`,
      count: notScoredCount,
      countColor: 'text-slate-600',
      tone: { box: 'bg-slate-50 border-slate-200', strong: 'text-slate-900', soft: 'text-slate-700' },
      summaryLabel: `${name('L05ac')}:`,
      ratioLine: `Tỷ lệ trong L04a: ${pct(notScoredCount, l4a)}`,
      rule: 'Các Epic thuộc L04a chưa thể kết luận Đạt hay Fail: R4G Date còn ở tương lai (chưa tới ngày), hoặc không tính được Target R4G TTM-CNTT. Các Epic này không nằm trong Tỷ lệ % Pass / Fail TTM-CNTT.',
      formula: <>L05ac = L04a ({fmt(l4a)}) − L05aa ({fmt(passCount)}) − L05ab ({fmt(lateCount)})<br />= <b>{fmt(notScoredCount)} Epic</b></>,
      drill: { alert: 'TTM_NOT_SCORED_IN_SCOPE', count: notScoredCount, label: `Xem ${fmt(notScoredCount)} Epic chưa kết luận`, title: `Danh sách Epic - L05ac (${name('L05ac')})` },
      buttonClass: 'bg-slate-600 hover:bg-slate-700',
    },
    L04b: {
      heading: `L04b — ${name('L04b')} (chưa có R4G Date)`,
      count: l4b,
      countColor: 'text-amber-600',
      tone: { box: 'bg-amber-50 border-amber-200', strong: 'text-amber-950', soft: 'text-amber-800' },
      summaryLabel: `${name('L04b')} (chưa có R4G Date):`,
      ratioLine: `Tỷ lệ trong L03: ${pct(l4b, l3)}`,
      rule: 'Các Epic thuộc L03 chưa có R4G Date.',
      formula: <>L04b = L05ba ({fmt(overdueCount)}) + L05bb ({fmt(withinCount)})<br />= <b>{fmt(l4b)} Epic</b></>,
      drill: { alert: 'MISSING_R4G_IN_SCOPE', count: l4b, label: `Xem ${fmt(l4b)} Epic chưa hoàn thành`, title: `Danh sách Epic - L04b (${name('L04b')})` },
      buttonClass: 'bg-amber-600 hover:bg-amber-700',
    },
    L05ba: {
      heading: `L05ba — ${name('L05ba')}`,
      count: overdueCount,
      countColor: 'text-rose-600',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: `${name('L05ba')}:`,
      ratioLine: `Tỷ lệ % Fail TTM-CNTT: ${failRate} (${fmt(failCount)}/${fmt(judgedCount)}) · trong L04b: ${pct(overdueCount, l4b)}`,
      rule: 'Các Epic thuộc L04b chưa có R4G Date và đã quá Target R4G → Fail TTM-CNTT (QLDA). Cùng con số với “Thiếu R4G” ở TTM Dashboard.',
      formula: rateFormula,
      drill: { alert: 'OVERDUE_MISSING_R4G_IN_SCOPE', count: overdueCount, label: `Xem ${fmt(overdueCount)} Epic không đạt (nhóm 2)`, title: `Danh sách Epic - L05ba (${name('L05ba')})` },
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    L05bb: {
      heading: `L05bb — ${name('L05bb')}`,
      count: withinCount,
      countColor: 'text-[#0284c7]',
      tone: { box: 'bg-sky-50 border-sky-200', strong: 'text-sky-950', soft: 'text-sky-800' },
      summaryLabel: `${name('L05bb')}:`,
      ratioLine: `Tỷ lệ trong L04b: ${pct(withinCount, l4b)}`,
      rule: 'Các Epic thuộc L04b chưa có R4G Date và chưa quá Target R4G — vẫn còn cơ hội Đạt TTM-CNTT. Các Epic này chưa nằm trong Tỷ lệ % Pass / Fail TTM-CNTT.',
      formula: <>L05bb = L04b ({fmt(l4b)}) − L05ba ({fmt(overdueCount)})<br />= <b>{fmt(withinCount)} Epic</b></>,
      drill: { alert: 'WITHIN_TARGET_MISSING_R4G', count: withinCount, label: `Xem ${fmt(withinCount)} Epic trong hạn`, title: `Danh sách Epic - L05bb (${name('L05bb')})` },
      buttonClass: 'bg-[#0284c7] hover:bg-sky-700',
    },
    OUT_OF_SCOPE: {
      heading: 'Epic ngoài “Phạm vi dữ liệu cho TTM”',
      count: outOfScopeCount,
      countColor: 'text-slate-600',
      tone: { box: 'bg-slate-50 border-slate-200', strong: 'text-slate-900', soft: 'text-slate-700' },
      summaryLabel: 'Epic ngoài phạm vi dữ liệu để tính toán:',
      ratioLine: 'Không tính vào L01 và mọi tiêu chí bên dưới',
      rule: 'Epic nằm ngoài “Phạm vi dữ liệu cho TTM” (khoảng ngày “R4G for TTM (CNTT)” ở Cấu hình cảnh báo): R4G Date — hoặc Target R4G khi chưa có R4G Date — không thuộc khoảng đã cấu hình. Các Epic này không được chấm TTM-CNTT và không tham gia phễu.',
      formula: <>Ngoài phạm vi = <b>{fmt(outOfScopeCount)} Epic</b> (mọi status)<br />L01 = Epic trong phạm vi quyền + bộ lọc − Ngoài phạm vi</>,
      drill: { alert: 'OUT_OF_SCOPE_CNTT', count: outOfScopeCount, label: `Xem ${fmt(outOfScopeCount)} Epic ngoài phạm vi`, status: funnel.outOfScopeStatuses, title: 'Danh sách Epic ngoài “Phạm vi dữ liệu cho TTM”' },
      buttonClass: 'bg-slate-600 hover:bg-slate-700',
    },
  };

  const detail = detailModalId ? nodeDetails[detailModalId] : null;

  // Pie chart sections — same visibility rules as TTM Dashboard: the Lead view shows every dimension
  // that has something to compare, the PM/SM view only "Theo Phân loại Epic".
  const effectiveRole = data.viewAsUser?.role || data.actor.role;
  const donutDimensions: TtmBreakdownDimension[] = viewMode === 'EXECUTIVE'
    ? [
        'requestingUnit',
        ...(domainOptions.length > 1 ? ['domain' as const] : []),
        'epicType',
        ...(effectiveRole !== 'USER' ? ['pmsm' as const] : []),
        ...(effectiveRole === 'USER' && projectOptions.length <= 1 ? [] : ['project' as const]),
      ]
    : ['epicType'];

  const panelHeader = (panel: RightPanel) => (
    <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-2 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`size-2.5 shrink-0 rounded-full ${panel === 'COMPLETED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
        <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-slate-900 truncate">
          {panel === 'COMPLETED' ? 'Panel 2: Epic hoàn thành (có R4G Date)' : 'Panel 3: Epic chưa hoàn thành (chưa có R4G Date)'}
        </h3>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setShownRightPanel('COMPLETED'); setActiveRightPanel('COMPLETED'); }}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${panel === 'COMPLETED' ? 'bg-white text-emerald-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Hoàn thành ({fmt(l4a)})
          </button>
          <button
            type="button"
            onClick={() => { setShownRightPanel('IN_PROGRESS'); setActiveRightPanel('IN_PROGRESS'); }}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${panel === 'IN_PROGRESS' ? 'bg-white text-amber-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Chưa hoàn thành ({fmt(l4b)})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveRightPanel(null)}
          className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          title="Đóng phễu chi tiết"
          aria-label="Đóng phễu chi tiết"
        >
          <X className="size-4" weight="bold" />
        </button>
      </div>
    </div>
  );

  const detailTop: Ellipse = { cx: 175, cy: 35, rx: 140, ry: 20 };
  const detailMid: Ellipse = { cx: 175, cy: 135, rx: 100, ry: 14 };
  const detailBottom: Ellipse = { cx: 175, cy: 225, rx: 60, ry: 9 };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans antialiased p-4 md:p-6 space-y-4">
      <InfoBannerDisplay pathname="/ttm-dashboard-2" />

      {/* PAGE HEADER BANNER (same style as TTM Dashboard) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-fb-blue-soft text-fb-blue">
            <ChartPie className="size-5" weight="bold" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold uppercase tracking-tight text-fb-text-primary">
              TIME TO MARKET DASHBOARD 2
            </h1>
            <p className="text-[11px] text-fb-text-secondary">
              Dashboard quản lý cho CBQL/Lead • Trực quan hóa phễu tinh lọc và phân loại TTM
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Global TTM Indicators */}
          <div className="hidden sm:flex items-center gap-2">
            {([
              ['TTM-CNTT (QLDA)', 'Chỉ số TTM-CNTT (QLDA) toàn công ty = L05aa / (L05aa + L05ab + L05ba)', data?.ttmIndexGlobal?.ttm, 'text-[#15803d]'],
              ['TTM-CNTT (QA)', 'Chỉ số TTM-CNTT (QA) toàn công ty — cùng công thức, chỉ lấy Epic MVP Done / Released', data?.ttmIndexGlobal?.qa, 'text-purple-700'],
              ['TTM-E2E', 'Chỉ số Hoàn thành TTM-E2E tính trên toàn bộ Epic', data?.ttmIndexGlobal?.e2e, 'text-teal-700'],
            ] as const).map(([label, tooltip, summary, color]) => (
              <div
                key={label}
                className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-[#f0f3f1] px-3.5 shrink-0 text-left shadow-2xs"
                title={formatTtmIndexTooltip(tooltip, summary)}
              >
                <div className="flex flex-col justify-center leading-none">
                  <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-600">{label}</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-xs font-black ${color}`}>{formatTtmIndexValue(summary)}</span>
                    {summary && summary.total > 0 && (
                      <span className="text-[10px] font-medium text-slate-500">({summary.pass}/{summary.denominator})</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* User Preview Active Banner */}
          {data?.isUserPreview && (
            <div className="flex h-9 items-center gap-2 rounded-lg bg-amber-50 px-3 border border-amber-300 text-amber-900 text-xs shrink-0">
              <Eye className="size-4 shrink-0 text-amber-600" weight="bold" />
              <span className="truncate">
                Đang xem góc nhìn của: <strong>{data.viewAsUser?.fullName}</strong> ({data.viewAsUser?.email})
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewUserId(null);
                  setViewMode('EXECUTIVE');
                }}
                className="h-7 shrink-0 rounded-md bg-white border border-amber-300 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-xs"
              >
                Trở về Lead
              </button>
            </div>
          )}

          {/* View Toggle Pill (Lead vs PM/SM) */}
          {isAdminOrSupervisor && (
            <PillToggle
              value={viewMode}
              onChange={(val) => {
                if (val === 'EXECUTIVE') {
                  setPreviewUserId(null);
                  setViewMode('EXECUTIVE');
                } else {
                  if (viewMode !== 'OPERATIONAL') {
                    setFilterPmSms([]);
                    setShowUserModal(true);
                  }
                }
              }}
              options={[
                { value: 'EXECUTIVE', label: 'Lead', activeColor: 'bg-[#1b6b3e]' },
                { value: 'OPERATIONAL', label: 'PM/SM', activeColor: 'bg-[#1b6b3e]' },
              ]}
            />
          )}
        </div>
      </div>

      {/* TOP SINGLE-ROW TOOLBAR FILTERS */}
      <section className="ttm-toolbar" aria-label="Bộ lọc TTM Dashboard 2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-black shrink-0 mr-1 select-none">
          <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
          <span>Filters:</span>
        </div>

        {isAdminOrSupervisor && (
          <select
            className={`ttm-select${filterDomain ? ' has-filter' : ''}`}
            aria-label="Domain"
            value={filterDomain}
            onChange={(e) => handleDomainFilterChange(e.target.value)}
          >
            <option value="">Tất cả Domain…</option>
            {domainOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}

        <ToolbarMultiSelect
          ariaLabel="Dự án"
          searchable
          allLabel="Tất cả dự án"
          options={projectOptions}
          value={filterProjects}
          onChange={(values) => {
            setFilterDomain('');
            setFilterProjects(values);
          }}
        />

        <ToolbarMultiSelect
          ariaLabel="PM/SM"
          searchable
          allLabel="Tất cả PM/SM"
          options={pmSmOptions}
          value={filterPmSms}
          onChange={setFilterPmSms}
        />

        <ToolbarMultiSelect
          ariaLabel="Đơn vị yêu cầu"
          searchable
          allLabel="Tất cả đơn vị yêu cầu"
          options={requestingUnitOptions}
          value={filterRequestingUnits}
          onChange={setFilterRequestingUnits}
        />

        {(filterDomain || filterProjects.length > 0 || filterPmSms.length > 0 || filterRequestingUnits.length > 0) && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
            title="Xóa tất cả bộ lọc"
          >
            <ClockCounterClockwise className="size-3.5" />
            <span>Đặt lại</span>
          </button>
        )}

        {data.lastAggregatedAt && (
          <div className="ttm-report-date ml-auto text-xs text-fb-text-secondary hidden sm:block">
            Dữ liệu cập nhật: <b>{formatDateTime(data.lastAggregatedAt)}</b>
            <span
              className="ml-1.5"
              title={isFiltered
                ? 'Đang lọc: số liệu được tính lại từ danh sách Epic theo bộ lọc'
                : data.cache.status === 'LIVE'
                  ? 'Số liệu được tính trực tiếp (không dùng cache)'
                  : `Số liệu chưa lọc lấy từ cache (${data.cache.status === 'HIT' ? 'có sẵn' : 'vừa tạo'}${data.cache.computedAt ? `, tạo lúc ${formatDateTime(data.cache.computedAt)}` : ''})`}
            >
              · {isFiltered ? 'Tính lại theo bộ lọc' : data.cache.status === 'LIVE' ? 'Tính trực tiếp' : 'Từ cache'}
            </span>
          </div>
        )}
      </section>

      {/* WIDGET ROW — TTM Dashboard's KPI strip, re-based on the funnel criteria */}
      <div className={`transition-opacity ${isRecomputing ? 'opacity-60' : ''}`} aria-busy={isRecomputing}>
        <KpiStrip funnel={funnel} onOpen={openEpicListModal} />
      </div>

      {/* ============================================================= */}
      {/* MAIN LAYOUT — ACCORDION: Panel 1 alone (100%) ↔ Panel 1 + Panel 2/3 (50/50).
          Animated through grid-template-columns (≥ lg) / grid-template-rows (stacked), so both
          opening and closing slide; the right panel's content stays mounted while it collapses. */}
      {/* ============================================================= */}
      <div
        className={`grid grid-cols-1 items-start transition-[grid-template-columns,column-gap,row-gap] ${ACCORDION_TIMING} ${
          isRightOpen
            ? 'gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-6'
            : 'gap-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0fr)] lg:gap-x-0'
        }`}
      >

        {/* ============================================================= */}
        {/* PANEL 1: PHỄU LỌC DỮ LIỆU TỔNG QUAN & PHÂN NHÁNH TIẾN ĐỘ       */}
        {/* ============================================================= */}
        <div className="min-w-0 bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between relative" aria-busy={isRecomputing}>
          {(isRecomputing || rowsError) && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/70 backdrop-blur-[1px]">
              {rowsError ? (
                <div className="flex flex-col items-center gap-2 text-xs text-rose-700">
                  <span>{rowsError}</span>
                  <button
                    type="button"
                    onClick={() => { setRowsError(null); setRowsRetry((count) => count + 1); }}
                    className="rounded-md border border-rose-300 bg-white px-2.5 py-1 font-semibold hover:bg-rose-50"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <CircleNotch className="size-4 animate-spin text-[#1463f7]" weight="bold" />
                  Đang tính lại theo bộ lọc…
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-teal-500"></span>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Panel 1: Phễu Lọc Dữ Liệu Tổng Quan
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <Info className="size-3.5 text-sky-600 shrink-0" weight="bold" />
              <span>Bấm <strong>chuột phải</strong> vào tiêu chí để xem công thức • Bấm <strong>chuột trái vào Hoàn thành / Chưa hoàn thành</strong> để mở phễu chi tiết</span>
            </div>
          </div>

          <div className="w-full flex justify-center items-center py-2">
            <svg className="w-full max-w-[460px] drop-shadow-sm select-none" viewBox="0 0 440 430" fill="none" xmlns="http://www.w3.org/2000/svg">
              <SolidLayer
                top={{ cx: 220, cy: 35, rx: 190, ry: 22 }}
                bottom={{ cx: 220, cy: 110, rx: 145, ry: 17 }}
                fill="#0284c7"
                lidFill="#0369a1"
                count={l1}
                label="Tổng epic"
                labelColor="#e0f2fe"
                fontMain={22}
                onContextMenu={(e) => handleContextMenu(e, 'L01')}
              />
              <SolidLayer
                top={{ cx: 220, cy: 125, rx: 145, ry: 17 }}
                bottom={{ cx: 220, cy: 200, rx: 105, ry: 13 }}
                fill="#e11d48"
                lidFill="#be123c"
                count={l2}
                label="Phạm vi tính TTM"
                labelColor="#ffe4e6"
                fontMain={21}
                onContextMenu={(e) => handleContextMenu(e, 'L02')}
              />
              <SolidLayer
                top={{ cx: 220, cy: 215, rx: 105, ry: 13 }}
                bottom={{ cx: 220, cy: 290, rx: 70, ry: 9 }}
                fill="#2563eb"
                lidFill="#1d4ed8"
                count={l3}
                label="Chuẩn hoá dữ liệu"
                labelColor="#dbeafe"
                fontMain={20}
                onContextMenu={(e) => handleContextMenu(e, 'L03')}
              />
              {/* L04: L04a Epic hoàn thành | L04b Epic chưa hoàn thành */}
              <SplitLayer
                top={{ cx: 220, cy: 305, rx: 70, ry: 9 }}
                bottom={{ cx: 220, cy: 385, rx: 42, ry: 6 }}
                fontMain={13}
                fontSub={9.5}
                calloutElbow={25}
                calloutEnd={55}
                segments={[
                  {
                    key: '4a', count: l4a, alwaysShow: true, fill: '#0284c7', lidFill: '#0369a1', calloutColor: '#0369a1',
                    main: fmt(l4a), sub: 'Hoàn thành', ariaLabel: `L04a — ${l4a} Epic hoàn thành: bấm để mở/đóng Panel 2`,
                    active: activeRightPanel === 'COMPLETED', dimmed: activeRightPanel === 'IN_PROGRESS',
                    onActivate: () => toggleRightPanel('COMPLETED'),
                    onContextMenu: (e) => handleContextMenu(e, 'L04a'),
                  },
                  {
                    key: '4b', count: l4b, alwaysShow: true, fill: '#d97706', lidFill: '#b45309', calloutColor: '#b45309',
                    main: fmt(l4b), sub: 'Chưa hoàn thành', ariaLabel: `L04b — ${l4b} Epic chưa hoàn thành: bấm để mở/đóng Panel 3`,
                    active: activeRightPanel === 'IN_PROGRESS', dimmed: activeRightPanel === 'COMPLETED',
                    onActivate: () => toggleRightPanel('IN_PROGRESS'),
                    onContextMenu: (e) => handleContextMenu(e, 'L04b'),
                  },
                ]}
              />
            </svg>
          </div>

          {/* Footer Summary Strip */}
          <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="size-2 rounded-full bg-emerald-600"></span>
              <span>
                Epic chuẩn hoá dữ liệu:{' '}
                <strong className="text-slate-800 font-bold font-mono">
                  {fmt(l3)} Epic ({pct(l3, l1)})
                </strong>
              </span>
              <span className="text-slate-300">|</span>
              <span title="Tỷ lệ % Pass TTM-CNTT = L05aa / (L05aa + L05ab + L05ba); Tỷ lệ % Fail TTM-CNTT = (L05ab + L05ba) / (L05aa + L05ab + L05ba)">
                TTM-CNTT (QLDA): <strong className="font-mono font-bold text-emerald-700">Pass {passRate}</strong>
                {' · '}
                <strong className="font-mono font-bold text-rose-700">Fail {failRate}</strong>
              </span>
              {outOfScopeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailModalId('OUT_OF_SCOPE')}
                  className="text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline cursor-pointer"
                  title="Epic nằm ngoài “Phạm vi dữ liệu cho TTM” — không tính vào L01"
                >
                  Ngoài phạm vi dữ liệu cho TTM: <strong className="font-mono">{fmt(outOfScopeCount)}</strong>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              {isRightOpen ? (
                <>
                  <span>Đang mở phễu chi tiết:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${activeRightPanel === 'COMPLETED' ? 'bg-cyan-100 text-cyan-800' : 'bg-amber-100 text-amber-800'}`}>
                    {activeRightPanel === 'COMPLETED' ? 'Epic hoàn thành (Panel 2)' : 'Epic chưa hoàn thành (Panel 3)'}
                  </span>
                </>
              ) : (
                <span className="text-sky-700 italic">
                  Bấm vào Hoàn thành / Chưa hoàn thành để mở phễu chi tiết
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================= */}
        {/* PANEL 2 / 3 (RIGHT, ACCORDION)                                 */}
        {/* ============================================================= */}
        <div
          ref={rightPanelRef}
          className={`min-w-0 grid transition-[grid-template-rows,opacity] ${ACCORDION_TIMING} ${
            isRightOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] lg:grid-rows-[1fr] opacity-0 pointer-events-none'
          }`}
          aria-hidden={!isRightOpen}
          inert={!isRightOpen}
        >
          <div className="min-h-0 min-w-0 overflow-hidden">
            <div
              className={`transition-[opacity,transform] ${ACCORDION_TIMING} ${isRightOpen ? 'opacity-100 translate-x-0 delay-[175ms]!' : 'opacity-0 translate-x-8 delay-0!'}`}
            >
              <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between relative">
                {panelHeader(shownRightPanel)}

                {shownRightPanel === 'COMPLETED' ? (
                  <>
                    <div className="w-full flex justify-center items-center py-2">
                      <svg className="w-full max-w-[480px] drop-shadow-sm select-none" viewBox="0 0 480 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <SolidLayer
                          top={detailTop}
                          bottom={{ ...detailMid, cy: 115 }}
                          fill="#0284c7"
                          lidFill="#0369a1"
                          count={l4a}
                          label="Epic hoàn thành"
                          labelColor="#e0f2fe"
                          fontMain={21}
                          onContextMenu={(e) => handleContextMenu(e, 'L04a')}
                        />
                        <SplitLayer
                          top={detailMid}
                          bottom={detailBottom}
                          fontMain={14}
                          fontSub={10.5}
                          calloutElbow={55}
                          calloutEnd={90}
                          segments={[
                            {
                              key: '5aa', count: passCount, alwaysShow: true, fill: '#059669', lidFill: '#047857', calloutColor: '#047857',
                              main: `Đạt ${fmt(passCount)}`, sub: 'TTM-CNTT', ariaLabel: `L05aa — ${passCount} Epic đạt TTM-CNTT`,
                              onContextMenu: (e) => handleContextMenu(e, 'L05aa'),
                            },
                            {
                              key: '5ac', count: notScoredCount, fill: '#94a3b8', lidFill: '#64748b', calloutColor: '#475569',
                              main: `Chưa kết luận ${fmt(notScoredCount)}`, sub: 'R4G tương lai', ariaLabel: `L05ac — ${notScoredCount} Epic chưa kết luận`,
                              onContextMenu: (e) => handleContextMenu(e, 'L05ac'),
                            },
                            {
                              key: '5ab', count: lateCount, alwaysShow: true, fill: '#dc2626', lidFill: '#b91c1c', calloutColor: '#dc2626',
                              main: `Không đạt ${fmt(lateCount)}`, sub: 'Nhóm 1 · Trễ R4G', ariaLabel: `L05ab — ${lateCount} Epic không đạt TTM-CNTT (nhóm 1: R4G Date muộn hơn Target)`,
                              onContextMenu: (e) => handleContextMenu(e, 'L05ab'),
                            },
                          ]}
                        />
                      </svg>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span title="L05aa / (L05aa + L05ab + L05ba)">Tỷ lệ % Pass TTM-CNTT (QLDA):</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {passRate} ({fmt(passCount)}/{fmt(judgedCount)})
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-full flex justify-center items-center py-2">
                      <svg className="w-full max-w-[480px] drop-shadow-sm select-none" viewBox="0 0 480 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <SolidLayer
                          top={detailTop}
                          bottom={{ ...detailMid, cy: 115 }}
                          fill="#d97706"
                          lidFill="#b45309"
                          count={l4b}
                          label="Epic chưa hoàn thành"
                          labelColor="#fef3c7"
                          fontMain={21}
                          onContextMenu={(e) => handleContextMenu(e, 'L04b')}
                        />
                        <SplitLayer
                          top={detailMid}
                          bottom={detailBottom}
                          fontMain={14}
                          fontSub={10.5}
                          calloutElbow={55}
                          calloutEnd={90}
                          segments={[
                            {
                              key: '5bb', count: withinCount, alwaysShow: true, fill: '#2563eb', lidFill: '#1d4ed8', calloutColor: '#1d4ed8',
                              main: `Trong hạn ${fmt(withinCount)}`, sub: 'Chưa quá Target', ariaLabel: `L05bb — ${withinCount} Epic trong hạn`,
                              onContextMenu: (e) => handleContextMenu(e, 'L05bb'),
                            },
                            {
                              key: '5ba', count: overdueCount, alwaysShow: true, fill: '#dc2626', lidFill: '#b91c1c', calloutColor: '#dc2626',
                              main: `Không đạt ${fmt(overdueCount)}`, sub: 'Nhóm 2 · Quá Target', ariaLabel: `L05ba — ${overdueCount} Epic không đạt TTM-CNTT (nhóm 2: chưa có R4G Date, quá Target)`,
                              onContextMenu: (e) => handleContextMenu(e, 'L05ba'),
                            },
                          ]}
                        />
                      </svg>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span title="(L05ab + L05ba) / (L05aa + L05ab + L05ba)">Tỷ lệ % Fail TTM-CNTT (QLDA):</span>
                      <span className="font-mono font-bold text-rose-700">
                        {failRate} ({fmt(failCount)}/{fmt(judgedCount)})
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MA TRẬN PHÂN BỔ + PIE CHART — Lead view: every dimension; PM/SM view: Phân loại Epic & Dự án */}
      <div className={`flex flex-col gap-5 transition-opacity ${isRecomputing ? 'opacity-60' : ''}`} aria-busy={isRecomputing}>
        <BreakdownMatrixCard
          dimensions={viewMode === 'EXECUTIVE' ? ['domain', 'epicType', 'pmsm', 'project'] : ['epicType', 'project']}
          funnel={funnel}
          onOpen={openEpicListModal}
        />
        <div>
          <BreakdownDonutSections dimensions={donutDimensions} funnel={funnel} onOpen={openEpicListModal} />
        </div>
      </div>

      {/* ============================================================= */}
      {/* POPUP DIỄN GIẢI LAYER / GROUP (CHUỘT PHẢI)                     */}
      {/* ============================================================= */}
      {detailModalId !== null && detail && (
        <Modal
          isOpen
          onClose={() => setDetailModalId(null)}
          maxWidth="2xl"
          title={
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-700 border border-slate-300">
                [{detailModalId === 'OUT_OF_SCOPE' ? 'Ngoài phạm vi' : detailModalId}]
              </span>
              <span>{detail.heading}</span>
            </div>
          }
        >
          <div className="p-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4">
                <div className={`p-4 border rounded-xl space-y-1.5 ${detail.tone.box}`}>
                  <div className={`font-bold flex items-center justify-between text-sm ${detail.tone.strong}`}>
                    <span>{detail.summaryLabel}</span>
                    <span className={`font-mono font-extrabold text-lg ${detail.countColor}`}>{fmt(detail.count)} Epic</span>
                  </div>
                  {detail.ratioLine && <div className={`text-[11px] font-mono pt-1 ${detail.tone.soft}`}>{detail.ratioLine}</div>}
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">{detail.rule}</p>
                </div>
              </div>

              <div className="space-y-4">
                {detail.extra}
                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    {detail.formula}
                  </div>
                </div>

                {detail.drill && (
                  <div className="space-y-2 pt-2">
                    {[detail.drill, ...(detail.extraDrills ?? [])].map((drill) => (
                      <button
                        key={drill.title}
                        type="button"
                        disabled={drill.count === 0}
                        onClick={() => openEpicListModal(drill)}
                        className={`w-full py-2.5 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${detail.buttonClass}`}
                      >
                        <Eye className="size-4" />
                        <span>{drill.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Embedded Quản trị Epic — same popup (size, blurred backdrop) as TTM Dashboard */}
      <EpicAlertsIframeModal
        isOpen={epicModal !== null}
        onClose={() => setEpicModal(null)}
        title={epicModal?.title ?? ''}
        url={epicModal?.url ?? null}
      />

      {/* USER PREVIEW MODAL */}
      {showUserModal && (
        <Modal
          isOpen={showUserModal}
          onClose={() => setShowUserModal(false)}
          title="Chọn User để xem trước Dashboard"
        >
          <div className="p-4 space-y-4">
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm theo tên, email, role…"
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-[#1463f7]"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
              {filteredUsersForModal.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    setPreviewUserId(u.id);
                    setShowUserModal(false);
                  }}
                  className="w-full text-left p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="font-bold text-slate-900">{u.fullName}</div>
                    <div className="text-[11px] text-slate-500">{u.email}</div>
                  </div>
                  <Badge variant="neutral" className="text-[10px] font-mono">
                    {u.role}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
