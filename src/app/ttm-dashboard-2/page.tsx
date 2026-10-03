'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretRight,
  ChartPie,
  ClockCounterClockwise,
  Eye,
  Info,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicAlertsIframeModal } from '@/components/dashboard-new/EpicAlertsIframeModal';
import { SolidLayer, SplitLayer, type Ellipse } from '@/components/ttm-dashboard-2/FunnelLayers';
import { buildEpicAlertsDeepLink, type EpicAlertsDeepLinkAlert } from '@/lib/epic-alerts-deep-link';
import { formatTtmPct1 } from '@/lib/ttm-cntt-qa';
import { ttmFunnelBucket, type TtmFunnelBucket } from '@/lib/epic-row-verdicts';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
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
  isUserPreview: boolean;
  lastAggregatedAt: string | null;
  managedUsers: ManagedUserItem[];
  rows: DashboardEpicRow[];
  ttmIndexGlobal: TtmIndexGlobalCache | null;
  viewAsUser: { email: string; fullName: string; id: number; role: string } | null;
}

type NodeId =
  | 'LAYER-01'
  | 'LAYER-02'
  | 'LAYER-03'
  | 'LAYER-04A'
  | 'GROUP-05AA'
  | 'GROUP-05AB'
  | 'GROUP-05AC'
  | 'LAYER-04B'
  | 'GROUP-05BA'
  | 'GROUP-05BB'
  | 'LAYER-04C';

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
  return summary && summary.total > 0 ? `${formatTtmPct1(summary.pctPrecise)}%` : '—';
}

function formatTtmIndexTooltip(firstLine: string, summary: TtmCnttSummary | null | undefined): string {
  const secondLine = summary && summary.total > 0 ? `${summary.pass}/${summary.eligible} Epic đạt TTM` : '—';
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
  alert?: EpicAlertsDeepLinkAlert;
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
  buttonClass: string;
  extra?: React.ReactNode;
}

const EMPTY_BUCKETS: Record<TtmFunnelBucket, number> = {
  CANCELLED: 0,
  DATA_ANOMALY: 0,
  NO_R4G_OVERDUE: 0,
  NO_R4G_WITHIN_TARGET: 0,
  OUT_OF_SCOPE: 0,
  R4G_LATE: 0,
  R4G_NOT_SCORED: 0,
  R4G_PASS: 0,
};

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

  // Options for Filters
  const domainOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.domainName).filter((v): v is string => Boolean(v)))].sort();
  }, [data]);

  const projectOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.projectKey).filter((v): v is string => Boolean(v)))].sort();
  }, [data]);

  const pmSmOptions = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(data.rows.flatMap((r) => (r.ownerName || '').split(',').map((name) => name.trim()).filter(Boolean))),
    ].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  const requestingUnitOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.requestingUnit).filter((unit): unit is string => Boolean(unit)))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  const domainProjectKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const row of data.rows) {
      if (!row.domainName || !row.projectKey) continue;
      const set = map.get(row.domainName) ?? new Set<string>();
      set.add(row.projectKey);
      map.set(row.domainName, set);
    }
    return map;
  }, [data]);

  const handleDomainFilterChange = (domain: string) => {
    setFilterDomain(domain);
    const projects = domain ? Array.from(domainProjectKeys.get(domain) ?? []) : [];
    setFilterProjects(projects);
  };

  const resetAllFilters = () => {
    setFilterDomain('');
    setFilterProjects([]);
    setFilterPmSms([]);
    setFilterRequestingUnits([]);
  };

  // Layer 1: every Epic (Cancelled included) within the viewer's permission and the toolbar filters
  const layer1Rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((row) => {
      if (filterProjects.length > 0 && !filterProjects.includes(row.projectKey)) return false;
      if (filterDomain && row.domainName !== filterDomain) return false;
      if (
        filterPmSms.length > 0 &&
        !row.ownerName
          .split(',')
          .map((name) => name.trim())
          .some((name) => filterPmSms.includes(name))
      )
        return false;
      if (filterRequestingUnits.length > 0 && (!row.requestingUnit || !filterRequestingUnits.includes(row.requestingUnit)))
        return false;
      return true;
    });
  }, [data, filterProjects, filterDomain, filterPmSms, filterRequestingUnits]);

  // Every Epic lands in exactly one funnel leaf (ttmFunnelBucket) — the same definition the
  // Quản trị Epic drill-down filters use, so each number matches the list it opens.
  const funnel = useMemo(() => {
    const buckets = { ...EMPTY_BUCKETS };
    const allStatuses = new Set<string>();
    const cancelledStatuses = new Set<string>();
    for (const row of layer1Rows) {
      const bucket = ttmFunnelBucket(row);
      buckets[bucket] += 1;
      if (row.currentStatus) {
        allStatuses.add(row.currentStatus);
        if (bucket === 'CANCELLED') cancelledStatuses.add(row.currentStatus);
      }
    }
    const l1 = layer1Rows.length;
    const l2 = l1 - buckets.CANCELLED;
    const l3 = l2 - buckets.DATA_ANOMALY;
    const l4a = buckets.R4G_PASS + buckets.R4G_LATE + buckets.R4G_NOT_SCORED;
    const l4b = buckets.NO_R4G_OVERDUE + buckets.NO_R4G_WITHIN_TARGET;
    return {
      allStatuses: [...allStatuses].sort(),
      buckets,
      cancelledStatuses: [...cancelledStatuses].sort(),
      l1,
      l2,
      l3,
      l4a,
      l4b,
    };
  }, [layer1Rows]);

  // Scope statistics for Layer 1
  const layer1ScopeStats = useMemo(() => {
    const projects = new Set(layer1Rows.map((r) => r.projectKey).filter(Boolean)).size;
    const domains = new Set(layer1Rows.map((r) => r.domainName).filter(Boolean)).size;
    const pms = new Set(layer1Rows.flatMap((r) => (r.ownerName || '').split(',').map((s) => s.trim()).filter(Boolean))).size;
    const requestingUnits = new Set(layer1Rows.map((r) => r.requestingUnit).filter(Boolean)).size;
    return { domains, pms, projects, requestingUnits };
  }, [layer1Rows]);

  /** Quản trị Epic list behind a funnel number: viewer scope (or the previewed user's), this
   * screen's toolbar filters, and the node's own condition. */
  const openEpicListModal = (params: DrillParams & { title: string }) => {
    const url = buildEpicAlertsDeepLink({
      alert: params.alert,
      dataIssue: params.dataIssue,
      domain: filterProjects.length > 0 ? undefined : filterDomain || undefined,
      pmSm: filterPmSms.length > 0 ? filterPmSms : undefined,
      projects: filterProjects.length > 0 ? filterProjects : undefined,
      requestingUnit: filterRequestingUnits.length > 0 ? filterRequestingUnits : undefined,
      status: params.status,
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

  const { buckets, l1, l2, l3, l4a, l4b } = funnel;
  const cancelledCount = buckets.CANCELLED;
  const anomalyCount = buckets.DATA_ANOMALY;
  const outOfScopeCount = buckets.OUT_OF_SCOPE;
  const passCount = buckets.R4G_PASS;
  const lateCount = buckets.R4G_LATE;
  const notScoredCount = buckets.R4G_NOT_SCORED;
  const overdueCount = buckets.NO_R4G_OVERDUE;
  const withinCount = buckets.NO_R4G_WITHIN_TARGET;

  // -------------------------------------------------------------------------------------------
  // Popup content per layer/group (right-click)
  // -------------------------------------------------------------------------------------------
  const nodeDetails: Record<NodeId, NodeDetail> = {
    'LAYER-01': {
      heading: 'Layer 1 — Tổng Epic nguồn',
      count: l1,
      countColor: 'text-[#00b4d8]',
      tone: { box: 'bg-sky-50 border-sky-200', strong: 'text-sky-950', soft: 'text-sky-800' },
      summaryLabel: 'Tổng số Epic từ nguồn:',
      rule: 'Toàn bộ Epic (kể cả Epic đã Cancelled) thuộc phạm vi quyền của tài khoản — hoặc của user đang được xem dưới quyền — và các bộ lọc Domain, Dự án, PM/SM, Đơn vị yêu cầu đang chọn.',
      formula: <>Layer 1 = Tổng số Epic = <b>{fmt(l1)} Epic</b></>,
      drill: { count: l1, label: `Xem ${fmt(l1)} Epic trên Quản trị Epic`, status: funnel.allStatuses, title: 'Danh sách Epic - Layer 1 (Tổng Epic nguồn)' },
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
    'LAYER-02': {
      heading: 'Layer 2 — Lọc Cancelled',
      count: l2,
      countColor: 'text-[#ff4d4f]',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: 'Số lượng sau khi lọc Cancelled:',
      ratioLine: `Đã loại trừ: ${fmt(cancelledCount)} Epic · Tỷ lệ giữ lại: ${pct(l2, l1)}`,
      rule: (
        <>
          Loại các Epic có trạng thái chứa chữ <code>Cancel</code> (không phân biệt hoa/thường) — cùng quy tắc với các màn hình khác.
          Trạng thái gặp trong phạm vi hiện tại: {funnel.cancelledStatuses.length > 0 ? funnel.cancelledStatuses.map((status) => <code key={status} className="mr-1">{status}</code>) : <i>không có</i>}.
        </>
      ),
      formula: <>Layer 2 = Layer 1 ({fmt(l1)}) − Cancelled ({fmt(cancelledCount)})<br />= <b>{fmt(l2)} Epic</b></>,
      drill: { count: cancelledCount, label: `Xem ${fmt(cancelledCount)} Epic Cancelled bị loại`, status: funnel.cancelledStatuses, title: 'Danh sách Epic Cancelled (bị loại ở Layer 2)' },
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    'LAYER-03': {
      heading: 'Layer 3 — Lọc Sai lệch dữ liệu',
      count: l3,
      countColor: 'text-[#0284c7]',
      tone: { box: 'bg-indigo-50 border-indigo-200', strong: 'text-indigo-950', soft: 'text-indigo-800' },
      summaryLabel: 'Số lượng sau khi lọc Sai lệch dữ liệu:',
      ratioLine: `Sai lệch dữ liệu: ${fmt(anomalyCount)} Epic · Tỷ lệ đạt chuẩn: ${pct(l3, l2)}`,
      rule: 'Loại các Epic bị đánh dấu Sai lệch dữ liệu (ví dụ thiếu/ngược mốc ngày, trạng thái không khớp mốc ngày). Hệ thống không chấm Đạt/Fail cho các Epic này.',
      formula: (
        <>
          Layer 3 = Layer 2 ({fmt(l2)}) − Sai lệch ({fmt(anomalyCount)}) = <b>{fmt(l3)} Epic</b><br />
          = Hoàn thành ({fmt(l4a)}) + Chưa hoàn thành ({fmt(l4b)}){outOfScopeCount > 0 && <> + Ngoài phạm vi TTM-CNTT ({fmt(outOfScopeCount)})</>}
        </>
      ),
      drill: { count: anomalyCount, dataIssue: true, label: `Xem ${fmt(anomalyCount)} Epic Sai lệch dữ liệu`, title: 'Danh sách Epic Sai lệch dữ liệu (bị loại ở Layer 3)' },
      buttonClass: 'bg-[#0284c7] hover:bg-sky-700',
    },
    'LAYER-04A': {
      heading: 'Layer 4A — Epic hoàn thành (có R4G Date)',
      count: l4a,
      countColor: 'text-teal-700',
      tone: { box: 'bg-teal-50 border-teal-200', strong: 'text-teal-950', soft: 'text-teal-800' },
      summaryLabel: 'Số lượng Epic hoàn thành (có R4G Date):',
      ratioLine: `Tỷ lệ trong Layer 3: ${pct(l4a, l3)}`,
      rule: 'Epic thuộc Layer 3, nằm trong phạm vi TTM-CNTT và đã có R4G Date — chính là mẫu số của chỉ số TTM-CNTT (QLDA).',
      formula: <>Layer 4A = Đạt ({fmt(passCount)}) + Fail trễ R4G ({fmt(lateCount)}) + Chưa chấm ({fmt(notScoredCount)})<br />= <b>{fmt(l4a)} Epic</b></>,
      drill: { alert: 'TTM_ELIGIBLE_IN_SCOPE', count: l4a, label: `Xem ${fmt(l4a)} Epic hoàn thành`, title: 'Danh sách Epic hoàn thành (Layer 4A - có R4G Date)' },
      buttonClass: 'bg-teal-600 hover:bg-teal-700',
    },
    'GROUP-05AA': {
      heading: 'Nhóm 5AA — Đạt TTM-CNTT',
      count: passCount,
      countColor: 'text-emerald-600',
      tone: { box: 'bg-emerald-50 border-emerald-200', strong: 'text-emerald-950', soft: 'text-emerald-800' },
      summaryLabel: 'Số lượng Đạt TTM-CNTT:',
      ratioLine: `Tỷ lệ Đạt TTM-CNTT (QLDA): ${pct(passCount, l4a)}`,
      rule: 'Epic thuộc Layer 4A có R4G Date không muộn hơn Target R4G. Ở engine Scoring đây là badge “Đạt TTM-CNTT” (kể cả Epic Đạt kèm khuyến nghị “Sai Status”).',
      formula: <>Nhóm 5AA = Epic Layer 4A được chấm Đạt<br />= <b>{fmt(passCount)} Epic</b></>,
      drill: { alert: 'TTM_PASS_IN_SCOPE', count: passCount, label: `Xem ${fmt(passCount)} Epic Đạt TTM-CNTT`, title: 'Danh sách Epic Đạt TTM-CNTT (Nhóm 5AA)' },
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    },
    'GROUP-05AB': {
      heading: 'Nhóm 5AB — Fail TTM-CNTT (Trễ R4G)',
      count: lateCount,
      countColor: 'text-rose-600',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: 'Số lượng Fail TTM-CNTT (Trễ R4G):',
      ratioLine: `Tỷ lệ trong Layer 4A: ${pct(lateCount, l4a)}`,
      rule: 'Epic thuộc Layer 4A có R4G Date muộn hơn Target R4G → Fail TTM-CNTT (QLDA). Cùng con số với “Trễ R4G” ở TTM Dashboard.',
      formula: <>Nhóm 5AB = Epic Layer 4A bị chấm Fail<br />= <b>{fmt(lateCount)} Epic</b></>,
      drill: { alert: 'TTM_LATE_IN_SCOPE', count: lateCount, label: `Xem ${fmt(lateCount)} Epic Trễ R4G`, title: 'Danh sách Epic Fail TTM-CNTT - Trễ R4G (Nhóm 5AB)' },
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    'GROUP-05AC': {
      heading: 'Nhóm 5AC — Chưa chấm (R4G tương lai / thiếu Target)',
      count: notScoredCount,
      countColor: 'text-slate-600',
      tone: { box: 'bg-slate-50 border-slate-200', strong: 'text-slate-900', soft: 'text-slate-700' },
      summaryLabel: 'Số lượng Epic chưa chấm:',
      ratioLine: `Tỷ lệ trong Layer 4A: ${pct(notScoredCount, l4a)}`,
      rule: 'Epic thuộc Layer 4A nhưng chưa thể kết luận Đạt hay Fail: R4G Date còn ở tương lai (chưa tới ngày), hoặc không tính được Target R4G. Các Epic này vẫn nằm trong mẫu số TTM-CNTT (QLDA).',
      formula: <>Nhóm 5AC = Layer 4A ({fmt(l4a)}) − Đạt ({fmt(passCount)}) − Fail ({fmt(lateCount)})<br />= <b>{fmt(notScoredCount)} Epic</b></>,
      drill: { alert: 'TTM_NOT_SCORED_IN_SCOPE', count: notScoredCount, label: `Xem ${fmt(notScoredCount)} Epic chưa chấm`, title: 'Danh sách Epic có R4G nhưng chưa chấm (Nhóm 5AC)' },
      buttonClass: 'bg-slate-600 hover:bg-slate-700',
    },
    'LAYER-04B': {
      heading: 'Layer 4B — Epic chưa hoàn thành (chưa có R4G Date)',
      count: l4b,
      countColor: 'text-amber-600',
      tone: { box: 'bg-amber-50 border-amber-200', strong: 'text-amber-950', soft: 'text-amber-800' },
      summaryLabel: 'Số lượng Epic chưa hoàn thành:',
      ratioLine: `Tỷ lệ trong Layer 3: ${pct(l4b, l3)}`,
      rule: 'Epic thuộc Layer 3, nằm trong phạm vi TTM-CNTT nhưng chưa có R4G Date — chưa vào mẫu số TTM-CNTT (QLDA).',
      formula: <>Layer 4B = Quá Target ({fmt(overdueCount)}) + Trong hạn ({fmt(withinCount)})<br />= <b>{fmt(l4b)} Epic</b></>,
      drill: { alert: 'MISSING_R4G_IN_SCOPE', count: l4b, label: `Xem ${fmt(l4b)} Epic chưa hoàn thành`, title: 'Danh sách Epic chưa hoàn thành (Layer 4B - chưa có R4G Date)' },
      buttonClass: 'bg-amber-600 hover:bg-amber-700',
    },
    'GROUP-05BA': {
      heading: 'Nhóm 5BA — Fail TTM-CNTT (Quá Target)',
      count: overdueCount,
      countColor: 'text-rose-600',
      tone: { box: 'bg-rose-50 border-rose-200', strong: 'text-rose-950', soft: 'text-rose-800' },
      summaryLabel: 'Số lượng Fail TTM-CNTT (Quá Target):',
      ratioLine: `Tỷ lệ trong Layer 4B: ${pct(overdueCount, l4b)}`,
      rule: 'Epic chưa có R4G Date và đã quá Target R4G → Fail TTM-CNTT (QLDA). Cùng con số với “Thiếu R4G” ở TTM Dashboard.',
      formula: <>Nhóm 5BA = Epic Layer 4B đã quá Target R4G<br />= <b>{fmt(overdueCount)} Epic</b></>,
      drill: { alert: 'OVERDUE_MISSING_R4G_IN_SCOPE', count: overdueCount, label: `Xem ${fmt(overdueCount)} Epic quá Target`, title: 'Danh sách Epic chưa có R4G - Quá Target (Nhóm 5BA)' },
      buttonClass: 'bg-rose-600 hover:bg-rose-700',
    },
    'GROUP-05BB': {
      heading: 'Nhóm 5BB — Đang trong hạn',
      count: withinCount,
      countColor: 'text-[#0284c7]',
      tone: { box: 'bg-sky-50 border-sky-200', strong: 'text-sky-950', soft: 'text-sky-800' },
      summaryLabel: 'Số lượng Epic đang trong hạn:',
      ratioLine: `Tỷ lệ trong Layer 4B: ${pct(withinCount, l4b)}`,
      rule: 'Epic chưa có R4G Date và chưa quá Target R4G — vẫn còn cơ hội Đạt TTM-CNTT.',
      formula: <>Nhóm 5BB = Layer 4B ({fmt(l4b)}) − Quá Target ({fmt(overdueCount)})<br />= <b>{fmt(withinCount)} Epic</b></>,
      drill: { alert: 'WITHIN_TARGET_MISSING_R4G', count: withinCount, label: `Xem ${fmt(withinCount)} Epic đang trong hạn`, title: 'Danh sách Epic chưa có R4G - Đang trong hạn (Nhóm 5BB)' },
      buttonClass: 'bg-[#0284c7] hover:bg-sky-700',
    },
    'LAYER-04C': {
      heading: 'Layer 4C — Ngoài phạm vi TTM-CNTT',
      count: outOfScopeCount,
      countColor: 'text-slate-600',
      tone: { box: 'bg-slate-50 border-slate-200', strong: 'text-slate-900', soft: 'text-slate-700' },
      summaryLabel: 'Số lượng Epic ngoài phạm vi TTM-CNTT:',
      ratioLine: `Tỷ lệ trong Layer 3: ${pct(outOfScopeCount, l3)}`,
      rule: 'Epic thuộc Layer 3 nhưng nằm ngoài “Phạm vi dữ liệu cho TTM” (cấu hình ở Cấu hình cảnh báo) nên không được chấm TTM-CNTT.',
      formula: <>Layer 4C = Layer 3 ({fmt(l3)}) − Layer 4A ({fmt(l4a)}) − Layer 4B ({fmt(l4b)})<br />= <b>{fmt(outOfScopeCount)} Epic</b></>,
      drill: { alert: 'OUT_OF_SCOPE_NO_ANOMALY', count: outOfScopeCount, label: `Xem ${fmt(outOfScopeCount)} Epic ngoài phạm vi`, title: 'Danh sách Epic ngoài phạm vi TTM-CNTT (Layer 4C)' },
      buttonClass: 'bg-slate-600 hover:bg-slate-700',
    },
  };

  const detail = detailModalId ? nodeDetails[detailModalId] : null;

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
            Chưa xong ({fmt(l4b)})
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
              ['TTM-CNTT (QLDA)', 'Chỉ số TTM-CNTT (QLDA) tính trên toàn bộ Epic', data?.ttmIndexGlobal?.ttm, 'text-fb-blue'],
              ['TTM-CNTT (QA)', 'Chỉ số TTM-CNTT (QA) tính trên toàn bộ Epic', data?.ttmIndexGlobal?.qa, 'text-purple-700'],
              ['TTM-E2E', 'Chỉ số Hoàn thành TTM-E2E tính trên toàn bộ Epic', data?.ttmIndexGlobal?.e2e, 'text-emerald-700'],
            ] as const).map(([label, tooltip, summary, color]) => (
              <div
                key={label}
                className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left shadow-2xs"
                title={formatTtmIndexTooltip(tooltip, summary)}
              >
                <div className="flex flex-col justify-center leading-none">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-fb-text-secondary">{label}</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-xs font-black ${color}`}>{formatTtmIndexValue(summary)}</span>
                    {summary && summary.total > 0 && (
                      <span className="text-[10px] font-medium text-fb-text-secondary">({summary.pass}/{summary.eligible})</span>
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
            <div className="flex h-9 items-center rounded-lg border border-fb-border bg-fb-surface-muted p-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPreviewUserId(null);
                  setViewMode('EXECUTIVE');
                }}
                className={`flex h-7 items-center justify-center rounded-md px-3 text-xs font-bold transition-all ${
                  viewMode === 'EXECUTIVE' ? 'bg-fb-blue text-white shadow-xs' : 'text-fb-text-secondary hover:text-fb-text-primary'
                }`}
              >
                Lead
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMode !== 'OPERATIONAL') {
                    setFilterPmSms([]);
                    setShowUserModal(true);
                  }
                }}
                className={`flex h-7 items-center justify-center rounded-md px-3 text-xs font-bold transition-all ${
                  viewMode === 'OPERATIONAL' ? 'bg-fb-blue text-white shadow-xs' : 'text-fb-text-secondary hover:text-fb-text-primary'
                }`}
              >
                PM/SM
              </button>
            </div>
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

        {data?.lastAggregatedAt && (
          <div className="ttm-report-date ml-auto text-xs text-fb-text-secondary hidden sm:block">
            Dữ liệu cập nhật: <b>{formatDateTime(data.lastAggregatedAt)}</b>
          </div>
        )}
      </section>

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
        <div className="min-w-0 bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between relative">

          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-teal-500"></span>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Panel 1: Phễu Lọc Dữ Liệu Tổng Quan
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <Info className="size-3.5 text-sky-600 shrink-0" weight="bold" />
              <span>Bấm <strong>chuột phải</strong> vào tầng để xem công thức • Bấm <strong>chuột trái vào Layer 4</strong> để mở phễu chi tiết</span>
            </div>
          </div>

          <div className="w-full flex justify-center items-center py-2">
            <svg className="w-full max-w-[460px] drop-shadow-md select-none" viewBox="0 0 440 430" fill="none" xmlns="http://www.w3.org/2000/svg">
              <SolidLayer
                top={{ cx: 220, cy: 35, rx: 190, ry: 22 }}
                bottom={{ cx: 220, cy: 110, rx: 145, ry: 17 }}
                fill="#00b4d8"
                lidFill="#00838f"
                count={l1}
                label="Tổng Epic"
                labelColor="#e0f7fa"
                fontMain={22}
                onContextMenu={(e) => handleContextMenu(e, 'LAYER-01')}
              />
              <SolidLayer
                top={{ cx: 220, cy: 125, rx: 145, ry: 17 }}
                bottom={{ cx: 220, cy: 200, rx: 105, ry: 13 }}
                fill="#ff4d4f"
                lidFill="#cf1322"
                count={l2}
                label="Lọc Cancelled"
                labelColor="#ffebee"
                fontMain={21}
                onContextMenu={(e) => handleContextMenu(e, 'LAYER-02')}
              />
              <SolidLayer
                top={{ cx: 220, cy: 215, rx: 105, ry: 13 }}
                bottom={{ cx: 220, cy: 290, rx: 70, ry: 9 }}
                fill="#0284c7"
                lidFill="#0369a1"
                count={l3}
                label="Lọc Sai lệch dữ liệu"
                labelColor="#e0f2fe"
                fontMain={20}
                onContextMenu={(e) => handleContextMenu(e, 'LAYER-03')}
              />
              {/* LAYER 4: Hoàn thành | Chưa xong | (Ngoài phạm vi, only when > 0) */}
              <SplitLayer
                top={{ cx: 220, cy: 305, rx: 70, ry: 9 }}
                bottom={{ cx: 220, cy: 385, rx: 42, ry: 6 }}
                fontMain={13}
                fontSub={9.5}
                calloutElbow={25}
                calloutEnd={55}
                segments={[
                  {
                    key: '4a', count: l4a, alwaysShow: true, fill: '#00b4d8', lidFill: '#00838f', calloutColor: '#0e7490',
                    main: fmt(l4a), sub: 'Hoàn thành', ariaLabel: `Layer 4A — ${l4a} Epic hoàn thành: bấm để mở/đóng Panel 2`,
                    active: activeRightPanel === 'COMPLETED', dimmed: activeRightPanel === 'IN_PROGRESS',
                    onActivate: () => toggleRightPanel('COMPLETED'),
                    onContextMenu: (e) => handleContextMenu(e, 'LAYER-04A'),
                  },
                  {
                    key: '4b', count: l4b, alwaysShow: true, fill: '#f59e0b', lidFill: '#b45309', calloutColor: '#b45309',
                    main: fmt(l4b), sub: 'Chưa xong', ariaLabel: `Layer 4B — ${l4b} Epic chưa hoàn thành: bấm để mở/đóng Panel 3`,
                    active: activeRightPanel === 'IN_PROGRESS', dimmed: activeRightPanel === 'COMPLETED',
                    onActivate: () => toggleRightPanel('IN_PROGRESS'),
                    onContextMenu: (e) => handleContextMenu(e, 'LAYER-04B'),
                  },
                  {
                    key: '4c', count: outOfScopeCount, fill: '#94a3b8', lidFill: '#64748b', calloutColor: '#475569',
                    main: fmt(outOfScopeCount), sub: 'Ngoài phạm vi', ariaLabel: `Layer 4C — ${outOfScopeCount} Epic ngoài phạm vi TTM-CNTT`,
                    onContextMenu: (e) => handleContextMenu(e, 'LAYER-04C'),
                  },
                ]}
              />
            </svg>
          </div>

          {/* Footer Summary Strip */}
          <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500"></span>
              <span>
                Tập dữ liệu chuẩn Layer 3:{' '}
                <strong className="text-slate-900 font-bold font-mono">
                  {fmt(l3)} Epic ({pct(l3, l1)})
                </strong>
              </span>
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
                  Bấm vào nửa Hoàn thành / Chưa xong ở Layer 4 để mở phễu chi tiết
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
                      <svg className="w-full max-w-[480px] drop-shadow-md select-none" viewBox="0 0 480 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <SolidLayer
                          top={detailTop}
                          bottom={{ ...detailMid, cy: 115 }}
                          fill="#00b4d8"
                          lidFill="#00838f"
                          count={l4a}
                          label="Epic hoàn thành"
                          labelColor="#e0f7fa"
                          fontMain={21}
                          onContextMenu={(e) => handleContextMenu(e, 'LAYER-04A')}
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
                              key: '5aa', count: passCount, alwaysShow: true, fill: '#10b981', lidFill: '#047857', calloutColor: '#047857',
                              main: `Đạt ${fmt(passCount)}`, sub: 'TTM-CNTT', ariaLabel: `Nhóm 5AA — ${passCount} Epic Đạt TTM-CNTT`,
                              onContextMenu: (e) => handleContextMenu(e, 'GROUP-05AA'),
                            },
                            {
                              key: '5ac', count: notScoredCount, fill: '#94a3b8', lidFill: '#64748b', calloutColor: '#475569',
                              main: `Chưa chấm ${fmt(notScoredCount)}`, sub: 'Chưa kết luận', ariaLabel: `Nhóm 5AC — ${notScoredCount} Epic chưa chấm`,
                              onContextMenu: (e) => handleContextMenu(e, 'GROUP-05AC'),
                            },
                            {
                              key: '5ab', count: lateCount, alwaysShow: true, fill: '#ef4444', lidFill: '#b91c1c', calloutColor: '#dc2626',
                              main: `Fail ${fmt(lateCount)}`, sub: 'Trễ R4G', ariaLabel: `Nhóm 5AB — ${lateCount} Epic Fail TTM-CNTT trễ R4G`,
                              onContextMenu: (e) => handleContextMenu(e, 'GROUP-05AB'),
                            },
                          ]}
                        />
                      </svg>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>Tỷ lệ Đạt TTM-CNTT (QLDA):</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {pct(passCount, l4a)} ({fmt(passCount)}/{fmt(l4a)})
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-full flex justify-center items-center py-2">
                      <svg className="w-full max-w-[480px] drop-shadow-md select-none" viewBox="0 0 480 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <SolidLayer
                          top={detailTop}
                          bottom={{ ...detailMid, cy: 115 }}
                          fill="#f59e0b"
                          lidFill="#b45309"
                          count={l4b}
                          label="Epic chưa hoàn thành"
                          labelColor="#fef3c7"
                          fontMain={21}
                          onContextMenu={(e) => handleContextMenu(e, 'LAYER-04B')}
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
                              key: '5bb', count: withinCount, alwaysShow: true, fill: '#0284c7', lidFill: '#0369a1', calloutColor: '#0369a1',
                              main: `Trong hạn ${fmt(withinCount)}`, sub: 'Chưa quá Target', ariaLabel: `Nhóm 5BB — ${withinCount} Epic đang trong hạn`,
                              onContextMenu: (e) => handleContextMenu(e, 'GROUP-05BB'),
                            },
                            {
                              key: '5ba', count: overdueCount, alwaysShow: true, fill: '#ef4444', lidFill: '#b91c1c', calloutColor: '#dc2626',
                              main: `Fail ${fmt(overdueCount)}`, sub: 'Quá Target', ariaLabel: `Nhóm 5BA — ${overdueCount} Epic quá Target`,
                              onContextMenu: (e) => handleContextMenu(e, 'GROUP-05BA'),
                            },
                          ]}
                        />
                      </svg>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>Tiến độ Epic chưa hoàn thành:</span>
                      <span className="font-mono font-bold text-slate-700">
                        {fmt(withinCount)} trong hạn · <span className="text-rose-600 font-extrabold">{fmt(overdueCount)} quá Target</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
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
                [{detailModalId}]
              </span>
              <span>Chi tiết {detail.heading}</span>
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
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={detail.drill.count === 0}
                      onClick={() => detail.drill && openEpicListModal(detail.drill)}
                      className={`w-full py-2.5 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${detail.buttonClass}`}
                    >
                      <Eye className="size-4" />
                      <span>{detail.drill.label}</span>
                    </button>
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
