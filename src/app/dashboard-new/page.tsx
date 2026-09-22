'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowBendUpRight,
  ArrowRight,
  Bandaids,
  BriefcaseMetal,
  CaretDown,
  CaretLineRight,
  CaretRight,
  ChartBar,
  ChartPie,
  CheckCircle,
  Checks,
  Clock,
  Eye,
  Funnel,
  Gauge,
  Info,
  List,
  MagnifyingGlass,
  SlidersHorizontal,
  User,
  UserSwitch,
  Warning,
  WarningCircle,
  X,
} from '@phosphor-icons/react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import type { AlertLevel } from '@/lib/ttm-rules';

interface ManagedUserItem {
  domainIds: number[];
  email: string;
  fullName: string;
  id: number;
  isActive: boolean;
  projectIds: number[];
  role: string;
}

interface DashboardNewPayload {
  actor: { email: string; fullName: string; id: number; role: string };
  isUserPreview: boolean;
  lastAggregatedAt: string | null;
  managedUsers: ManagedUserItem[];
  rows: EpicAlertRowPhased[];
  viewAsUser: { email: string; fullName: string; id: number; role: string } | null;
}

type DimensionKey = 'domain' | 'epicType' | 'pmsm' | 'project';
type OperationalTab = 'ANOMALY' | 'PENDING' | 'PROGRESS';

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  domain: 'Theo Domain',
  epicType: 'Theo Phân loại Epic',
  pmsm: 'Theo PM/SM',
  project: 'Theo Dự án',
};

const ALERT_BADGE_VARIANT: Record<AlertLevel, 'danger' | 'info' | 'neutral' | 'warning'> = {
  EARLY: 'info',
  FAIL: 'danger',
  LATE: 'warning',
  NONE: 'neutral',
};

const ALERT_BADGE_LABEL: Record<AlertLevel, string> = {
  EARLY: 'Cảnh báo sớm',
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
  NONE: 'Đạt / Không cảnh báo',
};

export default function DashboardNewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardNewPayload | null>(null);

  // User Preview State for Superadmin/Admin/Supervisor
  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');

  // Mode: EXECUTIVE or OPERATIONAL
  const [viewMode, setViewMode] = useState<'EXECUTIVE' | 'OPERATIONAL'>('EXECUTIVE');

  // Controls
  const [dimensionKey, setDimensionKey] = useState<DimensionKey>('domain');
  const [operationalTab, setOperationalTab] = useState<OperationalTab>('PROGRESS');
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async (userId: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = userId ? `/api/dashboard-new?viewAsUserId=${userId}` : '/api/dashboard-new';
      const res = await fetch(url, { cache: 'no-store' });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : 'Không thể tải dữ liệu.');
      }
      const payload = json as DashboardNewPayload;
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
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(previewUserId);
  }, [previewUserId]);

  const isAdminOrSupervisor = useMemo(() => {
    return data ? ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(data.actor.role) : false;
  }, [data]);

  // Filtered Epic Rows
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((row) => {
      if (filterProject && row.projectKey !== filterProject) return false;
      if (filterDomain && row.domainName !== filterDomain) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchKey = row.epicKey.toLowerCase().includes(q);
        const matchName = row.epicName.toLowerCase().includes(q);
        const matchPm = (row.ownerName || '').toLowerCase().includes(q);
        if (!matchKey && !matchName && !matchPm) return false;
      }
      return true;
    });
  }, [data, filterProject, filterDomain, searchQuery]);

  // Executive Metrics
  const executiveMetrics = useMemo(() => {
    const total = filteredRows.length;
    let failCntt = 0;
    let failE2e = 0;
    let lateWarning = 0;
    let earlyWarning = 0;
    let anomalyCount = 0;
    let eligibleTtm = 0;
    let passTtm = 0;

    for (const row of filteredRows) {
      if (row.alertLevel === 'FAIL') failCntt += 1;
      else if (row.alertLevel === 'LATE') lateWarning += 1;
      else if (row.alertLevel === 'EARLY') earlyWarning += 1;

      if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
      if (row.hasDataAnomaly) anomalyCount += 1;

      if (row.r4gDate && !row.hasDataAnomaly) {
        eligibleTtm += 1;
        if (row.alertLevel === 'NONE') passTtm += 1;
      }
    }

    const ttmHealthPct = eligibleTtm > 0 ? Math.round((passTtm / eligibleTtm) * 100) : total > 0 ? Math.round(((total - failCntt) / total) * 100) : 100;

    return {
      anomalyCount,
      earlyWarning,
      eligibleTtm,
      failCntt,
      failE2e,
      lateWarning,
      passTtm,
      total,
      ttmHealthPct,
    };
  }, [filteredRows]);

  // Breakdown Matrix Table Data
  const dimensionMatrix = useMemo(() => {
    const map = new Map<string, { fail: number; late: number; ok: number; pass: number; total: number }>();

    for (const row of filteredRows) {
      let keyVal = 'Khác';
      if (dimensionKey === 'domain') keyVal = row.domainName || 'Chưa gán Domain';
      else if (dimensionKey === 'pmsm') keyVal = row.ownerName || 'Chưa gán PM/SM';
      else if (dimensionKey === 'project') keyVal = row.projectName || row.projectKey || 'Chưa gán';
      else if (dimensionKey === 'epicType') keyVal = row.epicType || 'CT-Lv12';

      const curr = map.get(keyVal) ?? { fail: 0, late: 0, ok: 0, pass: 0, total: 0 };
      curr.total += 1;

      const isReleased = Boolean(row.stages.release.isDone || row.dueDate);
      if (isReleased) {
        if (row.alertLevel === 'FAIL' || row.ttmE2eAlertLevel === 'FAIL') curr.fail += 1;
        else curr.pass += 1;
      } else {
        if (row.alertLevel === 'FAIL' || row.alertLevel === 'LATE') curr.late += 1;
        else curr.ok += 1;
      }
      map.set(keyVal, curr);
    }

    return [...map.entries()].map(([name, stat]) => {
      const passPct = stat.total > 0 ? Math.round(((stat.pass + stat.ok) / stat.total) * 100) : 0;
      return { name, passPct, ...stat };
    }).sort((a, b) => b.total - a.total);
  }, [filteredRows, dimensionKey]);

  // Top Risk Projects
  const topRiskProjects = useMemo(() => {
    const map = new Map<string, { fail: number; name: string; total: number }>();
    for (const row of filteredRows) {
      const pKey = row.projectKey || 'Chưa gán';
      const pName = row.projectName || pKey;
      const curr = map.get(pKey) ?? { fail: 0, name: pName, total: 0 };
      curr.total += 1;
      if (row.alertLevel === 'FAIL' || row.ttmE2eAlertLevel === 'FAIL') curr.fail += 1;
      map.set(pKey, curr);
    }
    return [...map.values()].sort((a, b) => b.fail - a.fail).slice(0, 5);
  }, [filteredRows]);

  // Phase Pipeline (Kanban Phases for Version 2)
  const pipelinePhases = useMemo(() => {
    const phases = [
      { key: 'To Do', label: '1. To Do', rows: [] as EpicAlertRowPhased[] },
      { key: 'Design', label: '2. Design', rows: [] as EpicAlertRowPhased[] },
      { key: 'In Progress', label: '3. In Progress', rows: [] as EpicAlertRowPhased[] },
      { key: 'Ready for Golive', label: '4. Ready for Golive', rows: [] as EpicAlertRowPhased[] },
      { key: 'Released', label: '5. Released', rows: [] as EpicAlertRowPhased[] },
    ];

    for (const row of filteredRows) {
      const statusLower = (row.currentStatus || '').toLowerCase();
      if (statusLower.includes('to do') || statusLower.includes('backlog') || statusLower.includes('po')) {
        phases[0].rows.push(row);
      } else if (statusLower.includes('design')) {
        phases[1].rows.push(row);
      } else if (statusLower.includes('ready for golive') || statusLower.includes('r4g')) {
        phases[3].rows.push(row);
      } else if (statusLower.includes('release') || statusLower.includes('done')) {
        phases[4].rows.push(row);
      } else {
        phases[2].rows.push(row);
      }
    }

    return phases.map((phase) => {
      const count = phase.rows.length;
      const alertCount = phase.rows.filter((r) => r.alertLevel === 'FAIL' || r.alertLevel === 'LATE' || r.ttmE2eAlertLevel === 'FAIL').length;
      return { ...phase, alertCount, count };
    });
  }, [filteredRows]);

  // Pending Epics List
  const pendingEpics = useMemo(() => {
    return filteredRows.filter((r) => (r.currentStatus || '').toLowerCase().includes('pending'));
  }, [filteredRows]);

  // Anomaly Rules Breakdown
  const anomalyRows = useMemo(() => {
    return filteredRows.filter((r) => r.hasDataAnomaly);
  }, [filteredRows]);

  // Projects & Domains options
  const projectOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.projectKey).filter(Boolean))].sort();
  }, [data]);

  const domainOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((r) => r.domainName).filter(Boolean))].sort();
  }, [data]);

  const filteredUsersForModal = useMemo(() => {
    if (!data) return [];
    if (!userSearchText.trim()) return data.managedUsers;
    const q = userSearchText.toLowerCase();
    return data.managedUsers.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  }, [data, userSearchText]);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 text-app bg-fb-bg min-h-screen">
      {/* Header Banner & Switcher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-fb-border bg-fb-surface p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ChartPie className="size-6 text-fb-blue" weight="bold" aria-hidden="true" />
            <h1 className="text-lg font-bold text-fb-text-primary">
              {viewMode === 'EXECUTIVE' ? 'Dashboard Lead Command Center' : 'Dashboard PM/SM Workbench & Analytics'}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-fb-text-secondary">
            {viewMode === 'EXECUTIVE'
              ? 'Trung tâm điều hành & phân tích TTM Epic đa chiều (Dành cho Lead & CBQL)'
              : 'Góc nhìn Vận hành & Phễu tiến độ công việc (Dành cho PM/SM & Project Lead)'}
          </p>
        </div>

        {/* Control Buttons & User Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {data?.isUserPreview && (
            <div className="flex h-9 items-center gap-2 rounded-lg bg-amber-50 px-3 border border-amber-300 text-amber-900 text-xs shrink-0">
              <Eye className="size-4 shrink-0 text-amber-600" weight="bold" />
              <span className="truncate">
                Đang xem góc nhìn của User: <strong>{data.viewAsUser?.fullName}</strong> ({data.viewAsUser?.email})
              </span>
              <button
                type="button"
                onClick={() => setPreviewUserId(null)}
                className="h-7 shrink-0 rounded-md bg-white border border-amber-300 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-xs"
              >
                Trở về Lead View
              </button>
            </div>
          )}

          {isAdminOrSupervisor && !data?.isUserPreview && (
            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-fb-border bg-fb-surface px-3 text-xs font-semibold text-fb-text-primary hover:bg-fb-surface-muted transition-colors shrink-0 shadow-xs"
            >
              <UserSwitch className="size-4 text-fb-blue" weight="bold" />
              Xem dưới dạng User
            </button>
          )}

          {isAdminOrSupervisor && (
            <div className="flex h-9 items-center rounded-lg border border-fb-border bg-fb-surface-muted p-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('EXECUTIVE')}
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
                onClick={() => setViewMode('OPERATIONAL')}
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

      {/* Common Filter Bar */}
      <Card>
        <CardBody className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fb-text-secondary uppercase tracking-wider">
                <Funnel className="size-4" weight="bold" /> Bộ lọc:
              </div>

              <div className="relative inline-flex items-center min-w-[170px]">
                <select
                  aria-label="Chọn Dự án"
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-fb-border bg-fb-surface pl-3 pr-8 h-8 text-xs font-semibold text-fb-text-primary outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue cursor-pointer"
                >
                  <option value="">Tất cả Dự án ({projectOptions.length})</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-fb-text-secondary" weight="bold" />
              </div>

              <div className="relative inline-flex items-center min-w-[170px]">
                <select
                  aria-label="Chọn Domain"
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-fb-border bg-fb-surface pl-3 pr-8 h-8 text-xs font-semibold text-fb-text-primary outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue cursor-pointer"
                >
                  <option value="">Tất cả Domain ({domainOptions.length})</option>
                  {domainOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-fb-text-secondary" weight="bold" />
              </div>
            </div>

            <div className="relative w-64">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-fb-text-secondary" />
              <input
                type="text"
                placeholder="Tìm Epic Key, tên, PM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-fb-border bg-fb-surface pl-8 pr-3 h-8 text-xs text-fb-text-primary outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {error && <Alert variant="error" title="Lỗi">{error}</Alert>}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* VERSION 1: EXECUTIVE COMMAND CENTER VIEW                                  */}
          {/* ========================================================================= */}
          {viewMode === 'EXECUTIVE' && (
            <div className="flex flex-col gap-5">
              {/* Top KPI Metrics Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {/* Health Index Ring */}
                <div className="col-span-2 sm:col-span-1 rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs flex items-center justify-start gap-3">
                  <div
                    className="relative flex size-14 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(#0866ff 0% ${executiveMetrics.ttmHealthPct}%, #e4e6eb ${executiveMetrics.ttmHealthPct}% 100%)`,
                    }}
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-fb-surface font-extrabold text-xs text-fb-blue">
                      {executiveMetrics.ttmHealthPct}%
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fb-text-primary">TTM Health Index</p>
                    <p className="text-[10px] text-fb-text-secondary">Đạt TTM CNTT & E2E</p>
                  </div>
                </div>

                <div className="rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-fb-text-secondary">Tổng số Epic</p>
                  <p className="mt-1 text-xl font-extrabold text-fb-text-primary">{executiveMetrics.total}</p>
                  <p className="text-[10px] text-fb-text-secondary">Thuộc phạm vi lọc</p>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-status-danger">Fail TTM-CNTT</p>
                  <p className="mt-1 text-xl font-extrabold text-status-danger">{executiveMetrics.failCntt}</p>
                  <p className="text-[10px] text-red-600 font-medium">Vượt R4G Target</p>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-status-danger">Fail TTM-E2E</p>
                  <p className="mt-1 text-xl font-extrabold text-status-danger">{executiveMetrics.failE2e}</p>
                  <p className="text-[10px] text-red-600 font-medium">Vượt Due Date Target</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-status-warning">Cảnh báo (Sớm/Muộn)</p>
                  <p className="mt-1 text-xl font-extrabold text-status-warning">{executiveMetrics.lateWarning + executiveMetrics.earlyWarning}</p>
                  <p className="text-[10px] text-amber-700 font-medium">{executiveMetrics.lateWarning} muộn · {executiveMetrics.earlyWarning} sớm</p>
                </div>

                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 shadow-xs">
                  <p className="text-[10px] font-bold uppercase text-purple-700">Sai lệch Dữ liệu</p>
                  <p className="mt-1 text-xl font-extrabold text-purple-700">{executiveMetrics.anomalyCount}</p>
                  <p className="text-[10px] text-purple-600 font-medium">Vi phạm rule R1-R6</p>
                </div>
              </div>

              {/* Interactive Breakdown Matrix Table */}
              <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b border-fb-border pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="size-4 text-fb-blue" weight="bold" />
                      Ma trận Phân bổ Tiến độ Epic Đa chiều
                    </CardTitle>
                    <p className="text-xs text-fb-text-secondary mt-0.5">
                      Bảng phân tích trực quan tỷ lệ Pass/Fail & Tiến độ Epic theo từng chiều dữ liệu
                    </p>
                  </div>

                  {/* Dimension selector tabs */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-fb-border bg-fb-surface-muted p-1">
                    {(Object.keys(DIMENSION_LABELS) as DimensionKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDimensionKey(key)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                          dimensionKey === key ? 'bg-fb-blue text-white shadow-xs' : 'text-fb-text-secondary hover:text-fb-text-primary'
                        }`}
                      >
                        {DIMENSION_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardBody className="p-0">
                  <TableContainer>
                    <Table>
                      <THead>
                        <TR>
                          <TH>{DIMENSION_LABELS[dimensionKey]}</TH>
                          <TH className="text-center">Tổng số Epic</TH>
                          <TH className="w-64">Tỷ lệ Tiến độ & TTM (%)</TH>
                          <TH className="text-center">Pass TTM</TH>
                          <TH className="text-center">Fail TTM</TH>
                          <TH className="text-center">Đúng tiến độ</TH>
                          <TH className="text-center">Chậm tiến độ</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {dimensionMatrix.map((item) => (
                          <TR key={item.name}>
                            <TD className="font-bold text-fb-text-primary">{item.name}</TD>
                            <TD className="text-center font-semibold">{item.total}</TD>
                            <TD>
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 flex-1 rounded-full bg-fb-control overflow-hidden flex">
                                  <div style={{ width: `${item.passPct}%` }} className="bg-status-success h-full" title={`Pass: ${item.passPct}%`} />
                                  <div style={{ width: `${100 - item.passPct}%` }} className="bg-status-danger h-full" title={`Rủi ro: ${100 - item.passPct}%`} />
                                </div>
                                <span className="w-9 text-right text-xs font-bold text-fb-text-primary">{item.passPct}%</span>
                              </div>
                            </TD>
                            <TD className="text-center font-semibold text-status-success">{item.pass}</TD>
                            <TD className="text-center font-semibold text-status-danger">{item.fail}</TD>
                            <TD className="text-center font-semibold text-fb-text-primary">{item.ok}</TD>
                            <TD className="text-center font-semibold text-status-warning">{item.late}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableContainer>
                </CardBody>
              </Card>

              {/* Dual Analytical Charts / Summaries */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Top Risk Projects */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <WarningCircle className="size-4 text-status-danger" weight="bold" /> Top Dự án có Số Epic Fail TTM Cao nhất
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {topRiskProjects.map((p) => {
                      const failPct = p.total > 0 ? Math.round((p.fail / p.total) * 100) : 0;
                      return (
                        <div key={p.name} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-fb-text-primary">{p.name}</span>
                            <span className="text-fb-text-secondary">
                              <strong className="text-status-danger">{p.fail}</strong> / {p.total} Epics ({failPct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-fb-control overflow-hidden">
                            <div className="h-full bg-status-danger rounded-full" style={{ width: `${Math.max(5, failPct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardBody>
                </Card>

                {/* High-Risk Epics Quick Action List */}
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Warning className="size-4 text-status-warning" weight="bold" /> Epic Cần chú ý (Fail / Cảnh báo muộn)
                    </CardTitle>
                    <span className="text-xs text-fb-text-secondary">Hiển thị top rủi ro</span>
                  </CardHeader>
                  <CardBody className="gap-2">
                    {filteredRows
                      .filter((r) => r.alertLevel === 'FAIL' || r.alertLevel === 'LATE' || r.ttmE2eAlertLevel === 'FAIL')
                      .slice(0, 5)
                      .map((row) => (
                        <div
                          key={row.epicKey}
                          className="flex items-center justify-between rounded-lg border border-fb-border p-2 hover:bg-fb-surface-muted transition-all"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedEpicKey(row.epicKey)}
                                className="font-bold text-fb-blue hover:underline"
                              >
                                {row.epicKey}
                              </button>
                              <Badge variant="neutral">{row.projectKey}</Badge>
                              {row.alertLevel !== 'NONE' && (
                                <Badge variant={ALERT_BADGE_VARIANT[row.alertLevel]}>{ALERT_BADGE_LABEL[row.alertLevel]}</Badge>
                              )}
                              {row.ttmE2eAlertLevel === 'FAIL' && <Badge variant="danger">Fail TTM-E2E</Badge>}
                            </div>
                            <p className="truncate text-xs text-fb-text-secondary mt-0.5" title={row.epicName}>
                              {row.epicName}
                            </p>
                          </div>
                          <TableAction
                            icon={<Eye className="size-3.5" />}
                            variant="info"
                            onClick={() => setSelectedEpicKey(row.epicKey)}
                          >
                            Xem
                          </TableAction>
                        </div>
                      ))}
                  </CardBody>
                </Card>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VERSION 2: OPERATIONAL WORKBENCH & PIPELINE ANALYTICS VIEW                 */}
          {/* ========================================================================= */}
          {viewMode === 'OPERATIONAL' && (
            <div className="flex flex-col gap-5">
              {/* Kanban Phase Pipeline Health Bar */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ChartBar className="size-4 text-fb-blue" weight="bold" /> Phễu Tiến độ Epic theo Giai đoạn (Phase Pipeline)
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
                    {pipelinePhases.map((phase) => (
                      <div
                        key={phase.key}
                        className="flex flex-col justify-between rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-fb-border pb-2">
                          <span className="font-bold text-xs text-fb-text-primary">{phase.label}</span>
                          <span className="rounded-full bg-fb-blue-soft px-2 py-0.5 text-[10px] font-extrabold text-fb-blue">
                            {phase.count} Epic
                          </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="text-xl font-extrabold text-fb-text-primary">{phase.count}</span>
                          {phase.alertCount > 0 && (
                            <span className="text-xs font-bold text-status-danger flex items-center gap-1">
                              <WarningCircle className="size-3.5" /> {phase.alertCount} Cảnh báo
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* Multi-Tab Navigation */}
              <div className="flex border-b border-fb-border gap-2">
                <button
                  type="button"
                  onClick={() => setOperationalTab('PROGRESS')}
                  className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
                    operationalTab === 'PROGRESS'
                      ? 'border-fb-blue text-fb-blue'
                      : 'border-transparent text-fb-text-secondary hover:text-fb-text-primary'
                  }`}
                >
                  1. Tiến độ TTM & Danh sách Epic ({filteredRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOperationalTab('PENDING')}
                  className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
                    operationalTab === 'PENDING'
                      ? 'border-fb-blue text-fb-blue'
                      : 'border-transparent text-fb-text-secondary hover:text-fb-text-primary'
                  }`}
                >
                  2. Phân tích Pending ({pendingEpics.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOperationalTab('ANOMALY')}
                  className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 ${
                    operationalTab === 'ANOMALY'
                      ? 'border-fb-blue text-fb-blue'
                      : 'border-transparent text-fb-text-secondary hover:text-fb-text-primary'
                  }`}
                >
                  3. Giám sát Dữ liệu bất thường R1-R6 ({anomalyRows.length})
                </button>
              </div>

              {/* Tab 1: Progress & TTM List */}
              {operationalTab === 'PROGRESS' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Danh sách Epic Vận hành</CardTitle>
                  </CardHeader>
                  <CardBody className="p-0">
                    <TableContainer>
                      <Table>
                        <THead>
                          <TR>
                            <TH>Epic Key</TH>
                            <TH>Tên Epic</TH>
                            <TH>Trạng thái</TH>
                            <TH>Dự án</TH>
                            <TH>PM / SM</TH>
                            <TH>Start Date (T1)</TH>
                            <TH>R4G Date</TH>
                            <TH className="text-center">Cảnh báo TTM-CNTT</TH>
                            <TH className="text-center">Cảnh báo TTM-E2E</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {filteredRows.slice(0, 50).map((row) => (
                            <TR key={row.epicKey}>
                              <TD>
                                <button
                                  type="button"
                                  onClick={() => setSelectedEpicKey(row.epicKey)}
                                  className="font-bold text-fb-blue hover:underline"
                                >
                                  {row.epicKey}
                                </button>
                              </TD>
                              <TD className="max-w-xs truncate font-medium" title={row.epicName}>
                                {row.epicName}
                              </TD>
                              <TD>
                                <Badge variant="neutral">{row.currentStatus}</Badge>
                              </TD>
                              <TD>{row.projectKey}</TD>
                              <TD>{row.ownerName || '—'}</TD>
                              <TD>
                                {row.t1StartDate ? (
                                  <span className="flex items-center gap-1 text-[11px]">
                                    <CaretRight className="size-3 text-slate-500" /> {row.t1StartDate}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </TD>
                              <TD>
                                {row.r4gDate ? (
                                  <span className="flex items-center gap-1 text-[11px] font-bold">
                                    <Checks className="size-3 text-black" /> {row.r4gDate}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </TD>
                              <TD className="text-center">
                                {row.alertLevel !== 'NONE' ? (
                                  <Badge variant={ALERT_BADGE_VARIANT[row.alertLevel]}>{ALERT_BADGE_LABEL[row.alertLevel]}</Badge>
                                ) : (
                                  <span className="text-fb-text-placeholder">—</span>
                                )}
                              </TD>
                              <TD className="text-center">
                                {row.ttmE2eAlertLevel === 'FAIL' ? (
                                  <Badge variant="danger">Fail TTM-E2E</Badge>
                                ) : (
                                  <span className="text-fb-text-placeholder">—</span>
                                )}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </TableContainer>
                  </CardBody>
                </Card>
              )}

              {/* Tab 2: Pending Analysis */}
              {operationalTab === 'PENDING' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Phân tích Epic đang ở Trạng thái Pending</CardTitle>
                  </CardHeader>
                  <CardBody className="p-0">
                    {pendingEpics.length === 0 ? (
                      <EmptyState title="Không có Epic nào bị Pending" description="Hiện tại không ghi nhận Epic nào đang trong trạng thái Pending." />
                    ) : (
                      <TableContainer>
                        <Table>
                          <THead>
                            <TR>
                              <TH>Epic Key</TH>
                              <TH>Tên Epic</TH>
                              <TH>PM / SM</TH>
                              <TH>Dự án</TH>
                              <TH className="text-center">Trạng thái hiện tại</TH>
                              <TH className="text-center">Tình trạng TTM</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {pendingEpics.map((row) => (
                              <TR key={row.epicKey}>
                                <TD>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedEpicKey(row.epicKey)}
                                    className="font-bold text-fb-blue hover:underline"
                                  >
                                    {row.epicKey}
                                  </button>
                                </TD>
                                <TD className="max-w-xs truncate font-medium">{row.epicName}</TD>
                                <TD>{row.ownerName || '—'}</TD>
                                <TD>{row.projectKey}</TD>
                                <TD className="text-center font-bold text-amber-700">{row.currentStatus}</TD>
                                <TD className="text-center">
                                  <Badge variant={ALERT_BADGE_VARIANT[row.alertLevel]}>{ALERT_BADGE_LABEL[row.alertLevel]}</Badge>
                                </TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* Tab 3: Data Quality Matrix (Anomaly Rules R1-R6) */}
              {operationalTab === 'ANOMALY' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Giám sát 6 Rule Sai lệch Dữ liệu (R1 - R6)</CardTitle>
                  </CardHeader>
                  <CardBody className="p-0">
                    {anomalyRows.length === 0 ? (
                      <EmptyState title="Chất lượng dữ liệu hoàn hảo" description="Không có Epic nào vi phạm các rule sai lệch dữ liệu R1 - R6." />
                    ) : (
                      <TableContainer>
                        <Table>
                          <THead>
                            <TR>
                              <TH>Epic Key</TH>
                              <TH>Tên Epic</TH>
                              <TH>Dự án</TH>
                              <TH>PM / SM</TH>
                              <TH>Mức độ sai lệch</TH>
                              <TH>Chi tiết vi phạm</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {anomalyRows.map((row) => (
                              <TR key={row.epicKey}>
                                <TD>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedEpicKey(row.epicKey)}
                                    className="font-bold text-fb-blue hover:underline"
                                  >
                                    {row.epicKey}
                                  </button>
                                </TD>
                                <TD className="max-w-xs truncate font-medium">{row.epicName}</TD>
                                <TD>{row.projectKey}</TD>
                                <TD>{row.ownerName || '—'}</TD>
                                <TD>
                                  <Badge variant="danger">Sai lệch dữ liệu</Badge>
                                </TD>
                                <TD className="text-xs text-purple-700 font-medium">
                                  {!row.t1StartDate ? '• Thiếu Start Date (R1) ' : ''}
                                  {row.epicType === 'SP-Lv12' ? '• SP mức 1-2 mâu thuẫn (R6)' : ''}
                                </TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* User Selection Modal for Superadmin / Admin / Supervisor */}
      {showUserModal && (
        <Modal
          title="Chọn User để xem Dashboard dưới dạng User"
          isOpen={showUserModal}
          onClose={() => setShowUserModal(false)}
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-fb-text-secondary">
              Chọn một tài khoản người dùng trong hệ thống để xem màn hình <strong>Operational Workbench</strong> với đúng phạm vi phân quyền của User đó.
            </p>

            <div className="relative">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-fb-text-secondary" />
              <input
                type="text"
                placeholder="Tìm tên, email hoặc role người dùng..."
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                className="w-full rounded-md border border-fb-border bg-fb-surface pl-8 pr-3 py-1.5 text-xs outline-none focus:border-fb-blue"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-fb-border rounded-md p-2">
              {filteredUsersForModal.map((u) => (
                <div
                  key={u.id}
                  onClick={() => {
                    setPreviewUserId(u.id);
                    setShowUserModal(false);
                  }}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-fb-blue-soft/50 cursor-pointer transition-all border border-transparent hover:border-fb-blue-soft"
                >
                  <div>
                    <p className="font-bold text-xs text-fb-text-primary">{u.fullName}</p>
                    <p className="text-[11px] text-fb-text-secondary">{u.email}</p>
                  </div>
                  <Badge variant="neutral">{u.role}</Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-fb-border">
              <Button variant="outline" onClick={() => setShowUserModal(false)}>
                Hủy
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Epic Browser Modal */}
      {selectedEpicKey && (
        <EpicBrowserModal
          epicKey={selectedEpicKey}
          onClose={() => setSelectedEpicKey(null)}
        />
      )}
    </div>
  );
}
