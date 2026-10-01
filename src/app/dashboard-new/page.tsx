'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CaretDown,
  CaretRight,
  ChartBar,
  ChartPie,
  Checks,
  Eye,
  Funnel,
  MagnifyingGlass,
  SlidersHorizontal,
  Warning,
  WarningCircle,
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
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { DataAnomalyList } from '@/components/epic-alerts/DataAnomalyDetail';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import { formatTtmPct1, summarizeE2e, summarizeQaIndex, summarizeTtmCntt } from '@/lib/ttm-cntt-qa';
import { ttmFailKind, isJustifyGolive, isTtmIndexEligible, isTtmIndexPass, isWaitingGolive, waitingGoliveBucket, vnTodayIso } from '@/lib/epic-row-verdicts';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { computeQaInScope, computeTtmCnttInScope } from '@/lib/ttm-scope-rules';
import { buildEpicAlertsDeepLink } from '@/lib/epic-alerts-deep-link';
import type { EpicAlertsDeepLinkParams } from '@/lib/epic-alerts-deep-link';
import type { DashboardEpicRow } from '@/lib/epic-alert-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import type { TtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { DonutChartCard, type DonutDataItem } from '@/components/dashboard-new/DonutChartCard';
import { EpicAlertsIframeModal } from '@/components/dashboard-new/EpicAlertsIframeModal';
import '@/app/epic-alerts-15/epic-alerts-15.css';

function computeDimensionDonuts(
  rows: DashboardEpicRow[],
  getDimensionKey: (row: DashboardEpicRow) => string,
) {
  const totalMap = new Map<string, number>();
  const passMap = new Map<string, number>();
  const failMap = new Map<string, number>();

  for (const row of rows) {
    if (isCancelledStatus(row.currentStatus || '')) continue;
    const key = (getDimensionKey(row) || '').trim() || 'Chưa xác định';

    // Total
    totalMap.set(key, (totalMap.get(key) ?? 0) + 1);

    // Pass TTM-CNTT (pm): trong phạm vi dữ liệu TTM (ttmCnttInScope), có R4G Date, không có data
    // anomaly, alertLevel === 'NONE'.
    if (isTtmIndexPass(row)) {
      passMap.set(key, (passMap.get(key) ?? 0) + 1);
    }

    // Fail TTM (pm): alertLevel === 'FAIL' trong phạm vi TTM-CNTT, hoặc ttmE2eAlertLevel === 'FAIL'
    // (TTM-E2E không bị giới hạn bởi Phạm vi dữ liệu cho TTM).
    if ((row.ttmCnttInScope && row.alertLevel === 'FAIL') || row.ttmE2eAlertLevel === 'FAIL') {
      failMap.set(key, (failMap.get(key) ?? 0) + 1);
    }
  }

  const totalData: DonutDataItem[] = Array.from(totalMap.entries()).map(([name, value]) => ({ name, value }));
  const passData: DonutDataItem[] = Array.from(passMap.entries()).map(([name, value]) => ({ name, value }));
  const failData: DonutDataItem[] = Array.from(failMap.entries()).map(([name, value]) => ({ name, value }));

  return { failData, passData, totalData };
}

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
  rows: DashboardEpicRow[];
  ttmIndexGlobal: TtmIndexGlobalCache | null;
  viewAsUser: { email: string; fullName: string; id: number; role: string } | null;
}

type DimensionKey = 'domain' | 'epicType' | 'pmsm' | 'project';
type OperationalTab = 'WAITING_GOLIVE' | 'PENDING' | 'ANOMALY';
type MatrixSortKey = 'late' | 'name' | 'ok' | 'qaPct' | 'qldaFail' | 'qldaPass' | 'qldaPct' | 'ttmEligible' | 'total';

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  domain: 'Theo Domain',
  epicType: 'Theo Phân loại Epic',
  pmsm: 'Theo PM/SM',
  project: 'Theo Dự án',
};

function formatTtmIndexValue(summary: TtmCnttSummary | null | undefined): string {
  return summary && summary.total > 0 ? `${formatTtmPct1(summary.pctPrecise)}%` : '—';
}

function formatTtmIndexTooltip(firstLine: string, summary: TtmCnttSummary | null | undefined): string {
  const secondLine = summary && summary.total > 0 ? `${summary.pass}/${summary.eligible} Epic đạt TTM` : '—';
  return `${firstLine}\n${secondLine}`;
}

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

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

interface DimensionMatrixItem {
  late: number;
  name: string;
  ok: number;
  qa: TtmCnttSummary;
  qlda: TtmCnttSummary;
  total: number;
}

/** Maps a "Ma trận Phân bổ" column to the value its TH sorts by — qldaPct/qaPct use the unrounded
 * ratio (finer-grained ordering than the whole-number `pct` shown on screen); qaPct sorts rows
 * with no QA-scoped Epic (qa.total === 0, shown as "—") to the end regardless of direction. */
function matrixSortValue(item: DimensionMatrixItem, key: MatrixSortKey): number | string | null {
  switch (key) {
    case 'name': return item.name;
    case 'total': return item.total;
    case 'ttmEligible': return item.qlda.eligible;
    case 'qldaPct': return item.qlda.pctPrecise;
    case 'qldaPass': return item.qlda.pass;
    case 'qldaFail': return item.qlda.fail;
    case 'qaPct': return item.qa.total > 0 ? item.qa.pctPrecise : null;
    case 'ok': return item.ok;
    case 'late': return item.late;
    default: return null;
  }
}

const ALERT_BADGE_VARIANT: Record<AlertLevel, 'danger' | 'info' | 'neutral' | 'warning'> = {
  EARLY: 'info',
  FAIL: 'danger',
  LATE: 'warning',
  NONE: 'neutral',
};

const ALERT_BADGE_LABEL: Record<AlertLevel, string> = {
  EARLY: 'Cảnh báo sớm',
  FAIL: 'Fail TTM-CNTT (QLDA)',
  LATE: 'Chậm tiến độ',
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
  // "Ma trận Phân bổ Tiến độ Epic Đa chiều" — mặc định sort giảm dần theo TTM-CNTT (QLDA).
  const { sortKey: matrixSortKey, sortDirection: matrixSortDirection, toggleSort: toggleMatrixSort, directionFor: matrixSortDirectionFor } = useSortableList<MatrixSortKey>('qldaPct', 'desc');
  const [operationalTab, setOperationalTab] = useState<OperationalTab>('WAITING_GOLIVE');
  const [selectedEpicKey, setSelectedEpicKey] = useState<string | null>(null);

  // When in PM/SM view (OPERATIONAL), only epicType and project dimensions are available
  useEffect(() => {
    if (viewMode === 'OPERATIONAL' && dimensionKey !== 'epicType' && dimensionKey !== 'project') {
      setDimensionKey('epicType');
    }
  }, [viewMode, dimensionKey]);

  // Accordion state for LEAD view sections (lazy loading)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    domain: false,
    epicType: true,
    pmsm: false,
    project: false,
    requestingUnit: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filters — High-level dashboard scope
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterPmSms, setFilterPmSms] = useState<string[]>([]);
  const [filterRequestingUnits, setFilterRequestingUnits] = useState<string[]>([]);

  // "Advanced Filters" — Phạm vi dữ liệu cho TTM (2026-09-28), collapsed by default. A live,
  // per-view override of the admin default ("Cấu hình cảnh báo" § Phạm vi dữ liệu cho TTM) — never
  // saved/cached; applying it just recomputes this page's own TTM-CNTT/QA-Index gate for every
  // widget below (see computeTtmCnttInScope/computeQaInScope in ttm-scope-rules.ts). Seeded once
  // from the admin default (scopeDefaultsLoaded guards both the seeding and the deep-link forward
  // below, so a click before the fetch resolves never sends an accidentally-unbounded override).
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [scopeDefaultsLoaded, setScopeDefaultsLoaded] = useState(false);
  const [filterCnttFrom, setFilterCnttFrom] = useState('');
  const [filterCnttTo, setFilterCnttTo] = useState('');
  const [filterQaFrom, setFilterQaFrom] = useState('');
  const [filterQaTo, setFilterQaTo] = useState('');

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const res = await fetch('/api/ttm-scope-config');
        const payload: unknown = await res.json();
        if (res.ok && payload && typeof payload === 'object') {
          const config = payload as { cnttFrom: string | null; cnttTo: string | null; qaFrom: string | null; qaTo: string | null };
          setFilterCnttFrom(config.cnttFrom ?? '');
          setFilterCnttTo(config.cnttTo ?? '');
          setFilterQaFrom(config.qaFrom ?? '');
          setFilterQaTo(config.qaTo ?? '');
        }
      } catch {
        // Best-effort — leave the 4 fields blank (no bound), matching the admin default's own
        // fallback when ttm_scope_config has never been saved.
      } finally {
        setScopeDefaultsLoaded(true);
      }
    });
  }, []);

  // Epic Alerts Iframe Modal state (in-page drilldown popup)
  const [epicModalUrl, setEpicModalUrl] = useState<string | null>(null);
  const [epicModalTitle, setEpicModalTitle] = useState<string>('Quản trị Epic');

  const openEpicModal = (url: string, title: string) => {
    setEpicModalUrl(url);
    setEpicModalTitle(title);
  };
  const closeEpicModal = () => {
    setEpicModalUrl(null);
  };

  // Guards against an out-of-order response overwriting a newer one when
  // previewUserId changes rapidly (e.g. switching between two users quickly).
  const requestIdRef = useRef(0);

  const loadData = async (userId: number | null) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const url = userId ? `/api/dashboard-new?viewAsUserId=${userId}` : '/api/dashboard-new';
      const res = await fetch(url, { cache: 'no-store' });
      const json: unknown = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        throw new Error(typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : 'Không thể tải dữ liệu.');
      }
      const payload = json as DashboardNewPayload;
      setData(payload);

      const isAdminOrSupervisor = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(payload.actor.role);
      if (isAdminOrSupervisor && payload.isUserPreview) {
        setViewMode('OPERATIONAL');
        setFilterPmSms([]);
      } else if (!isAdminOrSupervisor) {
        setViewMode('OPERATIONAL');
        setFilterPmSms([]);
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
    // Deferred via a microtask (not called directly) — loadData's first statements are
    // setLoading(true)/setError(null), which would otherwise run synchronously within this effect
    // body (same convention used elsewhere in this codebase for this exact shape).
    void Promise.resolve().then(() => loadData(previewUserId));
  }, [previewUserId]);

  const isAdminOrSupervisor = useMemo(() => {
    return data ? ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(data.actor.role) : false;
  }, [data]);

  // Filtered Epic Rows — also re-derives ttmCnttInScope/qaInScope per row from the Advanced Filter's
  // current A/B/C/D (see ttm-scope-rules.ts), overriding whatever epic_alert_row_cache baked in from
  // the admin default. Every downstream widget already reads row.ttmCnttInScope/qaInScope (same as
  // Quản trị Epic's badge/summarizeTtmCntt/summarizeQaIndex), so this is the single place the
  // Advanced Filter needs to touch for its effect to reach the whole page.
  const filteredRows = useMemo(() => {
    if (!data) return [];
    const scopeConfig = {
      cnttFrom: filterCnttFrom || null,
      cnttTo: filterCnttTo || null,
      qaFrom: filterQaFrom || null,
      qaTo: filterQaTo || null,
    };
    return data.rows
      .filter((row) => {
        if (isCancelledStatus(row.currentStatus || '')) return false;
        if (filterProjects.length > 0 && !filterProjects.includes(row.projectKey)) return false;
        if (filterDomain && row.domainName !== filterDomain) return false;
        // In PM/SM view (OPERATIONAL), PM/SM filter is removed / not applied.
        if (viewMode === 'EXECUTIVE' && filterPmSms.length > 0 && !row.ownerName.split(',').map((name) => name.trim()).some((name) => filterPmSms.includes(name))) return false;
        if (filterRequestingUnits.length > 0 && (!row.requestingUnit || !filterRequestingUnits.includes(row.requestingUnit))) return false;
        return true;
      })
      .map((row) => ({
        ...row,
        ttmCnttInScope: computeTtmCnttInScope(row.r4gDate, row.targetR4gDate, scopeConfig),
        qaInScope: computeQaInScope(row.r4gDate, scopeConfig),
      }));
  }, [data, filterProjects, filterDomain, filterPmSms, filterRequestingUnits, viewMode, filterCnttFrom, filterCnttTo, filterQaFrom, filterQaTo]);

  // Executive Metrics. TTM-CNTT-specific numbers (eligibleTtm/passTtm/failCntt/ttmHealthPct) come
  // from the shared summarizeTtmCntt helper so this stays byte-for-byte the same ratio as the
  // TTM-CNTT-QA metrics below and as dashboard-service.ts's achievedTtmCount/achievedTtmEligibleCount.
  // Epic Scoring Service rows (display engine 'scoring') have no "Cảnh báo sớm" any more (D4).
  const isScoringEngine = useMemo(() => filteredRows.some((row) => Boolean(row.scoringBadges)), [filteredRows]);
  const executiveMetrics = useMemo(() => {
    // "Tổng số Epic" excludes Epic "Ngoài phạm vi dữ liệu cho TTM" (SCOPE_CNTT_OUT /
    // !ttmCnttInScope) — same universe the TTM-CNTT (QLDA) ring's mẫu số is drawn from, so the two
    // numbers on this header are always directly comparable.
    const inScopeRows = filteredRows.filter((row) => row.ttmCnttInScope);
    const total = inScopeRows.length;
    // "Sai lệch dữ liệu" sub-link under "Tổng số Epic" — same scope (ttmCnttInScope) as `total`
    // itself, so the sub-link's count is always a true subset of the tile above it.
    const anomalyInScopeCount = inScopeRows.filter((row) => row.hasDataAnomaly).length;
    // "Chưa có R4G Date" sub-link — mutually exclusive with anomalyInScopeCount (excludes
    // hasDataAnomaly rows) so total − anomalyInScopeCount − missingR4gInScopeCount always lands
    // exactly on eligibleTtm (mẫu số TTM-CNTT (QLDA)), matching isTtmIndexEligible's own gate.
    const missingR4gInScopeCount = inScopeRows.filter((row) => !row.hasDataAnomaly && !row.r4gDate).length;
    let lateWarning = 0;
    let earlyWarning = 0;
    let anomalyCount = 0;
    let waitingGolive = 0;
    // "Chờ golive" (rule 2026-10-01) no longer needs R4G Date, so it splits 3 ways: no R4G Date yet,
    // or R4G Date recorded and still within/past the 5-working-day grace deadline — same `vnTodayIso`
    // used by matchesAlertFilter's WAITING_GOLIVE_* filters, so these counts and what the sub-link
    // click opens always agree.
    let waitingGoliveMissingR4g = 0;
    let waitingGoliveWithinGrace = 0;
    let waitingGoliveOverdue = 0;
    let justifyGolive = 0;
    const today = vnTodayIso();

    for (const row of filteredRows) {
      if (row.ttmCnttInScope && row.alertLevel === 'LATE') lateWarning += 1;
      else if (row.ttmCnttInScope && row.alertLevel === 'EARLY') earlyWarning += 1;

      if (row.hasDataAnomaly) anomalyCount += 1;
      // "Chờ golive" and "Giải trình Golive" are independent badges (an Epic can carry both).
      const bucket = waitingGoliveBucket(row, today);
      if (bucket) waitingGolive += 1;
      if (bucket === 'MISSING_R4G') waitingGoliveMissingR4g += 1;
      else if (bucket === 'WITHIN_GRACE') waitingGoliveWithinGrace += 1;
      else if (bucket === 'OVERDUE') waitingGoliveOverdue += 1;
      if (isJustifyGolive(row)) justifyGolive += 1;
    }

    const ttmCntt = summarizeTtmCntt(filteredRows);

    return {
      anomalyCount,
      anomalyInScopeCount,
      missingR4gInScopeCount,
      earlyWarning,
      eligibleTtm: ttmCntt.eligible,
      failCntt: ttmCntt.fail,
      // Split of failCntt — see ttmFailKind: with an R4G Date past Target (inside the TTM-CNTT
      // denominator) vs. no R4G Date yet and already past Target (outside it).
      failCnttLateR4g: filteredRows.filter((row) => !isCancelledStatus(row.currentStatus || '') && ttmFailKind(row) === 'LATE_R4G').length,
      failCnttMissingR4g: filteredRows.filter((row) => !isCancelledStatus(row.currentStatus || '') && ttmFailKind(row) === 'MISSING_R4G').length,
      justifyGolive,
      lateWarning,
      passTtm: ttmCntt.pass,
      waitingGolive,
      waitingGoliveMissingR4g,
      waitingGoliveWithinGrace,
      waitingGoliveOverdue,
      total,
      ttmHealthPct: ttmCntt.pct,
      ttmHealthPctPrecise: ttmCntt.pctPrecise,
    };
  }, [filteredRows]);

  // TTM-CNTT-QA: the exact same TTM-CNTT ratio (summarizeQaIndex), scoped to Epics currently
  // 'MVP Done' or 'Released' plus the "R4G for TTM (QA)" gate — always over filteredRows, i.e.
  // within the user's data-access scope and whatever project/domain/search filter is active, same
  // as executiveMetrics above.
  const qaMetrics = useMemo(() => summarizeQaIndex(filteredRows), [filteredRows]);

  // TTM-E2E "Health Index Ring" — same summarizeE2e() the company-wide cache uses (see
  // ttm-index-global-cache-service.ts), just over filteredRows instead of every Epic in the system.
  const e2eMetrics = useMemo(() => summarizeE2e(filteredRows), [filteredRows]);

  // Drills a KPI tile/matrix cell down into "Quản trị Epic" (epic-alerts-15) pre-filtered to exactly
  // what produced that number — carries over whatever project/domain/PM-SM/requesting-unit/search
  // the dashboard itself is currently scoped to, so the target screen's count matches the tile the
  // user clicked.
  const toEpicAlertsLink = (extra: EpicAlertsDeepLinkParams = {}) => buildEpicAlertsDeepLink({
    alert: extra.alert,
    dataIssue: extra.dataIssue,
    domain: extra.domain ?? (filterProjects.length > 0 ? undefined : (filterDomain || undefined)),
    pmSm: extra.pmSm ?? (viewMode === 'EXECUTIVE' && filterPmSms.length > 0 ? filterPmSms : undefined),
    projects: extra.projects ?? (filterProjects.length > 0 ? filterProjects : undefined),
    requestingUnit: extra.requestingUnit ?? (filterRequestingUnits.length > 0 ? filterRequestingUnits : undefined),
    search: extra.search,
    status: extra.status,
    type: extra.type,
    // "Phạm vi dữ liệu cho TTM" Advanced Filter — always forwarded as an explicit override so the
    // target screen's count matches this dashboard's own (already-loaded admin default or whatever
    // the user edited it to) exactly, rather than re-resolving its own admin default independently.
    ...(scopeDefaultsLoaded ? {
      ttmScopeCnttFrom: extra.ttmScopeCnttFrom ?? (filterCnttFrom || null),
      ttmScopeCnttTo: extra.ttmScopeCnttTo ?? (filterCnttTo || null),
      ttmScopeQaFrom: extra.ttmScopeQaFrom ?? (filterQaFrom || null),
      ttmScopeQaTo: extra.ttmScopeQaTo ?? (filterQaTo || null),
    } : {}),
  });

  const toEpicAlertsLinkForMatrixItem = (item: { name: string }, metricType: 'total' | 'pass' | 'fail' | 'failLateR4g' | 'failMissingR4g' | 'ok' | 'late' | 'qa' | 'qaPass' | 'ttmEligible') => {
    const extraParams: EpicAlertsDeepLinkParams = {};

    // Dimension scope
    if (dimensionKey === 'domain') {
      if (item.name !== 'Khác' && item.name !== 'Chưa gán Domain') {
        extraParams.domain = item.name;
      }
    } else if (dimensionKey === 'pmsm') {
      if (item.name !== 'Khác' && item.name !== 'Chưa gán PM/SM') {
        extraParams.pmSm = item.name.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (dimensionKey === 'project') {
      if (item.name !== 'Khác' && item.name !== 'Chưa gán') {
        extraParams.projects = [item.name];
      }
    } else if (dimensionKey === 'epicType') {
      if (item.name !== 'Khác') {
        extraParams.type = item.name;
      }
    }

    // Metric column scope
    if (metricType === 'pass') {
      extraParams.alert = 'ACHIEVED_CNTT';
    } else if (metricType === 'fail') {
      extraParams.alert = 'FAIL';
    } else if (metricType === 'failLateR4g') {
      extraParams.alert = 'FAIL_LATE_R4G';
    } else if (metricType === 'failMissingR4g') {
      extraParams.alert = 'FAIL_MISSING_R4G';
    } else if (metricType === 'late') {
      extraParams.alert = 'LATE';
    } else if (metricType === 'qa') {
      extraParams.status = ['MVP Done', 'Released'];
    } else if (metricType === 'qaPass') {
      extraParams.status = ['MVP Done', 'Released'];
      extraParams.alert = 'ACHIEVED_CNTT';
    } else if (metricType === 'ttmEligible') {
      extraParams.alert = 'TTM_ELIGIBLE_IN_SCOPE';
    }

    return toEpicAlertsLink(extraParams);
  };

  // Breakdown Matrix Table Data
  const dimensionMatrix = useMemo(() => {
    const map = new Map<string, { late: number; ok: number; rows: DashboardEpicRow[] }>();

    for (const row of filteredRows) {
      let keyVal = 'Khác';
      if (dimensionKey === 'domain') keyVal = row.domainName || 'Chưa gán Domain';
      else if (dimensionKey === 'pmsm') keyVal = row.ownerName || 'Chưa gán PM/SM';
      else if (dimensionKey === 'project') keyVal = row.projectName || row.projectKey || 'Chưa gán';
      else if (dimensionKey === 'epicType') keyVal = row.epicType || 'CT-Lv12';

      const curr = map.get(keyVal) ?? { late: 0, ok: 0, rows: [] };
      curr.rows.push(row);

      // "Đúng/Chậm tiến độ" only tracks Epics that don't have a TTM-CNTT verdict yet — the same
      // eligibility gate summarizeTtmCntt uses below (recorded R4G Date + no data anomaly), AND are
      // in the current "Phạm vi dữ liệu cho TTM" scope. Once a row is QLDA-judged it's counted there
      // instead, so every row in the bucket lands in exactly one of {qlda pass/fail, late/ok} and
      // "Tổng số Epic" never silently outgrows the columns that add up to it (a Released Epic with a
      // data anomaly or a missing R4G Date used to vanish from every column here otherwise). A row
      // outside the configured TTM scope lands in NEITHER — same "not counted anywhere TTM-CNTT"
      // treatment as its Nhận xét badge on Quản trị Epic — only possible once an admin has actually
      // narrowed the default (unbounded) scope.
      const isQldaJudged = isTtmIndexEligible(row);
      if (row.ttmCnttInScope && !isQldaJudged) {
        if (row.alertLevel === 'FAIL' || row.alertLevel === 'LATE') curr.late += 1;
        else curr.ok += 1;
      }
      map.set(keyVal, curr);
    }

    const items = [...map.entries()].map(([name, bucket]) => {
      const qlda = summarizeTtmCntt(bucket.rows);
      const qa = summarizeQaIndex(bucket.rows);
      // "Fail TTM" split: with an R4G Date past Target (inside the denominator) vs. no R4G Date yet
      // and already past Target (outside it) — see ttmFailKind.
      const failLateR4g = bucket.rows.filter((row) => !isCancelledStatus(row.currentStatus || '') && ttmFailKind(row) === 'LATE_R4G').length;
      const failMissingR4g = bucket.rows.filter((row) => !isCancelledStatus(row.currentStatus || '') && ttmFailKind(row) === 'MISSING_R4G').length;
      return { failLateR4g, failMissingR4g, late: bucket.late, name, ok: bucket.ok, qa, qlda, total: bucket.rows.length };
    });
    return items.sort((a, b) => compareValues(matrixSortValue(a, matrixSortKey), matrixSortValue(b, matrixSortKey), matrixSortDirection));
  }, [filteredRows, dimensionKey, matrixSortKey, matrixSortDirection]);

  // Top Risk Projects
  const topRiskProjects = useMemo(() => {
    const map = new Map<string, { fail: number; name: string; total: number }>();
    for (const row of filteredRows) {
      const pKey = row.projectKey || 'Chưa gán';
      const pName = row.projectName || pKey;
      const curr = map.get(pKey) ?? { fail: 0, name: pName, total: 0 };
      curr.total += 1;
      if ((row.ttmCnttInScope && row.alertLevel === 'FAIL') || row.ttmE2eAlertLevel === 'FAIL') curr.fail += 1;
      map.set(pKey, curr);
    }
    return [...map.values()].sort((a, b) => b.fail - a.fail).slice(0, 5);
  }, [filteredRows]);

  // Phase Pipeline (Kanban Phases for Version 2). Classified off the same signals the rest of the
  // page already trusts (row.stages' isDone/isCurrentStage, plus exact status equality for the
  // To Do/Backlog/In PO/Cancelled exemption list from epic-data-anomaly.ts) instead of
  // currentStatus.includes(...) — that substring matching mis-bucketed real statuses like
  // "Support" (contains "po") and "Dev/SIT/UAT Done" (contains "done") into the wrong phase.
  const pipelinePhases = useMemo(() => {
    const phases = [
      { key: 'To Do', label: '1. To Do', rows: [] as DashboardEpicRow[] },
      { key: 'Design', label: '2. Design', rows: [] as DashboardEpicRow[] },
      { key: 'In Progress', label: '3. In Progress', rows: [] as DashboardEpicRow[] },
      { key: 'Ready for Golive', label: '4. Ready for Golive', rows: [] as DashboardEpicRow[] },
      { key: 'Released', label: '5. Released', rows: [] as DashboardEpicRow[] },
    ];

    for (const row of filteredRows) {
      const status = (row.currentStatus || '').trim().toUpperCase();
      const isReleased = Boolean(row.stages.release.isDone && row.dueDate);
      const isBacklogLike = status === 'TO DO' || status === 'BACKLOG' || status === 'IN PO';

      if (isReleased) {
        phases[4].rows.push(row);
      } else if (isBacklogLike) {
        phases[0].rows.push(row);
      } else if (row.stages.r4golive.isCurrentStage) {
        phases[3].rows.push(row);
      } else if (row.stages.design.isCurrentStage) {
        phases[1].rows.push(row);
      } else {
        phases[2].rows.push(row);
      }
    }

    return phases.map((phase) => {
      const count = phase.rows.length;
      const alertCount = phase.rows.filter((r) => (r.ttmCnttInScope && (r.alertLevel === 'FAIL' || r.alertLevel === 'LATE')) || r.ttmE2eAlertLevel === 'FAIL').length;
      return { ...phase, alertCount, count };
    });
  }, [filteredRows]);

  // Waiting Golive Epics List
  const waitingGoliveEpics = useMemo(() => {
    return filteredRows.filter((r) => isWaitingGolive(r));
  }, [filteredRows]);

  // Pending Epics List
  const pendingEpics = useMemo(() => {
    return filteredRows.filter((r) => (r.currentStatus || '').toLowerCase().includes('pending'));
  }, [filteredRows]);

  // Anomaly Rules Breakdown
  const anomalyRows = useMemo(() => {
    return filteredRows.filter((r) => r.hasDataAnomaly);
  }, [filteredRows]);

  // Projects, Domains, Types, Statuses & other filter options
  const projectOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.filter((r) => !isCancelledStatus(r.currentStatus || '')).map((r) => r.projectKey).filter((v): v is string => Boolean(v)))].sort();
  }, [data]);

  const domainOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.filter((r) => !isCancelledStatus(r.currentStatus || '')).map((r) => r.domainName).filter((v): v is string => Boolean(v)))].sort();
  }, [data]);

  const requestingUnitOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.filter((r) => !isCancelledStatus(r.currentStatus || '')).map((r) => r.requestingUnit).filter((unit): unit is string => Boolean(unit)))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  const pmSmOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.filter((r) => !isCancelledStatus(r.currentStatus || '')).flatMap((r) => (r.ownerName || '').split(',').map((name) => name.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [data]);

  // Domain → Project Keys, selecting a Domain auto-selects every project under it
  const domainProjectKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const row of data.rows) {
      if (isCancelledStatus(row.currentStatus || '')) continue;
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

  const filteredUsersForModal = useMemo(() => {
    if (!data) return [];
    if (!userSearchText.trim()) return data.managedUsers;
    const q = userSearchText.toLowerCase();
    return data.managedUsers.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  }, [data, userSearchText]);

  // User effective role (for preview vs actual actor)
  const effectiveRole = data?.viewAsUser?.role || data?.actor.role || 'USER';
  const showDomainSection = domainOptions.length > 1;
  const showPmsmSection = effectiveRole !== 'USER';
  const showProjectSection = !(effectiveRole === 'USER' && projectOptions.length <= 1);

  // Lazy Donut Datasets (only computed when section is open)
  const requestingUnitDonuts = useMemo(() => {
    if (!openSections.requestingUnit) return null;
    return computeDimensionDonuts(filteredRows, (r) => r.requestingUnit || 'Chưa xác định');
  }, [openSections.requestingUnit, filteredRows]);

  const domainDonuts = useMemo(() => {
    if (!openSections.domain) return null;
    return computeDimensionDonuts(filteredRows, (r) => r.domainName || 'Chưa gán Domain');
  }, [openSections.domain, filteredRows]);

  const epicTypeDonuts = useMemo(() => {
    if (!openSections.epicType) return null;
    return computeDimensionDonuts(filteredRows, (r) => r.epicType || 'CT-Lv12');
  }, [openSections.epicType, filteredRows]);

  const pmsmDonuts = useMemo(() => {
    if (!openSections.pmsm) return null;
    return computeDimensionDonuts(filteredRows, (r) => r.ownerName || 'Chưa gán PM/SM');
  }, [openSections.pmsm, filteredRows]);

  const projectDonuts = useMemo(() => {
    if (!openSections.project) return null;
    return computeDimensionDonuts(filteredRows, (r) => r.projectName || r.projectKey || 'Chưa gán');
  }, [openSections.project, filteredRows]);

  const phaseStatuses = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of pipelinePhases) {
      map[p.key] = [...new Set(p.rows.map((r) => r.currentStatus).filter(Boolean))];
    }
    return map;
  }, [pipelinePhases]);

  const renderKpiStrip = () => (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      <div className="rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs">
        <p className="text-[10px] font-bold uppercase text-fb-text-secondary">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink(), 'Danh sách Epic - Tổng số Epic')}
            className="hover:underline cursor-pointer"
            title="Xem tất cả Epic trong phạm vi lọc"
          >
            Tổng số Epic
          </button>
        </p>
        <p className="mt-1 text-xl font-extrabold text-fb-text-primary">{executiveMetrics.total}</p>
        <p className="text-[10px] text-fb-text-secondary flex flex-wrap gap-x-1.5">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'DATA_ANOMALY_IN_SCOPE' }), 'Danh sách Epic - Sai lệch dữ liệu (trong phạm vi TTM-CNTT)')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Sai lệch dữ liệu (trong phạm vi TTM-CNTT) ở Quản trị Epic"
          >
            {executiveMetrics.anomalyInScopeCount} sai lệch dữ liệu
          </button>
          ·
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'MISSING_R4G_IN_SCOPE' }), 'Danh sách Epic - Chưa có R4G Date (trong phạm vi TTM-CNTT)')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic chưa có R4G Date (trong phạm vi TTM-CNTT) ở Quản trị Epic — Tổng số Epic trừ Sai lệch dữ liệu trừ Chưa có R4G Date = mẫu số TTM-CNTT (QLDA)"
          >
            {executiveMetrics.missingR4gInScopeCount} chưa có R4G Date
          </button>
        </p>
      </div>

      {/* Fail = Trễ R4G (trong mẫu số TTM-CNTT) + Thiếu R4G (ngoài mẫu số) — same split as the matrix's
          "Fail TTM" column, so this tile can be reconciled with the TTM-CNTT (QLDA) ring next to it. */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-xs">
        <p className="text-[10px] font-bold uppercase text-status-danger">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'FAIL' }), 'Danh sách Epic - Fail TTM-CNTT (QLDA)')}
            className="hover:underline cursor-pointer uppercase"
            title="Xem danh sách Epic Fail TTM-CNTT (QLDA) ở Quản trị Epic"
          >
            Fail TTM-CNTT (QLDA)
          </button>
        </p>
        <p className="mt-1 text-xl font-extrabold text-status-danger">{executiveMetrics.failCntt}</p>
        <p className="text-[10px] text-red-600 font-medium flex flex-wrap gap-x-1.5">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'FAIL_LATE_R4G' }), 'Danh sách Epic - Fail TTM-CNTT (QLDA): Trễ R4G')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Có R4G Date nhưng muộn hơn Target — nằm trong mẫu số TTM-CNTT (QLDA)"
          >
            {executiveMetrics.failCnttLateR4g} Trễ R4G
          </button>
          ·
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'FAIL_MISSING_R4G' }), 'Danh sách Epic - Fail TTM-CNTT (QLDA): Thiếu R4G')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Chưa có R4G Date và đã quá Target — không nằm trong mẫu số TTM-CNTT (QLDA)"
          >
            {executiveMetrics.failCnttMissingR4g} Thiếu R4G
          </button>
        </p>
      </div>

      {/* Health Index Ring — TTM-CNTT (QLDA), scoped to this dashboard's filters (filteredRows) */}
      <div className="col-span-2 sm:col-span-2 lg:col-span-1 rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs flex items-center justify-start gap-3">
        <div
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#0866ff 0% ${executiveMetrics.ttmHealthPctPrecise}%, #e4e6eb ${executiveMetrics.ttmHealthPctPrecise}% 100%)`,
          }}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-fb-surface font-extrabold text-xs text-fb-blue">
            {formatTtmPct1(executiveMetrics.ttmHealthPctPrecise)}%
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-fb-text-primary">TTM-CNTT (QLDA)</p>
          <p className="text-[10px] text-fb-text-secondary">{executiveMetrics.passTtm}/{executiveMetrics.eligibleTtm}</p>
        </div>
      </div>

      {/* Health Index Ring — TTM-CNTT (QA), scoped to this dashboard's filters (filteredRows) */}
      <div className="col-span-2 sm:col-span-2 lg:col-span-1 rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs flex items-center justify-start gap-3">
        <div
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full"
          style={{
            background: qaMetrics.total > 0
              ? `conic-gradient(#7c3aed 0% ${qaMetrics.pctPrecise}%, #e4e6eb ${qaMetrics.pctPrecise}% 100%)`
              : '#e4e6eb',
          }}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-fb-surface font-extrabold text-xs text-purple-700">
            {qaMetrics.total > 0 ? `${formatTtmPct1(qaMetrics.pctPrecise)}%` : '—'}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-fb-text-primary">TTM-CNTT (QA)</p>
          <p className="text-[10px] text-fb-text-secondary">
            {qaMetrics.total > 0 ? `${qaMetrics.pass}/${qaMetrics.eligible}` : 'Chưa có Epic MVP Done/Released'}
          </p>
        </div>
      </div>

      {/* Health Index Ring — TTM-E2E, scoped to this dashboard's filters (filteredRows). Clicking
          opens "Quản trị Epic" filtered to Fail TTM-E2E (replaces the old "Fail TTM-E2E" tile). */}
      <button
        type="button"
        onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'FAIL_E2E' }), 'Danh sách Epic - Fail TTM-E2E')}
        className="col-span-2 sm:col-span-2 lg:col-span-1 flex items-center justify-start gap-3 rounded-xl border border-fb-border bg-fb-surface p-3 text-left shadow-xs transition-all hover:border-emerald-400 hover:shadow-sm cursor-pointer w-full"
        title="Xem danh sách Epic Fail TTM-E2E ở Quản trị Epic"
      >
        <div
          className="relative flex size-14 shrink-0 items-center justify-center rounded-full"
          style={{
            background: e2eMetrics.total > 0
              ? `conic-gradient(#059669 0% ${e2eMetrics.pctPrecise}%, #e4e6eb ${e2eMetrics.pctPrecise}% 100%)`
              : '#e4e6eb',
          }}
        >
          <div className="flex size-10 items-center justify-center rounded-full bg-fb-surface font-extrabold text-xs text-emerald-700">
            {e2eMetrics.total > 0 ? `${formatTtmPct1(e2eMetrics.pctPrecise)}%` : '—'}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-fb-text-primary">Hoàn thành TTM-E2E</p>
          <p className="text-[10px] text-fb-text-secondary">
            {e2eMetrics.total > 0 ? `${e2eMetrics.pass}/${e2eMetrics.eligible}` : 'Chưa có Epic'}
          </p>
        </div>
      </button>

    </div>

    {/* Vertical divider: separates the "identity" tiles (rings, Tổng số Epic, Fail TTM-CNTT) from
        the operational-alert tiles to their right. lg-only — below that breakpoint the two grids
        stack full-width, where a vertical line would have nothing to separate side-by-side. */}
    <div className="hidden w-px shrink-0 bg-fb-border lg:block" aria-hidden="true" />

    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-xs">
        <p className="text-[10px] font-bold uppercase text-status-warning">{isScoringEngine ? 'Chậm tiến độ' : 'Cảnh báo (Sớm/Muộn)'}</p>
        <p className="mt-1 text-xl font-extrabold text-status-warning">{executiveMetrics.lateWarning + executiveMetrics.earlyWarning}</p>
        <p className="text-[10px] text-amber-700 font-medium">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'LATE' }), 'Danh sách Epic - Chậm tiến độ')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Chậm tiến độ ở Quản trị Epic"
          >
            {executiveMetrics.lateWarning} muộn
          </button>
          {!isScoringEngine && ' · '}
          {!isScoringEngine && <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'EARLY' }), 'Danh sách Epic - Cảnh báo sớm')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Cảnh báo sớm ở Quản trị Epic"
          >
            {executiveMetrics.earlyWarning} sớm
          </button>}
        </p>
      </div>

      <button
        type="button"
        onClick={() => openEpicModal(toEpicAlertsLink({ dataIssue: true }), 'Danh sách Epic - Sai lệch Dữ liệu')}
        className="block text-left rounded-xl border border-purple-200 bg-purple-50/50 p-3 shadow-xs transition-all hover:border-purple-400 hover:shadow-sm cursor-pointer w-full"
        title="Xem danh sách Epic sai lệch dữ liệu ở Quản trị Epic"
      >
        <p className="text-[10px] font-bold uppercase text-purple-700">Sai lệch Dữ liệu</p>
        <p className="mt-1 text-xl font-extrabold text-purple-700">{executiveMetrics.anomalyCount}</p>
        <p className="text-[10px] text-purple-600 font-medium">Vi phạm rule R1-R7</p>
      </button>

      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-xs">
        <p className="text-[10px] font-bold uppercase text-sky-700">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'WAITING_GOLIVE' }), 'Danh sách Epic - Chờ golive')}
            className="hover:underline cursor-pointer"
            title="Xem danh sách Epic Chờ golive ở Quản trị Epic"
          >
            Chờ golive
          </button>
        </p>
        <p className="mt-1 text-xl font-extrabold text-sky-700">{executiveMetrics.waitingGolive}</p>
        <p className="text-[10px] text-sky-700 font-medium flex flex-wrap gap-x-1.5">
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'WAITING_GOLIVE_MISSING_R4G' }), 'Danh sách Epic - Chờ golive: Thiếu R4G Date')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Chờ golive nhưng thiếu R4G Date ở Quản trị Epic"
          >
            {executiveMetrics.waitingGoliveMissingR4g} thiếu R4G
          </button>
          ·
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'WAITING_GOLIVE_WITHIN_GRACE' }), 'Danh sách Epic - Chờ golive: Trong hạn')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Chờ golive còn trong hạn R4G Date + 5 ngày làm việc ở Quản trị Epic"
          >
            {executiveMetrics.waitingGoliveWithinGrace} trong hạn
          </button>
          ·
          <button
            type="button"
            onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'WAITING_GOLIVE_OVERDUE' }), 'Danh sách Epic - Chờ golive: Quá hạn')}
            className="underline-offset-2 hover:underline cursor-pointer font-bold"
            title="Xem danh sách Epic Chờ golive đã quá hạn R4G Date + 5 ngày làm việc ở Quản trị Epic"
          >
            {executiveMetrics.waitingGoliveOverdue} quá hạn
          </button>
        </p>
      </div>

      <button
        type="button"
        onClick={() => openEpicModal(toEpicAlertsLink({ alert: 'JUSTIFY_GOLIVE' }), 'Danh sách Epic - Cần Giải trình Golive')}
        className="block text-left rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-xs transition-all hover:border-red-400 hover:shadow-sm cursor-pointer w-full"
        title="Xem danh sách Epic cần Giải trình Golive ở Quản trị Epic"
      >
        <p className="text-[10px] font-bold uppercase text-status-danger">Giải trình Golive</p>
        <p className="mt-1 text-xl font-extrabold text-status-danger">{executiveMetrics.justifyGolive}</p>
        <p className="text-[10px] text-red-600 font-medium">Quá hạn R4G Date + 5 ngày</p>
      </button>
    </div>
    </div>
  );

  const renderMatrixCard = (allowedDimensions: DimensionKey[]) => (
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
          {allowedDimensions.map((key) => (
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
                <TH sortDirection={matrixSortDirectionFor('name')} onClick={() => toggleMatrixSort('name')}>{DIMENSION_LABELS[dimensionKey]}</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('total')} onClick={() => toggleMatrixSort('total')}>Tổng số Epic</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('ttmEligible')} onClick={() => toggleMatrixSort('ttmEligible')} title="Mẫu số TTM-CNTT (QLDA) = Tổng số Epic − Sai lệch dữ liệu − Chưa có R4G Date">Epic tính TTM</TH>
                <TH className="w-56" sortDirection={matrixSortDirectionFor('qldaPct')} onClick={() => toggleMatrixSort('qldaPct')}>TTM-CNTT (QLDA)</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('qldaPass')} onClick={() => toggleMatrixSort('qldaPass')}>Pass TTM</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('qldaFail')} onClick={() => toggleMatrixSort('qldaFail')}>Fail TTM</TH>
                <TH className="w-40" sortDirection={matrixSortDirectionFor('qaPct')} onClick={() => toggleMatrixSort('qaPct')}>TTM-CNTT (QA)</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('ok')} onClick={() => toggleMatrixSort('ok')}>Đúng tiến độ</TH>
                <TH className="text-center" sortDirection={matrixSortDirectionFor('late')} onClick={() => toggleMatrixSort('late')}>Chậm tiến độ</TH>
              </TR>
            </THead>
            <TBody>
              {dimensionMatrix.map((item) => (
                <TR key={item.name}>
                  <TD className="font-bold text-fb-text-primary">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'total'),
                        `Danh sách Epic - ${item.name} (Tổng số Epic)`
                      )}
                      className="font-bold text-fb-text-primary hover:text-fb-blue hover:underline cursor-pointer text-left"
                      title={`Xem tất cả Epic của ${item.name}`}
                    >
                      {item.name}
                    </button>
                  </TD>
                  <TD className="text-center font-semibold">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'total'),
                        `Danh sách Epic - ${item.name} (Tổng số Epic)`
                      )}
                      className="text-fb-blue hover:underline cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:bg-blue-50 transition-colors"
                      title={`Xem tất cả Epic của ${item.name}`}
                    >
                      {item.total}
                    </button>
                  </TD>
                  <TD className="text-center font-semibold">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'ttmEligible'),
                        `Danh sách Epic - ${item.name} (Epic tính TTM)`
                      )}
                      className="text-fb-blue hover:underline cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:bg-blue-50 transition-colors"
                      title={`Xem danh sách Epic tính vào mẫu số TTM-CNTT (QLDA) của ${item.name}`}
                    >
                      {item.qlda.eligible}
                    </button>
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'pass'),
                        `Danh sách Epic Pass TTM - ${item.name}`
                      )}
                      className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity cursor-pointer group"
                      title={`Xem các Epic Pass TTM của ${item.name} (Tỷ lệ: ${item.qlda.pct}%)`}
                    >
                      <div className="h-2.5 flex-1 rounded-full bg-fb-control overflow-hidden flex">
                        <div style={{ width: `${item.qlda.pct}%` }} className="bg-status-success h-full" title={`Pass: ${item.qlda.pct}%`} />
                        <div style={{ width: `${100 - item.qlda.pct}%` }} className="bg-status-danger h-full" title={`Rủi ro: ${100 - item.qlda.pct}%`} />
                      </div>
                      <span className="w-9 text-right text-xs font-bold text-fb-text-primary group-hover:underline">{item.qlda.pct}%</span>
                    </button>
                  </TD>
                  <TD className="text-center font-semibold text-status-success">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'pass'),
                        `Danh sách Epic Pass TTM - ${item.name}`
                      )}
                      className="text-status-success hover:underline cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:bg-emerald-50 transition-colors"
                      title={`Xem các Epic Pass TTM của ${item.name}`}
                    >
                      {item.qlda.pass}
                    </button>
                  </TD>
                  <TD className="text-center font-semibold text-status-danger">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'fail'),
                        `Danh sách Epic Fail TTM - ${item.name}`
                      )}
                      className="text-status-danger hover:underline cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:bg-red-50 transition-colors"
                      title={`Xem các Epic Fail TTM của ${item.name}`}
                    >
                      {item.qlda.fail}
                    </button>
                    {/* Fail = Trễ R4G (trong mẫu số TTM-CNTT) + Thiếu R4G (ngoài mẫu số) — nên Pass + Fail có thể lớn hơn "Epic tính TTM". */}
                    {item.qlda.fail > 0 && (
                      <p className="text-[10px] font-medium text-fb-text-secondary whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEpicModal(toEpicAlertsLinkForMatrixItem(item, 'failLateR4g'), `Danh sách Epic Fail TTM: Trễ R4G - ${item.name}`)}
                          className="underline-offset-2 hover:underline cursor-pointer"
                          title="Có R4G Date nhưng muộn hơn Target — nằm trong mẫu số TTM-CNTT (QLDA)"
                        >
                          {item.failLateR4g} Trễ R4G
                        </button>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => openEpicModal(toEpicAlertsLinkForMatrixItem(item, 'failMissingR4g'), `Danh sách Epic Fail TTM: Thiếu R4G - ${item.name}`)}
                          className="underline-offset-2 hover:underline cursor-pointer"
                          title="Chưa có R4G Date và đã quá Target — không nằm trong mẫu số TTM-CNTT (QLDA)"
                        >
                          {item.failMissingR4g} Thiếu R4G
                        </button>
                      </p>
                    )}
                  </TD>
                  <TD>
                    {item.qa.total > 0 ? (
                      <button
                        type="button"
                        onClick={() => openEpicModal(
                          toEpicAlertsLinkForMatrixItem(item, 'qa'),
                          `Danh sách Epic QA (MVP Done / Released) - ${item.name}`
                        )}
                        className="flex flex-col gap-0.5 w-full text-left hover:opacity-80 transition-opacity cursor-pointer group"
                        title={`Xem các Epic MVP Done / Released của ${item.name}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-fb-control overflow-hidden flex">
                            <div style={{ width: `${item.qa.pct}%` }} className="bg-purple-600 h-full" title={`Pass QA: ${item.qa.pct}%`} />
                            <div style={{ width: `${100 - item.qa.pct}%` }} className="bg-status-danger h-full" title={`Rủi ro QA: ${100 - item.qa.pct}%`} />
                          </div>
                          <span className="w-9 text-right text-xs font-bold text-purple-700 group-hover:underline">{item.qa.pct}%</span>
                        </div>
                        <p className="text-[10px] text-fb-text-secondary group-hover:underline">{item.qa.pass}/{item.qa.eligible} Epic MVP Done/Released</p>
                      </button>
                    ) : (
                      <span className="text-xs text-fb-text-placeholder">— Chưa có Epic MVP Done/Released</span>
                    )}
                  </TD>
                  <TD className="text-center font-semibold text-fb-text-primary">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'ok'),
                        `Danh sách Epic đúng tiến độ - ${item.name}`
                      )}
                      className="text-fb-text-primary hover:underline cursor-pointer font-semibold inline-block px-1.5 py-0.5 rounded-sm hover:bg-slate-100 transition-colors"
                      title={`Xem các Epic đúng tiến độ của ${item.name}`}
                    >
                      {item.ok}
                    </button>
                  </TD>
                  <TD className="text-center font-semibold text-status-warning">
                    <button
                      type="button"
                      onClick={() => openEpicModal(
                        toEpicAlertsLinkForMatrixItem(item, 'late'),
                        `Danh sách Epic chậm tiến độ - ${item.name}`
                      )}
                      className="text-status-warning hover:underline cursor-pointer font-bold inline-block px-1.5 py-0.5 rounded-sm hover:bg-amber-50 transition-colors"
                      title={`Xem các Epic chậm tiến độ của ${item.name}`}
                    >
                      {item.late}
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </CardBody>
    </Card>
  );

  const renderPipelineCard = () => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ChartBar className="size-4 text-fb-blue" weight="bold" /> Phễu Tiến độ Epic theo Giai đoạn (Phase Pipeline)
        </CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
          {pipelinePhases.map((phase) => {
            const statuses = phaseStatuses[phase.key] || [];
            return (
              <button
                key={phase.key}
                type="button"
                onClick={() => openEpicModal(
                  toEpicAlertsLink(statuses.length > 0 ? { status: statuses } : undefined),
                  `Danh sách Epic - Giai đoạn: ${phase.label}`
                )}
                className={`block text-left rounded-xl border p-3 shadow-xs transition-all hover:shadow-sm cursor-pointer w-full ${
                  phase.alertCount > 0
                    ? 'border-red-200 bg-red-50/30 hover:border-red-400'
                    : 'border-fb-border bg-fb-surface hover:border-fb-blue'
                }`}
                title={`Xem danh sách Epic giai đoạn ${phase.label}`}
              >
                <p className="text-[10px] font-bold uppercase text-fb-text-secondary truncate">{phase.label}</p>
                <p className="mt-1 text-xl font-extrabold text-fb-text-primary">{phase.count}</p>
                <p className="text-[10px] font-medium mt-0.5">
                  {phase.alertCount > 0 ? (
                    <span className="text-status-danger flex items-center gap-1 font-semibold">
                      <WarningCircle className="size-3" weight="bold" /> {phase.alertCount} cảnh báo rủi ro
                    </span>
                  ) : (
                    <span className="text-status-success font-medium">Đúng tiến độ</span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );

  const renderEpicTypeSection = () => (
    <div className="border-t border-slate-300 pt-3 mb-4">
      <button
        type="button"
        onClick={() => toggleSection('epicType')}
        className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors cursor-pointer select-none"
      >
        {openSections.epicType ? (
          <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
        ) : (
          <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
        )}
        <span>Theo Phân loại Epic</span>
      </button>
      {openSections.epicType && epicTypeDonuts && (
        <div className="mt-3 pl-3 border-l-2 border-[#1463f7] pt-1">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DonutChartCard
              title="% Tổng số Epic"
              data={epicTypeDonuts.totalData}
              onItemClick={(item) => openEpicModal(
                toEpicAlertsLink({ type: item.name === 'Khác..' ? undefined : item.name }),
                `Danh sách Epic - Phân loại: ${item.name}`
              )}
            />
            <DonutChartCard
              title="% Epic Pass TTM-CNTT (QLDA)"
              data={epicTypeDonuts.passData}
              emptyMessage="Không có Epic đạt TTM"
              onItemClick={(item) => openEpicModal(
                toEpicAlertsLink({ type: item.name === 'Khác..' ? undefined : item.name, alert: 'ACHIEVED_CNTT' }),
                `Danh sách Epic Pass TTM - Phân loại: ${item.name}`
              )}
            />
            <DonutChartCard
              title="% Epic Fail TTM (pm)"
              data={epicTypeDonuts.failData}
              emptyMessage="Không có Epic Fail TTM"
              onItemClick={(item) => openEpicModal(
                toEpicAlertsLink({ type: item.name === 'Khác..' ? undefined : item.name, alert: 'FAIL' }),
                `Danh sách Epic Fail TTM - Phân loại: ${item.name}`
              )}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="ttm-app flex flex-col gap-5 p-4 md:p-6 text-app bg-fb-bg min-h-screen">
      {/* Header Banner & Switcher Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-fb-border bg-fb-surface p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ChartPie className="size-6 text-fb-blue" weight="bold" aria-hidden="true" />
            <h1 className="text-lg font-bold text-fb-text-primary">
              TIME TO MARKET DASHBOARD
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-fb-text-secondary">
            {viewMode === 'EXECUTIVE'
              ? 'Dashboard quản lý cho CBQL/Lead'
              : 'Dashboard quản lý cho PM/SM'}
          </p>
        </div>

        {/* Control Buttons & User Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Header Widgets: company-wide TTM-CNTT (QLDA) & TTM-CNTT (QA) — every Epic in the app (cached,
              same value for every user), positioned to the left of toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEpicModal(buildEpicAlertsDeepLink({}), 'Quản trị Epic - TTM-CNTT (QLDA)')}
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-fb-blue hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số TTM-CNTT (QLDA) tính trên toàn bộ Epic trong ứng dụng (giống nhau với mọi người dùng)', data?.ttmIndexGlobal?.ttm)}
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
              onClick={() => openEpicModal(buildEpicAlertsDeepLink({ status: ['MVP Done', 'Released'] }), 'Quản trị Epic - TTM-CNTT (QA)')}
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-purple-400 hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số TTM-CNTT (QA) tính trên toàn bộ Epic trong ứng dụng, theo cách tính của QA (giống nhau với mọi người dùng)', data?.ttmIndexGlobal?.qa)}
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
              onClick={() => openEpicModal(buildEpicAlertsDeepLink({ alert: 'FAIL_E2E' }), 'Quản trị Epic - Fail TTM-E2E')}
              className="flex h-9 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 shrink-0 text-left transition-all hover:border-emerald-400 hover:bg-fb-surface shadow-2xs cursor-pointer group"
              title={formatTtmIndexTooltip('Chỉ số Hoàn thành TTM-E2E tính trên toàn bộ Epic trong ứng dụng (giống nhau với mọi người dùng)', data?.ttmIndexGlobal?.e2e)}
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

          {data?.isUserPreview && (
            <div className="flex h-9 items-center gap-2 rounded-lg bg-amber-50 px-3 border border-amber-300 text-amber-900 text-xs shrink-0">
              <Eye className="size-4 shrink-0 text-amber-600" weight="bold" />
              <span className="truncate">
                Đang xem góc nhìn của User: <strong>{data.viewAsUser?.fullName}</strong> ({data.viewAsUser?.email})
              </span>
              <button
                type="button"
                onClick={() => {
                  setPreviewUserId(null);
                  setViewMode('EXECUTIVE');
                }}
                className="h-7 shrink-0 rounded-md bg-white border border-amber-300 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-xs"
              >
                Trở về Lead View
              </button>
            </div>
          )}

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

      {/* Common Filter Toolbar matching Quản trị Epic */}
      <section className="ttm-toolbar" aria-label="Bộ lọc Dashboard">
        <div className="flex items-center gap-1.5 text-xs font-bold text-black shrink-0 mr-1 select-none">
          <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
          <span>Filters:</span>
        </div>
        {isAdminOrSupervisor && (
          <select
            className={`ttm-select${filterDomain ? ' has-filter' : ''}`}
            aria-label="Domain"
            value={filterDomain}
            onChange={(event) => handleDomainFilterChange(event.target.value)}
          >
            <option value="">Chọn Domain…</option>
            {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        )}
        <ToolbarMultiSelect
          ariaLabel="Dự án"
          searchable
          allLabel="Tất cả dự án của tôi"
          options={projectOptions}
          value={filterProjects}
          onChange={(values) => { setFilterDomain(''); setFilterProjects(values); }}
        />
        {viewMode === 'EXECUTIVE' && (
          <ToolbarMultiSelect
            ariaLabel="PM/SM"
            searchable
            allLabel="Tất cả PM/SM"
            options={pmSmOptions}
            value={filterPmSms}
            onChange={setFilterPmSms}
          />
        )}
        <ToolbarMultiSelect
          ariaLabel="Đơn vị yêu cầu"
          searchable
          allLabel="Tất cả đơn vị yêu cầu"
          options={requestingUnitOptions}
          value={filterRequestingUnits}
          onChange={setFilterRequestingUnits}
        />

        {data?.lastAggregatedAt && (
          <div className="ttm-report-date ml-auto text-xs text-fb-text-secondary">
            Dữ liệu cập nhật: <b>{formatDateTime(data.lastAggregatedAt)}</b>
          </div>
        )}
      </section>

      {/* Advanced Filters — "Phạm vi dữ liệu cho TTM" override, live/uncached (2026-09-28). Collapsed
          by default: only the icon + title show until expanded, same pattern as Quản trị Epic's own
          "Bộ lọc nâng cao". */}
      <div className="border-t border-slate-300 pt-3 mb-4" aria-label="Advanced Filters">
        <button
          type="button"
          onClick={() => setAdvancedFiltersOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors"
        >
          {advancedFiltersOpen ? <CaretDown className="size-4 text-[#1463f7]" weight="bold" /> : <CaretRight className="size-4 text-[#1463f7]" weight="bold" />}
          <span>Advanced Filters</span>
        </button>
        {advancedFiltersOpen && (
          <div className="mt-3 grid grid-cols-1 gap-4 border-l-2 border-[#1463f7] pl-3 pt-1 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-black">Filter R4G for TTM (CNTT)</label>
              <p className="mb-1.5 text-[10px] text-gray-600">
                Epic có R4G Date: lọc A ≤ R4G Date ≤ B. Chưa có R4G Date: lọc theo TTM-CNTT (QLDA)
                baseline. Để trống A/B = không giới hạn phía đó. Áp dụng cho TTM-CNTT (QLDA) và mọi
                tính toán Pass/Fail liên quan tới TTM-CNTT (QLDA) trên trang này.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={filterCnttFrom}
                  onChange={(event) => setFilterCnttFrom(event.target.value)}
                  className={`rounded-none border ${filterCnttFrom ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-2 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
                <button type="button" disabled={!filterCnttFrom} onClick={() => setFilterCnttFrom('')} className="rounded-none border border-slate-400 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#1463f7] hover:text-[#1463f7] disabled:cursor-not-allowed disabled:opacity-40">Để trống</button>
                <span className="text-[11px] text-gray-500">đến</span>
                <input
                  type="date"
                  value={filterCnttTo}
                  onChange={(event) => setFilterCnttTo(event.target.value)}
                  className={`rounded-none border ${filterCnttTo ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-2 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
                <button type="button" disabled={!filterCnttTo} onClick={() => setFilterCnttTo('')} className="rounded-none border border-slate-400 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#1463f7] hover:text-[#1463f7] disabled:cursor-not-allowed disabled:opacity-40">Để trống</button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-black">Filter R4G for TTM (QA)</label>
              <p className="mb-1.5 text-[10px] text-gray-600">
                Lọc theo C ≤ R4G Date ≤ D — Epic chưa có R4G Date bị loại khỏi phạm vi QA khi
                có thiết lập. Để trống C/D = không giới hạn phía đó. Áp dụng cho TTM-CNTT (QA).
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={filterQaFrom}
                  onChange={(event) => setFilterQaFrom(event.target.value)}
                  className={`rounded-none border ${filterQaFrom ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-2 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
                <button type="button" disabled={!filterQaFrom} onClick={() => setFilterQaFrom('')} className="rounded-none border border-slate-400 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#1463f7] hover:text-[#1463f7] disabled:cursor-not-allowed disabled:opacity-40">Để trống</button>
                <span className="text-[11px] text-gray-500">đến</span>
                <input
                  type="date"
                  value={filterQaTo}
                  onChange={(event) => setFilterQaTo(event.target.value)}
                  className={`rounded-none border ${filterQaTo ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-2 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
                <button type="button" disabled={!filterQaTo} onClick={() => setFilterQaTo('')} className="rounded-none border border-slate-400 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#1463f7] hover:text-[#1463f7] disabled:cursor-not-allowed disabled:opacity-40">Để trống</button>
              </div>
            </div>
          </div>
        )}
      </div>

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
              {renderKpiStrip()}

              {renderMatrixCard(['domain', 'epicType', 'pmsm', 'project'])}

              {/* Section 1: Theo Đơn vị yêu cầu */}
              <div className="border-t border-slate-300 pt-3 mb-4">
                <button
                  type="button"
                  onClick={() => toggleSection('requestingUnit')}
                  className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors cursor-pointer select-none"
                >
                  {openSections.requestingUnit ? (
                    <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
                  ) : (
                    <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
                  )}
                  <span>Theo Đơn vị yêu cầu</span>
                </button>
                {openSections.requestingUnit && requestingUnitDonuts && (
                  <div className="mt-3 pl-3 border-l-2 border-[#1463f7] pt-1">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <DonutChartCard
                        title="% Tổng số Epic"
                        data={requestingUnitDonuts.totalData}
                        onItemClick={(item) => openEpicModal(
                          toEpicAlertsLink({ requestingUnit: item.name === 'Khác..' ? undefined : item.name }),
                          `Danh sách Epic - Đơn vị: ${item.name}`
                        )}
                      />
                      <DonutChartCard
                        title="% Epic Pass TTM-CNTT (QLDA)"
                        data={requestingUnitDonuts.passData}
                        emptyMessage="Không có Epic đạt TTM"
                        onItemClick={(item) => openEpicModal(
                          toEpicAlertsLink({ requestingUnit: item.name === 'Khác..' ? undefined : item.name, alert: 'ACHIEVED_CNTT' }),
                          `Danh sách Epic Pass TTM - Đơn vị: ${item.name}`
                        )}
                      />
                      <DonutChartCard
                        title="% Epic Fail TTM (pm)"
                        data={requestingUnitDonuts.failData}
                        emptyMessage="Không có Epic Fail TTM"
                        onItemClick={(item) => openEpicModal(
                          toEpicAlertsLink({ requestingUnit: item.name === 'Khác..' ? undefined : item.name, alert: 'FAIL' }),
                          `Danh sách Epic Fail TTM - Đơn vị: ${item.name}`
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Theo Domain nghiệp vụ (chỉ hiển thị nếu > 1 domain) */}
              {showDomainSection && (
                <div className="border-t border-slate-300 pt-3 mb-4">
                  <button
                    type="button"
                    onClick={() => toggleSection('domain')}
                    className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors cursor-pointer select-none"
                  >
                    {openSections.domain ? (
                      <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
                    ) : (
                      <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
                    )}
                    <span>Theo Domain nghiệp vụ</span>
                  </button>
                  {openSections.domain && domainDonuts && (
                    <div className="mt-3 pl-3 border-l-2 border-[#1463f7] pt-1">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <DonutChartCard
                          title="% Tổng số Epic"
                          data={domainDonuts.totalData}
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ domain: item.name === 'Khác..' ? undefined : item.name }),
                            `Danh sách Epic - Domain: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Pass TTM-CNTT (QLDA)"
                          data={domainDonuts.passData}
                          emptyMessage="Không có Epic đạt TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ domain: item.name === 'Khác..' ? undefined : item.name, alert: 'ACHIEVED_CNTT' }),
                            `Danh sách Epic Pass TTM - Domain: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Fail TTM (pm)"
                          data={domainDonuts.failData}
                          emptyMessage="Không có Epic Fail TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ domain: item.name === 'Khác..' ? undefined : item.name, alert: 'FAIL' }),
                            `Danh sách Epic Fail TTM - Domain: ${item.name}`
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 3: Theo Phân loại Epic */}
              {renderEpicTypeSection()}

              {/* Section 4: Theo PM/SM (chỉ hiển thị nếu role !== USER) */}
              {showPmsmSection && (
                <div className="border-t border-slate-300 pt-3 mb-4">
                  <button
                    type="button"
                    onClick={() => toggleSection('pmsm')}
                    className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors cursor-pointer select-none"
                  >
                    {openSections.pmsm ? (
                      <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
                    ) : (
                      <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
                    )}
                    <span>Theo PM/SM</span>
                  </button>
                  {openSections.pmsm && pmsmDonuts && (
                    <div className="mt-3 pl-3 border-l-2 border-[#1463f7] pt-1">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <DonutChartCard
                          title="% Tổng số Epic"
                          data={pmsmDonuts.totalData}
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({
                              pmSm: item.name === 'Khác..' || item.name === 'Chưa gán PM/SM'
                                ? undefined
                                : item.name.split(',').map((s) => s.trim()).filter(Boolean),
                            }),
                            `Danh sách Epic - PM/SM: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Pass TTM-CNTT (QLDA)"
                          data={pmsmDonuts.passData}
                          emptyMessage="Không có Epic đạt TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({
                              pmSm: item.name === 'Khác..' || item.name === 'Chưa gán PM/SM'
                                ? undefined
                                : item.name.split(',').map((s) => s.trim()).filter(Boolean),
                              alert: 'ACHIEVED_CNTT',
                            }),
                            `Danh sách Epic Pass TTM - PM/SM: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Fail TTM (pm)"
                          data={pmsmDonuts.failData}
                          emptyMessage="Không có Epic Fail TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({
                              pmSm: item.name === 'Khác..' || item.name === 'Chưa gán PM/SM'
                                ? undefined
                                : item.name.split(',').map((s) => s.trim()).filter(Boolean),
                              alert: 'FAIL',
                            }),
                            `Danh sách Epic Fail TTM - PM/SM: ${item.name}`
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 5: Theo Dự án (chỉ hiển thị nếu không phải USER có 1 dự án) */}
              {showProjectSection && (
                <div className="border-t border-slate-300 pt-3 mb-4">
                  <button
                    type="button"
                    onClick={() => toggleSection('project')}
                    className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors cursor-pointer select-none"
                  >
                    {openSections.project ? (
                      <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
                    ) : (
                      <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
                    )}
                    <span>Theo Dự án</span>
                  </button>
                  {openSections.project && projectDonuts && (
                    <div className="mt-3 pl-3 border-l-2 border-[#1463f7] pt-1">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <DonutChartCard
                          title="% Tổng số Epic"
                          data={projectDonuts.totalData}
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ projects: item.name === 'Khác..' ? undefined : [item.name] }),
                            `Danh sách Epic - Dự án: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Pass TTM-CNTT (QLDA)"
                          data={projectDonuts.passData}
                          emptyMessage="Không có Epic đạt TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ projects: item.name === 'Khác..' ? undefined : [item.name], alert: 'ACHIEVED_CNTT' }),
                            `Danh sách Epic Pass TTM - Dự án: ${item.name}`
                          )}
                        />
                        <DonutChartCard
                          title="% Epic Fail TTM (pm)"
                          data={projectDonuts.failData}
                          emptyMessage="Không có Epic Fail TTM"
                          onItemClick={(item) => openEpicModal(
                            toEpicAlertsLink({ projects: item.name === 'Khác..' ? undefined : [item.name], alert: 'FAIL' }),
                            `Danh sách Epic Fail TTM - Dự án: ${item.name}`
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VERSION 2: OPERATIONAL WORKBENCH & PIPELINE ANALYTICS VIEW                 */}
          {/* ========================================================================= */}
          {viewMode === 'OPERATIONAL' && (
            <div className="flex flex-col gap-5">
              {/* All widgets from Lead view, scoped to user permission and toolbar filters */}
              {renderKpiStrip()}

              {/* Phễu Tiến độ Epic theo Giai đoạn (Phase Pipeline) with Lead-style 3-tier widgets */}
              {renderPipelineCard()}

              {/* Ma trận Phân bổ Tiến độ Epic Đa chiều with only 2 tabs: epicType and project */}
              {renderMatrixCard(['epicType', 'project'])}

              {/* Section biểu đồ Theo Phân loại Epic */}
              {renderEpicTypeSection()}

              {/* Tabbed Epic List Card with unified Header & Switcher */}
              <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-sm">
                      {operationalTab === 'WAITING_GOLIVE' && '1. Danh sách Epic Chờ Golive (MVP Done)'}
                      {operationalTab === 'PENDING' && '2. Phân tích Epic đang ở Trạng thái Pending'}
                      {operationalTab === 'ANOMALY' && '3. Giám sát 6 Rule Sai lệch Dữ liệu (R1 - R6)'}
                    </CardTitle>
                    <p className="text-xs text-fb-text-secondary mt-0.5">
                      {operationalTab === 'WAITING_GOLIVE' && 'Các Epic đã xong R4G Date nhưng chưa có Due Date, đang trong hạn bổ sung để chuyển Released'}
                      {operationalTab === 'PENDING' && 'Theo dõi các Epic bị Pending/tạm dừng triển khai cần tháo gỡ vướng mắc'}
                      {operationalTab === 'ANOMALY' && 'Kiểm soát tính toàn vẹn và hợp lệ của dữ liệu ngày tháng theo quy chuẩn R1-R6'}
                    </p>
                  </div>

                  {/* Switch chuyển tab giống như bảng Ma trận Phân bổ Tiến độ Epic Đa chiều */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-fb-border bg-fb-surface-muted p-1">
                    <button
                      type="button"
                      onClick={() => setOperationalTab('WAITING_GOLIVE')}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        operationalTab === 'WAITING_GOLIVE'
                          ? 'bg-fb-blue text-white shadow-xs'
                          : 'text-fb-text-secondary hover:text-fb-text-primary'
                      }`}
                    >
                      1. Chờ golive ({waitingGoliveEpics.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOperationalTab('PENDING')}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        operationalTab === 'PENDING'
                          ? 'bg-fb-blue text-white shadow-xs'
                          : 'text-fb-text-secondary hover:text-fb-text-primary'
                      }`}
                    >
                      2. Phân tích Pending ({pendingEpics.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOperationalTab('ANOMALY')}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                        operationalTab === 'ANOMALY'
                          ? 'bg-fb-blue text-white shadow-xs'
                          : 'text-fb-text-secondary hover:text-fb-text-primary'
                      }`}
                    >
                      3. Giám sát Dữ liệu bất thường R1-R6 ({anomalyRows.length})
                    </button>
                  </div>
                </CardHeader>
                <CardBody className="p-0">
                  {/* Tab 1: Waiting Golive */}
                  {operationalTab === 'WAITING_GOLIVE' && (
                    waitingGoliveEpics.length === 0 ? (
                      <EmptyState title="Không có Epic nào đang Chờ golive" description="Hiện tại không có Epic nào trong trạng thái Chờ golive." />
                    ) : (
                      <TableContainer>
                        <Table>
                          <THead>
                            <TR>
                              <TH>Epic Key</TH>
                              <TH>Tên Epic</TH>
                              <TH>Dự án</TH>
                              <TH>PM / SM</TH>
                              <TH className="text-center">Trạng thái hiện tại</TH>
                              <TH>Ngày ghi nhận R4G</TH>
                              <TH>Hạn bổ sung Due Date</TH>
                              <TH className="text-center">Tình trạng</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {waitingGoliveEpics.map((row) => (
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
                                <TD className="max-w-xs truncate font-medium" title={row.epicName}>{row.epicName}</TD>
                                <TD>{row.projectKey}</TD>
                                <TD>{row.ownerName || '—'}</TD>
                                <TD className="text-center">
                                  <Badge variant="neutral">{row.currentStatus}</Badge>
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
                                <TD>
                                  {row.releaseGraceDeadline ? (
                                    <span className="text-[11px] text-fb-text-secondary">
                                      {formatDate(row.releaseGraceDeadline)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </TD>
                                <TD className="text-center">
                                  <Badge variant="warning">Chờ golive</Badge>
                                </TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </TableContainer>
                    )
                  )}

                  {/* Tab 2: Pending Analysis */}
                  {operationalTab === 'PENDING' && (
                    pendingEpics.length === 0 ? (
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
                                  {row.ttmCnttInScope ? (
                                    <Badge variant={ALERT_BADGE_VARIANT[row.alertLevel]}>{ALERT_BADGE_LABEL[row.alertLevel]}</Badge>
                                  ) : (
                                    <Badge variant="neutral">Ngoài phạm vi TTM-CNTT (QLDA)</Badge>
                                  )}
                                </TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </TableContainer>
                    )
                  )}

                  {/* Tab 3: Data Quality Matrix (Anomaly Rules R1-R6) */}
                  {operationalTab === 'ANOMALY' && (
                    anomalyRows.length === 0 ? (
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
                                  <DataAnomalyList violations={row.dataAnomalyViolations} />
                                </TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </TableContainer>
                    )
                  )}
                </CardBody>
              </Card>
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

      {/* Epic Alerts Drilldown Iframe Modal */}
      <EpicAlertsIframeModal
        isOpen={Boolean(epicModalUrl)}
        onClose={closeEpicModal}
        title={epicModalTitle}
        url={epicModalUrl}
      />
    </div>
  );
}
