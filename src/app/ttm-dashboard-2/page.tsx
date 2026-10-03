'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CaretRight,
  ChartPie,
  ClockCounterClockwise,
  Eye,
  FileText,
  Funnel,
  Info,
  MagnifyingGlass,
  SlidersHorizontal,
  UserSwitch,
  X,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { buildEpicAlertsDeepLink } from '@/lib/epic-alerts-deep-link';
import { formatTtmPct1 } from '@/lib/ttm-cntt-qa';
import { isTtmIndexPass, ttmFailKind } from '@/lib/epic-row-verdicts';
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

type LayerOrGroupId =
  | 'LAYER-01'
  | 'LAYER-02'
  | 'LAYER-03'
  | 'LAYER-04A'
  | 'GROUP-05AA'
  | 'GROUP-05AB'
  | 'LAYER-04B'
  | 'GROUP-05BA'
  | 'GROUP-05BB';

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

export default function TtmDashboard2Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);

  // User Preview State
  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'EXECUTIVE' | 'OPERATIONAL'>('EXECUTIVE');

  // Layer Detail Modal (Opened ONLY via right-click context menu or explicit audit click)
  const [detailModalId, setDetailModalId] = useState<LayerOrGroupId | null>(null);

  // Active Right-side Detail Panel ('COMPLETED' | 'IN_PROGRESS' | null) — Default hidden (null)
  const [activeRightPanel, setActiveRightPanel] = useState<'COMPLETED' | 'IN_PROGRESS' | null>(null);

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

  const isAdminOrSupervisor = useMemo(() => {
    return data ? ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(data.actor.role) : false;
  }, [data]);

  // Options for Filters
  const domainOptions = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        data.rows
          .map((r) => r.domainName)
          .filter((v): v is string => Boolean(v))
      ),
    ].sort();
  }, [data]);

  const projectOptions = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        data.rows
          .map((r) => r.projectKey)
          .filter((v): v is string => Boolean(v))
      ),
    ].sort();
  }, [data]);

  const pmSmOptions = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        data.rows.flatMap((r) =>
          (r.ownerName || '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
        )
      ),
    ].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  const requestingUnitOptions = useMemo(() => {
    if (!data) return [];
    return [
      ...new Set(
        data.rows
          .map((r) => r.requestingUnit)
          .filter((unit): unit is string => Boolean(unit))
      ),
    ].sort((a, b) => a.localeCompare(b, 'vi'));
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

  // -------------------------------------------------------------
  // PANEL 1: DATA LAYERS 1, 2, 3
  // -------------------------------------------------------------
  // Layer 1: All Epics within viewer permission and applied toolbar filters
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

  // Layer 2: Layer 1 - Cancelled Epics
  const cancelledRows = useMemo(() => {
    return layer1Rows.filter((r) => isCancelledStatus(r.currentStatus || ''));
  }, [layer1Rows]);

  const layer2Rows = useMemo(() => {
    return layer1Rows.filter((r) => !isCancelledStatus(r.currentStatus || ''));
  }, [layer1Rows]);

  // Layer 3: Layer 2 - Data Anomaly Violations
  const anomalyRows = useMemo(() => {
    return layer2Rows.filter((r) => r.hasDataAnomaly);
  }, [layer2Rows]);

  const layer3Rows = useMemo(() => {
    return layer2Rows.filter((r) => !r.hasDataAnomaly);
  }, [layer2Rows]);

  // -------------------------------------------------------------
  // PANEL 2A: EPIC HOÀN THÀNH (Tách từ Layer 3)
  // -------------------------------------------------------------
  // Layer 4a: Epics in Layer 3 that have r4gDate recorded
  const layer4aRows = useMemo(() => {
    return layer3Rows.filter((r) => r.r4gDate !== null && r.r4gDate !== '');
  }, [layer3Rows]);

  // Group 5aa: Pass TTM-CNTT
  const group5aaRows = useMemo(() => {
    return layer4aRows.filter((r) => isTtmIndexPass(r));
  }, [layer4aRows]);

  // Group 5ab: Fail TTM-CNTT (Layer 4a - 5aa)
  const group5abRows = useMemo(() => {
    return layer4aRows.filter((r) => !isTtmIndexPass(r));
  }, [layer4aRows]);

  // -------------------------------------------------------------
  // PANEL 2B: EPIC CHƯA HOÀN THÀNH (Tách từ Layer 3)
  // -------------------------------------------------------------
  // Layer 4b: Epics in Layer 3 without r4gDate (Layer 3 - Layer 4a)
  const layer4bRows = useMemo(() => {
    return layer3Rows.filter((r) => !r.r4gDate || r.r4gDate === '');
  }, [layer3Rows]);

  // Group 5ba: Fail TTM-CNTT (alertLevel === 'FAIL' || ttmFailKind === 'MISSING_R4G')
  const group5baRows = useMemo(() => {
    return layer4bRows.filter(
      (r) => r.alertLevel === 'FAIL' || ttmFailKind(r) === 'MISSING_R4G'
    );
  }, [layer4bRows]);

  // Group 5bb: Remaining Epics within budget (Layer 4b - 5ba)
  const group5bbRows = useMemo(() => {
    return layer4bRows.filter(
      (r) => !(r.alertLevel === 'FAIL' || ttmFailKind(r) === 'MISSING_R4G')
    );
  }, [layer4bRows]);

  // Scope statistics for Layer 1
  const layer1ScopeStats = useMemo(() => {
    const projects = new Set(layer1Rows.map((r) => r.projectKey).filter(Boolean)).size;
    const domains = new Set(layer1Rows.map((r) => r.domainName).filter(Boolean)).size;
    const pms = new Set(
      layer1Rows.flatMap((r) =>
        (r.ownerName || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ).size;
    const requestingUnits = new Set(layer1Rows.map((r) => r.requestingUnit).filter(Boolean)).size;
    return { domains, pms, projects, requestingUnits };
  }, [layer1Rows]);

  // Deep link builder to Epic Management screen
  const getEpicAlertsLink = (params: {
    alert?: 'ACHIEVED_CNTT' | 'FAIL' | 'FAIL_LATE_R4G' | 'FAIL_MISSING_R4G';
    dataIssue?: boolean;
    status?: string[];
  }) => {
    return buildEpicAlertsDeepLink({
      alert: params.alert,
      dataIssue: params.dataIssue,
      domain: filterProjects.length > 0 ? undefined : filterDomain || undefined,
      pmSm: filterPmSms.length > 0 ? filterPmSms : undefined,
      projects: filterProjects.length > 0 ? filterProjects : undefined,
      requestingUnit: filterRequestingUnits.length > 0 ? filterRequestingUnits : undefined,
      status: params.status,
    });
  };

  const handleContextMenu = (e: React.MouseEvent, id: LayerOrGroupId) => {
    e.preventDefault();
    setDetailModalId(id);
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

  const l1Count = layer1Rows.length;
  const l2Count = layer2Rows.length;
  const l3Count = layer3Rows.length;
  const cancelledCount = cancelledRows.length;
  const anomalyCount = anomalyRows.length;

  const l4aCount = layer4aRows.length;
  const g5aaCount = group5aaRows.length;
  const g5abCount = group5abRows.length;

  const l4bCount = layer4bRows.length;
  const g5baCount = group5baRows.length;
  const g5bbCount = group5bbRows.length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans antialiased p-4 md:p-6 space-y-4">
      
      {/* PAGE HEADER BANNER (Exact match with TTM Dashboard image 2) */}
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

        {/* Right side widgets & controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Global TTM Indicators */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-fb-blue hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số TTM-CNTT (QLDA) tính trên toàn bộ Epic', data?.ttmIndexGlobal?.ttm)}
            >
              <div className="flex flex-col justify-center leading-none">
                <span className="text-[9px] font-bold uppercase tracking-wider text-fb-text-secondary group-hover:text-fb-blue transition-colors">
                  TTM-CNTT (QLDA)
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs font-black text-fb-blue">
                    {formatTtmIndexValue(data?.ttmIndexGlobal?.ttm)}
                  </span>
                  {data?.ttmIndexGlobal?.ttm && data.ttmIndexGlobal.ttm.total > 0 && (
                    <span className="text-[10px] font-medium text-fb-text-secondary">
                      ({data.ttmIndexGlobal.ttm.pass}/{data.ttmIndexGlobal.ttm.eligible})
                    </span>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-purple-400 hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số TTM-CNTT (QA) tính trên toàn bộ Epic', data?.ttmIndexGlobal?.qa)}
            >
              <div className="flex flex-col justify-center leading-none">
                <span className="text-[9px] font-bold uppercase tracking-wider text-fb-text-secondary group-hover:text-purple-700 transition-colors">
                  TTM-CNTT (QA)
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs font-black text-purple-700">
                    {formatTtmIndexValue(data?.ttmIndexGlobal?.qa)}
                  </span>
                  {data?.ttmIndexGlobal?.qa && data.ttmIndexGlobal.qa.total > 0 && (
                    <span className="text-[10px] font-medium text-fb-text-secondary">
                      ({data.ttmIndexGlobal.qa.pass}/{data.ttmIndexGlobal.qa.eligible})
                    </span>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-emerald-400 hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số Hoàn thành TTM-E2E tính trên toàn bộ Epic', data?.ttmIndexGlobal?.e2e)}
            >
              <div className="flex flex-col justify-center leading-none">
                <span className="text-[9px] font-bold uppercase tracking-wider text-fb-text-secondary group-hover:text-emerald-700 transition-colors">
                  TTM-E2E
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs font-black text-emerald-700">
                    {formatTtmIndexValue(data?.ttmIndexGlobal?.e2e)}
                  </span>
                  {data?.ttmIndexGlobal?.e2e && data.ttmIndexGlobal.e2e.total > 0 && (
                    <span className="text-[10px] font-medium text-fb-text-secondary">
                      ({data.ttmIndexGlobal.e2e.pass}/{data.ttmIndexGlobal.e2e.eligible})
                    </span>
                  )}
                </div>
              </div>
            </button>
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
                  viewMode === 'EXECUTIVE'
                    ? 'bg-fb-blue text-white shadow-xs'
                    : 'text-fb-text-secondary hover:text-fb-text-primary'
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
                  viewMode === 'OPERATIONAL'
                    ? 'bg-fb-blue text-white shadow-xs'
                    : 'text-fb-text-secondary hover:text-fb-text-primary'
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

        {/* 1. Chọn Domain */}
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

        {/* 2. Chọn Dự án */}
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

        {/* 3. Chọn PM/SM */}
        <ToolbarMultiSelect
          ariaLabel="PM/SM"
          searchable
          allLabel="Tất cả PM/SM"
          options={pmSmOptions}
          value={filterPmSms}
          onChange={setFilterPmSms}
        />

        {/* 4. Chọn Đơn vị yêu cầu */}
        <ToolbarMultiSelect
          ariaLabel="Đơn vị yêu cầu"
          searchable
          allLabel="Tất cả đơn vị yêu cầu"
          options={requestingUnitOptions}
          value={filterRequestingUnits}
          onChange={setFilterRequestingUnits}
        />

        {/* Reset button */}
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

        {/* Data Aggregation Timestamp */}
        {data?.lastAggregatedAt && (
          <div className="ttm-report-date ml-auto text-xs text-fb-text-secondary hidden sm:block">
            Dữ liệu cập nhật: <b>{formatDateTime(data.lastAggregatedAt)}</b>
          </div>
        )}
      </section>

      {/* ============================================================= */}
      {/* MAIN LAYOUT: CONDITIONAL 1-COLUMN OR 2-COLUMN                  */}
      {/* ============================================================= */}
      <div className={activeRightPanel ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : 'w-full'}>
        
        {/* ============================================================= */}
        {/* PANEL 1: PHỄU LỌC DỮ LIỆU TỔNG QUAN & PHÂN NHÁNH TIẾN ĐỘ       */}
        {/* ============================================================= */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between relative">
          
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-teal-500"></span>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Panel 1: Phễu Lọc Dữ Liệu Tổng Quan
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <Info className="size-3.5 text-sky-600 shrink-0" weight="bold" />
              <span>Bấm <strong>chuột phải</strong> vào tầng để xem công thức • Bấm <strong>chuột trái vào Layer 4</strong> để xem chi tiết bên phải</span>
            </div>
          </div>

          {/* 3D Conical Ring SVG - 4 Layers (Seamless & Flush Alignment) */}
          <div className="w-full flex justify-center items-center py-2">
            {(() => {
              // Calculate split geometry for Layer 4 (Ratio clamped between 0.2 and 0.8)
              const totalL4 = l4aCount + l4bCount || 1;
              const rawRatioL4 = l4aCount / totalL4;
              const ratioL4 = Math.min(Math.max(rawRatioL4, 0.2), 0.8);

              // Layer 4 Top Rim: cx=220, cy=305, rx=70, ry=9. Left=150, Right=290
              // Layer 4 Bottom: cx=220, cy=385, rx=42, ry=6. Left=178, Right=262
              const l4TopSplitX = 150 + 140 * ratioL4;
              const uTop = (l4TopSplitX - 220) / 70;
              const l4TopSplitY = 305 + 9 * Math.sqrt(Math.max(0, 1 - uTop * uTop));

              const l4BotSplitX = 178 + 84 * ratioL4;
              const uBot = (l4BotSplitX - 220) / 42;
              const l4BotSplitY = 385 + 6 * Math.sqrt(Math.max(0, 1 - uBot * uBot));

              const l4aMidX = (150 + l4TopSplitX) / 2;
              const l4bMidX = (l4TopSplitX + 290) / 2;

              return (
                <svg
                  className="w-full max-w-[460px] drop-shadow-md select-none"
                  viewBox="0 0 440 430"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <clipPath id="p1-l4-left-lid-clip">
                      <rect x="0" y="0" width={l4TopSplitX} height="500" />
                    </clipPath>
                    <clipPath id="p1-l4-right-lid-clip">
                      <rect x={l4TopSplitX} y="0" width="500" height="500" />
                    </clipPath>
                  </defs>

                  {/* ---------------------------------------------------------
                       LAYER 1: Teal / Cyan (01)
                       Top: rx=190, ry=22, cx=220, cy=35. Left=30, Right=410
                       Bottom: rx=145, ry=17, cy=110. Left=75, Right=365
                       --------------------------------------------------------- */}
                  <g
                    className="cursor-context-menu transition-all duration-200 hover:brightness-105"
                    onContextMenu={(e) => handleContextMenu(e, 'LAYER-01')}
                  >
                    <path
                      d="M 30 35 
                         A 190 22 0 0 0 410 35 
                         L 365 110 
                         A 145 17 0 0 1 75 110 
                         Z"
                      fill="#00b4d8"
                    />
                    <ellipse cx="220" cy="35" rx="190" ry="22" fill="#00838f" />
                    <ellipse cx="220" cy="33" rx="180" ry="18" fill="#0097a7" opacity="0.5" />
                    
                    <text
                      x="220"
                      y="78"
                      fill="#ffffff"
                      fontSize="22"
                      fontWeight="800"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      {l1Count.toLocaleString('vi-VN')}
                    </text>
                    <text
                      x="220"
                      y="98"
                      fill="#e0f7fa"
                      fontSize="12"
                      fontWeight="400"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      Tổng Epic
                    </text>
                  </g>

                  {/* ---------------------------------------------------------
                       LAYER 2: Coral Red (02)
                       Top: rx=145, ry=17, cx=220, cy=125. Left=75, Right=365
                       Bottom: rx=105, ry=13, cy=200. Left=115, Right=325
                       --------------------------------------------------------- */}
                  <g
                    className="cursor-context-menu transition-all duration-200 hover:brightness-105"
                    onContextMenu={(e) => handleContextMenu(e, 'LAYER-02')}
                  >
                    <path
                      d="M 75 125 
                         A 145 17 0 0 0 365 125 
                         L 325 200 
                         A 105 13 0 0 1 115 200 
                         Z"
                      fill="#ff4d4f"
                    />
                    <ellipse cx="220" cy="125" rx="145" ry="17" fill="#cf1322" />
                    
                    <text
                      x="220"
                      y="168"
                      fill="#ffffff"
                      fontSize="21"
                      fontWeight="800"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      {l2Count.toLocaleString('vi-VN')}
                    </text>
                    <text
                      x="220"
                      y="188"
                      fill="#ffebee"
                      fontSize="12"
                      fontWeight="400"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      Lọc Cancelled
                    </text>
                  </g>

                  {/* ---------------------------------------------------------
                       LAYER 3: Blue (03)
                       Top: rx=105, ry=13, cx=220, cy=215. Left=115, Right=325
                       Bottom: rx=70, ry=9, cy=290. Left=150, Right=290
                       --------------------------------------------------------- */}
                  <g
                    className="cursor-context-menu transition-all duration-200 hover:brightness-105"
                    onContextMenu={(e) => handleContextMenu(e, 'LAYER-03')}
                  >
                    <path
                      d="M 115 215 
                         A 105 13 0 0 0 325 215 
                         L 290 290 
                         A 70 9 0 0 1 150 290 
                         Z"
                      fill="#0284c7"
                    />
                    <ellipse cx="220" cy="215" rx="105" ry="13" fill="#0369a1" />
                    
                    <text
                      x="220"
                      y="258"
                      fill="#ffffff"
                      fontSize="20"
                      fontWeight="800"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      {l3Count.toLocaleString('vi-VN')}
                    </text>
                    <text
                      x="220"
                      y="278"
                      fill="#e0f2fe"
                      fontSize="11.5"
                      fontWeight="400"
                      textAnchor="middle"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                    >
                      Lọc Sai lệch dữ liệu
                    </text>
                  </g>

                  {/* ---------------------------------------------------------
                       LAYER 4: SPLIT INTO 2 GROUPS (4a: Hoàn thành vs 4b: Chưa hoàn thành)
                       Top: rx=70, ry=9, cx=220, cy=305. Left=150, Right=290
                       Bottom: rx=42, ry=6, cy=385. Left=178, Right=262
                       --------------------------------------------------------- */}
                  <g>
                    {/* 4a: EPIC HOÀN THÀNH (BÊN TRÁI) */}
                    <g
                      className={`cursor-pointer transition-all duration-200 ${
                        activeRightPanel === 'COMPLETED' ? 'brightness-110 drop-shadow-md' : 'opacity-90 hover:opacity-100'
                      }`}
                      onClick={() => setActiveRightPanel((prev) => (prev === 'COMPLETED' ? null : 'COMPLETED'))}
                      onContextMenu={(e) => handleContextMenu(e, 'LAYER-04A')}
                    >
                      <path
                        d={`M 150 305 
                           A 70 9 0 0 0 ${l4TopSplitX} ${l4TopSplitY} 
                           L ${l4BotSplitX} ${l4BotSplitY} 
                           A 42 6 0 0 1 178 385 
                           Z`}
                        fill="#00b4d8"
                      />
                      <ellipse
                        cx="220"
                        cy="305"
                        rx="70"
                        ry="9"
                        fill="#00838f"
                        clipPath="url(#p1-l4-left-lid-clip)"
                      />

                      <text
                        x={l4aMidX}
                        y="348"
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="800"
                        textAnchor="middle"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                      >
                        {l4aCount.toLocaleString('vi-VN')}
                      </text>
                      <text
                        x={l4aMidX}
                        y="365"
                        fill="#e0f7fa"
                        fontSize="9.5"
                        fontWeight="500"
                        textAnchor="middle"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                      >
                        Hoàn thành
                      </text>
                    </g>

                    {/* 4b: EPIC CHƯA HOÀN THÀNH (BÊN PHẢI) */}
                    <g
                      className={`cursor-pointer transition-all duration-200 ${
                        activeRightPanel === 'IN_PROGRESS' ? 'brightness-110 drop-shadow-md' : 'opacity-90 hover:opacity-100'
                      }`}
                      onClick={() => setActiveRightPanel((prev) => (prev === 'IN_PROGRESS' ? null : 'IN_PROGRESS'))}
                      onContextMenu={(e) => handleContextMenu(e, 'LAYER-04B')}
                    >
                      <path
                        d={`M ${l4TopSplitX} ${l4TopSplitY} 
                           A 70 9 0 0 0 290 305 
                           L 262 385 
                           A 42 6 0 0 1 ${l4BotSplitX} ${l4BotSplitY} 
                           Z`}
                        fill="#f59e0b"
                      />
                      <ellipse
                        cx="220"
                        cy="305"
                        rx="70"
                        ry="9"
                        fill="#b45309"
                        clipPath="url(#p1-l4-right-lid-clip)"
                      />

                      <text
                        x={l4bMidX}
                        y="348"
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="800"
                        textAnchor="middle"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                      >
                        {l4bCount.toLocaleString('vi-VN')}
                      </text>
                      <text
                        x={l4bMidX}
                        y="365"
                        fill="#fef3c7"
                        fontSize="9.5"
                        fontWeight="500"
                        textAnchor="middle"
                        fontFamily="'Plus Jakarta Sans', sans-serif"
                      >
                        Chưa xong
                      </text>
                    </g>

                    {/* Phân cách giữa 2 nửa */}
                    <line
                      x1={l4TopSplitX}
                      y1={l4TopSplitY}
                      x2={l4BotSplitX}
                      y2={l4BotSplitY}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                    />
                  </g>
                </svg>
              );
            })()}
          </div>

          {/* Footer Summary Strip */}
          <div className="mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500"></span>
              <span>
                Tập dữ liệu chuẩn Layer 3:{' '}
                <strong className="text-slate-900 font-bold font-mono">
                  {l3Count.toLocaleString('vi-VN')} Epic ({l1Count > 0 ? ((l3Count / l1Count) * 100).toFixed(1) : 0}%)
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              {activeRightPanel ? (
                <>
                  <span>Đang mở phễu chi tiết:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    activeRightPanel === 'COMPLETED' ? 'bg-cyan-100 text-cyan-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {activeRightPanel === 'COMPLETED' ? 'Epic Hoàn Thành (Panel 2)' : 'Epic Chưa Hoàn Thành (Panel 3)'}
                  </span>
                </>
              ) : (
                <span className="text-sky-700 italic">
                  💡 Bấm vào nửa Hoàn thành / Chưa xong ở Layer 4 để mở rộng phễu chi tiết bên phải
                </span>
              )}
            </div>
          </div>

        </div>

        {/* ============================================================= */}
        {/* PANEL PHẢI: HIỂN THỊ KHI ĐƯỢC KÍCH HOẠT TỪ LAYER 4            */}
        {/* ============================================================= */}
        {activeRightPanel && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between relative min-h-[480px]">
            
            {/* Header with Switcher Tabs & Close Button */}
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-2 gap-2">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${activeRightPanel === 'COMPLETED' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-wide text-slate-900">
                  {activeRightPanel === 'COMPLETED'
                    ? 'Panel 2: Phễu Epic Hoàn Thành (Đã có R4G Date)'
                    : 'Panel 3: Phễu Epic Chưa Hoàn Thành (Chưa có R4G Date)'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Quick Switcher Pills */}
                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveRightPanel('COMPLETED')}
                    className={`px-3 py-1 rounded-md transition-all ${
                      activeRightPanel === 'COMPLETED'
                        ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Hoàn thành ({l4aCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRightPanel('IN_PROGRESS')}
                    className={`px-3 py-1 rounded-md transition-all ${
                      activeRightPanel === 'IN_PROGRESS'
                        ? 'bg-white text-amber-700 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Chưa xong ({l4bCount})
                  </button>
                </div>

                {/* Close Button to return to Full Width */}
                <button
                  type="button"
                  onClick={() => setActiveRightPanel(null)}
                  className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Đóng phễu chi tiết (Thu gọn về toàn màn hình)"
                >
                  <X className="size-4" weight="bold" />
                </button>
              </div>
            </div>

            {/* ========================================================= */}
            {/* PHỄU PANEL 2: EPIC HOÀN THÀNH                             */}
            {/* ========================================================= */}
            {activeRightPanel === 'COMPLETED' && (
              <>
                <div className="w-full flex justify-center items-center py-2">
                  {(() => {
                    // Proportional ratio calculation clamped between 20% and 80%
                    const total5a = g5aaCount + g5abCount || 1;
                    const rawRatio5a = g5aaCount / total5a;
                    const ratio5a = Math.min(Math.max(rawRatio5a, 0.2), 0.8);

                    // Layer 4A: cx=175, cy=35, rx=140, ry=20. Left=35, Right=315
                    // Layer 5A: Top cx=175, cy=135, rx=100, ry=14. Left=75, Right=275
                    // Layer 5A: Bottom cx=175, cy=225, rx=60, ry=9. Left=115, Right=235
                    const l5aTopSplitX = 75 + 200 * ratio5a;
                    const uTop = (l5aTopSplitX - 175) / 100;
                    const l5aTopSplitY = 135 + 14 * Math.sqrt(Math.max(0, 1 - uTop * uTop));

                    const l5aBotSplitX = 115 + 120 * ratio5a;
                    const uBot = (l5aBotSplitX - 175) / 60;
                    const l5aBotSplitY = 225 + 9 * Math.sqrt(Math.max(0, 1 - uBot * uBot));

                    const g5aaMidX = (75 + l5aTopSplitX) / 2;

                    return (
                      <svg
                        className="w-full max-w-[460px] drop-shadow-md select-none"
                        viewBox="0 0 460 260"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <defs>
                          <clipPath id="p2-l5a-left-lid-clip">
                            <rect x="0" y="0" width={l5aTopSplitX} height="500" />
                          </clipPath>
                          <clipPath id="p2-l5a-right-lid-clip">
                            <rect x={l5aTopSplitX} y="0" width="500" height="500" />
                          </clipPath>
                        </defs>

                        {/* LAYER 4A: Top Single Layer */}
                        <g
                          className="cursor-context-menu transition-all duration-200 hover:brightness-105"
                          onContextMenu={(e) => handleContextMenu(e, 'LAYER-04A')}
                        >
                          <path
                            d="M 35 35 
                               A 140 20 0 0 0 315 35 
                               L 275 115 
                               A 100 14 0 0 1 75 115 
                               Z"
                            fill="#00b4d8"
                          />
                          <ellipse cx="175" cy="35" rx="140" ry="20" fill="#00838f" />
                          
                          <text
                            x="175"
                            y="77"
                            fill="#ffffff"
                            fontSize="21"
                            fontWeight="800"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            {l4aCount.toLocaleString('vi-VN')}
                          </text>
                          <text
                            x="175"
                            y="98"
                            fill="#e0f7fa"
                            fontSize="12"
                            fontWeight="400"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            Epic hoàn thành
                          </text>
                        </g>

                        {/* LAYER 5A: SPLIT INTO 2 GROUPS (5aa: Đạt TTM vs 5ab: Fail TTM) */}
                        <g className="cursor-context-menu">
                          {/* 5aa: Pass TTM (Emerald / Green) - Left (Large group with internal text) */}
                          <g onContextMenu={(e) => handleContextMenu(e, 'GROUP-05AA')} className="hover:brightness-105">
                            <path
                              d={`M 75 135 
                                 A 100 14 0 0 0 ${l5aTopSplitX} ${l5aTopSplitY} 
                                 L ${l5aBotSplitX} ${l5aBotSplitY} 
                                 A 60 9 0 0 1 115 225 
                                 Z`}
                              fill="#10b981"
                            />
                            <ellipse
                              cx="175"
                              cy="135"
                              rx="100"
                              ry="14"
                              fill="#047857"
                              clipPath="url(#p2-l5a-left-lid-clip)"
                            />

                            <text
                              x={g5aaMidX}
                              y="180"
                              fill="#ffffff"
                              fontSize="14"
                              fontWeight="800"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Đạt {g5aaCount.toLocaleString('vi-VN')}
                            </text>
                            <text
                              x={g5aaMidX}
                              y="200"
                              fill="#d1fae5"
                              fontSize="10.5"
                              fontWeight="500"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              TTM-CNTT
                            </text>
                          </g>

                          {/* 5ab: Fail TTM (Rose / Red) - Right (Small group with NO internal text) */}
                          <g onContextMenu={(e) => handleContextMenu(e, 'GROUP-05AB')} className="hover:brightness-105">
                            <path
                              d={`M ${l5aTopSplitX} ${l5aTopSplitY} 
                                 A 100 14 0 0 0 275 135 
                                 L 235 225 
                                 A 60 9 0 0 1 ${l5aBotSplitX} ${l5aBotSplitY} 
                                 Z`}
                              fill="#ef4444"
                            />
                            <ellipse
                              cx="175"
                              cy="135"
                              rx="100"
                              ry="14"
                              fill="#b91c1c"
                              clipPath="url(#p2-l5a-right-lid-clip)"
                            />
                          </g>

                          {/* Callout Line & Label for Trễ hạn (5ab) — All text & numbers placed outside */}
                          <g
                            className="cursor-context-menu"
                            onContextMenu={(e) => handleContextMenu(e, 'GROUP-05AB')}
                          >
                            <path
                              d="M 255 180 L 330 165 L 365 165"
                              stroke="#ef4444"
                              strokeWidth="1.8"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <text
                              x="372"
                              y="161"
                              fill="#dc2626"
                              fontSize="13"
                              fontWeight="800"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Fail {g5abCount.toLocaleString('vi-VN')}
                            </text>
                            <text
                              x="372"
                              y="177"
                              fill="#64748b"
                              fontSize="11"
                              fontWeight="600"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Trễ hạn
                            </text>
                          </g>

                          {/* Seam divider */}
                          <line
                            x1={l5aTopSplitX}
                            y1={l5aTopSplitY}
                            x2={l5aBotSplitX}
                            y2={l5aBotSplitY}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />
                        </g>
                      </svg>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Tỷ lệ Đạt TTM-CNTT (Hoàn thành):</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {l4aCount > 0 ? ((g5aaCount / l4aCount) * 100).toFixed(1) : 0}% ({g5aaCount}/{l4aCount})
                  </span>
                </div>
              </>
            )}

            {/* ========================================================= */}
            {/* PHỄU PANEL 3: EPIC CHƯA HOÀN THÀNH                        */}
            {/* ========================================================= */}
            {activeRightPanel === 'IN_PROGRESS' && (
              <>
                <div className="w-full flex justify-center items-center py-2">
                  {(() => {
                    // Proportional ratio calculation clamped between 20% and 80%
                    const total5b = g5baCount + g5bbCount || 1;
                    // Put g5bb (Còn lại trong hạn) on the left and g5ba (Quá target) on the right with callout line
                    const rawRatio5b = g5bbCount / total5b;
                    const ratio5b = Math.min(Math.max(rawRatio5b, 0.2), 0.8);

                    // Layer 4B: cx=175, cy=35, rx=140, ry=20. Left=35, Right=315
                    // Layer 5B: Top cx=175, cy=135, rx=100, ry=14. Left=75, Right=275
                    // Layer 5B: Bottom cx=175, cy=225, rx=60, ry=9. Left=115, Right=235
                    const l5bTopSplitX = 75 + 200 * ratio5b;
                    const uTop = (l5bTopSplitX - 175) / 100;
                    const l5bTopSplitY = 135 + 14 * Math.sqrt(Math.max(0, 1 - uTop * uTop));

                    const l5bBotSplitX = 115 + 120 * ratio5b;
                    const uBot = (l5bBotSplitX - 175) / 60;
                    const l5bBotSplitY = 225 + 9 * Math.sqrt(Math.max(0, 1 - uBot * uBot));

                    const g5bbMidX = (75 + l5bTopSplitX) / 2;

                    return (
                      <svg
                        className="w-full max-w-[460px] drop-shadow-md select-none"
                        viewBox="0 0 460 260"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <defs>
                          <clipPath id="p3-l5b-left-lid-clip">
                            <rect x="0" y="0" width={l5bTopSplitX} height="500" />
                          </clipPath>
                          <clipPath id="p3-l5b-right-lid-clip">
                            <rect x={l5bTopSplitX} y="0" width="500" height="500" />
                          </clipPath>
                        </defs>

                        {/* LAYER 4B: Top Single Layer */}
                        <g
                          className="cursor-context-menu transition-all duration-200 hover:brightness-105"
                          onContextMenu={(e) => handleContextMenu(e, 'LAYER-04B')}
                        >
                          <path
                            d="M 35 35 
                               A 140 20 0 0 0 315 35 
                               L 275 115 
                               A 100 14 0 0 1 75 115 
                               Z"
                            fill="#f59e0b"
                          />
                          <ellipse cx="175" cy="35" rx="140" ry="20" fill="#b45309" />
                          
                          <text
                            x="175"
                            y="77"
                            fill="#ffffff"
                            fontSize="21"
                            fontWeight="800"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            {l4bCount.toLocaleString('vi-VN')}
                          </text>
                          <text
                            x="175"
                            y="98"
                            fill="#fef3c7"
                            fontSize="12"
                            fontWeight="400"
                            textAnchor="middle"
                            fontFamily="'Plus Jakarta Sans', sans-serif"
                          >
                            Epic chưa hoàn thành
                          </text>
                        </g>

                        {/* LAYER 5B: SPLIT INTO GROUPS (5bb: Còn lại vs 5ba: Fail quá target) */}
                        <g className="cursor-context-menu">
                          {/* 5bb: Còn lại / Trong hạn (Blue / Sky) - Left (Large group with internal text) */}
                          <g onContextMenu={(e) => handleContextMenu(e, 'GROUP-05BB')} className="hover:brightness-105">
                            <path
                              d={`M 75 135 
                                 A 100 14 0 0 0 ${l5bTopSplitX} ${l5bTopSplitY} 
                                 L ${l5bBotSplitX} ${l5bBotSplitY} 
                                 A 60 9 0 0 1 115 225 
                                 Z`}
                              fill="#0284c7"
                            />
                            <ellipse
                              cx="175"
                              cy="135"
                              rx="100"
                              ry="14"
                              fill="#0369a1"
                              clipPath="url(#p3-l5b-left-lid-clip)"
                            />

                            <text
                              x={g5bbMidX}
                              y="180"
                              fill="#ffffff"
                              fontSize="14"
                              fontWeight="800"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Còn lại {g5bbCount.toLocaleString('vi-VN')}
                            </text>
                            <text
                              x={g5bbMidX}
                              y="200"
                              fill="#e0f2fe"
                              fontSize="10.5"
                              fontWeight="500"
                              textAnchor="middle"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Trong hạn
                            </text>
                          </g>

                          {/* 5ba: Fail TTM (Rose / Red) - Right (Small group with NO internal text) */}
                          <g onContextMenu={(e) => handleContextMenu(e, 'GROUP-05BA')} className="hover:brightness-105">
                            <path
                              d={`M ${l5bTopSplitX} ${l5bTopSplitY} 
                                 A 100 14 0 0 0 275 135 
                                 L 235 225 
                                 A 60 9 0 0 1 ${l5bBotSplitX} ${l5bBotSplitY} 
                                 Z`}
                              fill="#ef4444"
                            />
                            <ellipse
                              cx="175"
                              cy="135"
                              rx="100"
                              ry="14"
                              fill="#b91c1c"
                              clipPath="url(#p3-l5b-right-lid-clip)"
                            />
                          </g>

                          {/* Callout Line & Label for Quá Target (5ba) — All text & numbers placed outside */}
                          <g
                            className="cursor-context-menu"
                            onContextMenu={(e) => handleContextMenu(e, 'GROUP-05BA')}
                          >
                            <path
                              d="M 255 180 L 330 165 L 365 165"
                              stroke="#ef4444"
                              strokeWidth="1.8"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <text
                              x="372"
                              y="161"
                              fill="#dc2626"
                              fontSize="13"
                              fontWeight="800"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Fail {g5baCount.toLocaleString('vi-VN')}
                            </text>
                            <text
                              x="372"
                              y="177"
                              fill="#64748b"
                              fontSize="11"
                              fontWeight="600"
                              fontFamily="'Plus Jakarta Sans', sans-serif"
                            >
                              Quá Target
                            </text>
                          </g>

                          {/* Seam divider */}
                          <line
                            x1={l5bTopSplitX}
                            y1={l5bTopSplitY}
                            x2={l5bBotSplitX}
                            y2={l5bBotSplitY}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />
                        </g>
                      </svg>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Tiến độ Epic chưa hoàn thành:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {g5bbCount} Còn trong hạn · <span className="text-rose-600 font-extrabold">{g5baCount} Quá Target</span>
                  </span>
                </div>
              </>
            )}

          </div>
        )}

      </div>

      {/* ============================================================= */}
      {/* POPUP MODAL MÔ TẢ CHI TIẾT LAYER / GROUP (CHỈ MỞ KHI CHUỘT PHẢI) */}
      {/* ============================================================= */}
      {detailModalId !== null && (
        <Modal
          isOpen={detailModalId !== null}
          onClose={() => setDetailModalId(null)}
          title={
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-700 border border-slate-300">
                [{detailModalId}]
              </span>
              <span>
                {detailModalId === 'LAYER-01' && 'Chi Tiết Layer 1 — Phạm Vi Dữ Liệu Nguồn'}
                {detailModalId === 'LAYER-02' && 'Chi Tiết Layer 2 — Quy Tắc Lọc Cancelled'}
                {detailModalId === 'LAYER-03' && 'Chi Tiết Layer 3 — Quy Tắc Lọc Sai Lệch Dữ Liệu'}
                {detailModalId === 'LAYER-04A' && 'Chi Tiết Layer 4A — Epic Hoàn Thành (Có R4G Date)'}
                {detailModalId === 'GROUP-05AA' && 'Chi Tiết Nhóm 5AA — Đạt TTM-CNTT (Đúng Hạn)'}
                {detailModalId === 'GROUP-05AB' && 'Chi Tiết Nhóm 5AB — Fail TTM-CNTT (Trễ Hạn)'}
                {detailModalId === 'LAYER-04B' && 'Chi Tiết Layer 4B — Epic Chưa Hoàn Thành'}
                {detailModalId === 'GROUP-05BA' && 'Chi Tiết Nhóm 5BA — Fail TTM-CNTT (Quá Target)'}
                {detailModalId === 'GROUP-05BB' && 'Chi Tiết Nhóm 5BB — Còn Lại (Đang Trong Hạn)'}
              </span>
            </div>
          }
        >
          <div className="p-5 space-y-4 text-xs">
            
            {/* [LAYER-01] */}
            {detailModalId === 'LAYER-01' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl space-y-1">
                  <div className="font-bold text-sky-950 flex items-center justify-between text-sm">
                    <span>Tổng số Epic từ nguồn:</span>
                    <span className="font-mono font-extrabold text-base text-[#00b4d8]">{l1Count.toLocaleString('vi-VN')}</span>
                  </div>
                  <p className="text-[11px] text-sky-800 leading-relaxed">
                    Phạm vi dữ liệu ghi nhận từ hệ thống Jira theo phân quyền của tài khoản hiện tại và các bộ lọc đang chọn.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-slate-800 text-xs">Phạm vi dữ liệu chi tiết của Layer 1:</span>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-500 text-[11px]">Số lượng Domain:</span>
                      <div className="font-bold text-slate-900 font-mono mt-0.5 text-sm">{layer1ScopeStats.domains} Domain</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-500 text-[11px]">Số lượng Dự án:</span>
                      <div className="font-bold text-slate-900 font-mono mt-0.5 text-sm">{layer1ScopeStats.projects} Dự án</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-500 text-[11px]">Số lượng PM/SM:</span>
                      <div className="font-bold text-slate-900 font-mono mt-0.5 text-sm">{layer1ScopeStats.pms} Người</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-500 text-[11px]">Đơn vị yêu cầu:</span>
                      <div className="font-bold text-slate-900 font-mono mt-0.5 text-sm">{layer1ScopeStats.requestingUnits} Đơn vị</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({})}
                    className="w-full py-2.5 bg-[#1463f7] hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem danh sách {l1Count} Epic trên Quản trị Epic</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [LAYER-02] */}
            {detailModalId === 'LAYER-02' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="font-bold text-rose-950 flex items-center justify-between text-sm">
                    <span>Số lượng sau khi lọc Cancelled:</span>
                    <span className="font-mono font-extrabold text-base text-[#ff4d4f]">{l2Count.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-rose-800 font-mono pt-0.5">
                    <span>Đã loại trừ: <b>{cancelledCount.toLocaleString('vi-VN')} Epic</b></span>
                    <span>Tỷ lệ giữ lại: <b>{l1Count > 0 ? ((l2Count / l1Count) * 100).toFixed(1) : 0}%</b></span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Layer 2 = Layer 1 ({l1Count.toLocaleString('vi-VN')}) - Cancelled ({cancelledCount.toLocaleString('vi-VN')})<br />
                    = <b>{l2Count.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc lọc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Khấu trừ toàn bộ các Epic có trạng thái Đã hủy / Dừng triển khai (Status: <code>Cancelled</code>, <code>Closed (Cancelled)</code>, <code>Rejected</code>, <code>Deferred</code>).
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({ status: ['Cancelled', 'Closed', 'Rejected'] })}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem {cancelledCount} Epic Cancelled bị loại</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [LAYER-03] */}
            {detailModalId === 'LAYER-03' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
                  <div className="font-bold text-indigo-950 flex items-center justify-between text-sm">
                    <span>Số lượng sau khi lọc Sai lệch dữ liệu:</span>
                    <span className="font-mono font-extrabold text-base text-[#0284c7]">{l3Count.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-indigo-800 font-mono pt-0.5">
                    <span>Sai lệch dữ liệu: <b>{anomalyCount.toLocaleString('vi-VN')} Epic</b></span>
                    <span>Tỷ lệ đạt chuẩn: <b>{l2Count > 0 ? ((l3Count / l2Count) * 100).toFixed(1) : 0}%</b></span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Layer 3 = Layer 2 ({l2Count.toLocaleString('vi-VN')}) - Sai lệch dữ liệu ({anomalyCount.toLocaleString('vi-VN')})<br />
                    = <b>{l3Count.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc lọc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Khấu trừ các Epic vi phạm quy tắc toàn vẹn dữ liệu (Data Anomaly: thiếu mốc R4G, ngày kết thúc &lt; ngày bắt đầu, sai lệch mốc Golive so với release status...).
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({ dataIssue: true })}
                    className="w-full py-2.5 bg-[#0284c7] hover:bg-sky-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem {anomalyCount} Epic Sai lệch dữ liệu</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [LAYER-04A] */}
            {detailModalId === 'LAYER-04A' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl space-y-1">
                  <div className="font-bold text-teal-950 flex items-center justify-between text-sm">
                    <span>Số lượng Epic hoàn thành (Có R4G Date):</span>
                    <span className="font-mono font-extrabold text-base text-teal-700">{l4aCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-teal-800 font-mono">
                    Tỷ lệ trong Layer 3: <b>{l3Count > 0 ? ((l4aCount / l3Count) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Layer 4A = (Số Epic có mốc R4G Date trong Layer 3)<br />
                    = <b>{l4aCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc lọc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Lọc tất cả các Epic thuộc Layer 3 đã ghi nhận mốc ngày hoàn thành kỹ thuật <code>R4G Date</code> thực tế.
                  </p>
                </div>
              </div>
            )}

            {/* [GROUP-05AA] */}
            {detailModalId === 'GROUP-05AA' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center justify-between text-sm">
                    <span>Số lượng Đạt TTM-CNTT (Đúng hạn):</span>
                    <span className="font-mono font-extrabold text-base text-emerald-600">{g5aaCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-mono">
                    Tỷ lệ Đạt trong Epic hoàn thành: <b>{l4aCount > 0 ? ((g5aaCount / l4aCount) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Nhóm 5AA = (Số Epic Đạt TTM-CNTT trong Layer 4A)<br />
                    = <b>{g5aaCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc tính Đạt TTM-CNTT:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Epic nằm trong phạm vi tính TTM-CNTT (<code>ttmCnttInScope</code>), có mốc <code>R4G Date</code> đúng hạn (không quá ngày Target R4G), không bị Data Anomaly và alertLevel là NONE.
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({ alert: 'ACHIEVED_CNTT' })}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem {g5aaCount} Epic Đạt TTM-CNTT</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [GROUP-05AB] */}
            {detailModalId === 'GROUP-05AB' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="font-bold text-rose-950 flex items-center justify-between text-sm">
                    <span>Số lượng Fail TTM-CNTT (Trễ hạn hoàn thành):</span>
                    <span className="font-mono font-extrabold text-base text-rose-600">{g5abCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-rose-800 font-mono">
                    Tỷ lệ Trễ hạn: <b>{l4aCount > 0 ? ((g5abCount / l4aCount) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Nhóm 5AB = Layer 4A ({l4aCount.toLocaleString('vi-VN')}) - Nhóm 5AA ({g5aaCount.toLocaleString('vi-VN')})<br />
                    = <b>{g5abCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc Fail TTM-CNTT:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Epic đã hoàn thành mốc R4G nhưng ngày <code>R4G Date</code> thực tế bị trễ so với ngày <code>Target R4G Date</code> dự kiến.
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({ alert: 'FAIL_LATE_R4G' })}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem {g5abCount} Epic Trễ hạn R4G</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [LAYER-04B] */}
            {detailModalId === 'LAYER-04B' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <div className="font-bold text-amber-950 flex items-center justify-between text-sm">
                    <span>Số lượng Epic chưa hoàn thành (Chưa có R4G Date):</span>
                    <span className="font-mono font-extrabold text-base text-amber-600">{l4bCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-amber-800 font-mono">
                    Tỷ lệ trong Layer 3: <b>{l3Count > 0 ? ((l4bCount / l3Count) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Layer 4B = Layer 3 ({l3Count.toLocaleString('vi-VN')}) - Layer 4A ({l4aCount.toLocaleString('vi-VN')})<br />
                    = <b>{l4bCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc lọc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Các Epic đang triển khai (Design, In Progress, Ready for Golive...) chưa ghi nhận mốc ngày hoàn thành kỹ thuật <code>R4G Date</code>.
                  </p>
                </div>
              </div>
            )}

            {/* [GROUP-05BA] */}
            {detailModalId === 'GROUP-05BA' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <div className="font-bold text-rose-950 flex items-center justify-between text-sm">
                    <span>Số lượng Fail TTM-CNTT (Đã quá hạn Target):</span>
                    <span className="font-mono font-extrabold text-base text-rose-600">{g5baCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-rose-800 font-mono">
                    Tỷ lệ Quá Target: <b>{l4bCount > 0 ? ((g5baCount / l4bCount) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Nhóm 5BA = (Số Epic chưa R4G nhưng đã quá ngày Target R4G)<br />
                    = <b>{g5baCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc tính Fail quá Target:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Epic chưa hoàn thành nhưng số ngày làm việc thực tế đã vượt quá ngân sách ngày <code>Target R4G Date</code> (đã chắc chắn Fail TTM-CNTT).
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href={getEpicAlertsLink({ alert: 'FAIL_MISSING_R4G' })}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="size-4" />
                    <span>Xem {g5baCount} Epic Chưa R4G Quá Target</span>
                  </Link>
                </div>
              </div>
            )}

            {/* [GROUP-05BB] */}
            {detailModalId === 'GROUP-05BB' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl space-y-1">
                  <div className="font-bold text-sky-950 flex items-center justify-between text-sm">
                    <span>Số lượng Epic còn lại (Đang trong hạn):</span>
                    <span className="font-mono font-extrabold text-base text-[#0284c7]">{g5bbCount.toLocaleString('vi-VN')} Epic</span>
                  </div>
                  <div className="text-[11px] text-sky-800 font-mono">
                    Tỷ lệ trong hạn: <b>{l4bCount > 0 ? ((g5bbCount / l4bCount) * 100).toFixed(1) : 0}%</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Công thức tính toán:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 leading-relaxed">
                    Nhóm 5BB = Layer 4B ({l4bCount.toLocaleString('vi-VN')}) - Nhóm 5BA ({g5baCount.toLocaleString('vi-VN')})<br />
                    = <b>{g5bbCount.toLocaleString('vi-VN')} Epic</b>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-800 text-xs">Quy tắc lọc áp dụng:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Các Epic đang triển khai đúng hạn, số ngày làm việc chưa vượt mốc <code>Target R4G Date</code> (vẫn còn cơ hội Đạt TTM-CNTT).
                  </p>
                </div>
              </div>
            )}

          </div>
        </Modal>
      )}

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
                <div
                  key={u.id}
                  onClick={() => {
                    setPreviewUserId(u.id);
                    setShowUserModal(false);
                  }}
                  className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="font-bold text-slate-900">{u.fullName}</div>
                    <div className="text-[11px] text-slate-500">{u.email}</div>
                  </div>
                  <Badge variant="neutral" className="text-[10px] font-mono">
                    {u.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
