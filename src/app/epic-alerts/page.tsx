'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-alerts.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StatusColorLegend } from '@/components/ui/StatusColorLegend';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicStatWidgets } from '@/components/epic-alerts/EpicStatWidgets';
import { DataAnomalyBadge, DataAnomalyList } from '@/components/epic-alerts/DataAnomalyDetail';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell } from '@/lib/epic-alert-types';
import type { EpicAlertHistoryEntry } from '@/lib/epic-alert-history-service';
import type { ProjectComponent } from '@/lib/master-data-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { ArrowBendUpRight, ArrowSquareOut, CaretDown, CaretLineRight, CaretRight, Check, Checks, ClockCountdown, HourglassMedium, ListChecks, Prohibit, Warning, WarningOctagon, XCircle } from '@phosphor-icons/react';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import { epicWorkflowStatusIndex, normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { trackDataUsage } from '@/lib/usage-tracking';

/**
 * TTM-CNTT "stripe thực tế" (bottom, actual strip) on-track color rule — shared core logic with
 * "Quản trị Epic (đầy đủ)" and Epic in PO's own copy of this same function (kept as small
 * per-page duplicates, matching this codebase's existing convention for tiny client-side render
 * helpers — see isPastBaseline in epic-alerts-15/page.tsx and epic-in-po/page.tsx).
 * Green ("on track") when the actual stripe's end date (X) doesn't fall after the baseline
 * stripe's own end date (targetR4gDate) — a plain calendar-date compare, deliberately NOT the
 * working-day elapsed/target counts used everywhere else in this app: those stayed flat over a
 * weekend even once the visible calendar baseline date had passed (confirmed on a real Epic —
 * baseline ending Friday 28/8, still green on Saturday 29/8 since neither weekend day advances
 * the working-day count), which read as wrong given the two dates are shown side by side on the
 * stripe itself. AND either the Epic is still ongoing (X is today, not R4G Date — checked by
 * comparing actualToDate to r4gDate rather than adding a separate flag) or it finished on time
 * with the Epic's current status already at/past R4GOLIVE. An Epic whose stripe ends at R4G Date
 * but whose status hasn't caught up to R4GOLIVE yet is treated as NOT on track (data likely
 * stale/inconsistent), same as the end date falling after the baseline.
 */
function isTtmCnttStripeOnTrack(currentStatus: string, r4gDate: string | null, actualToDate: string | null, baselineToDate: string | null): boolean {
  const withinBaseline = Boolean(actualToDate && baselineToDate && actualToDate <= baselineToDate);
  const usesR4gDate = Boolean(r4gDate && actualToDate === r4gDate);
  const statusCaughtUp = epicWorkflowStatusIndex(currentStatus) >= epicWorkflowStatusIndex('R4GOLIVE');
  return withinBaseline && (!usesR4gDate || statusCaughtUp);
}

/** Calendar days between two ISO "YYYY-MM-DD" dates (0 if either is missing/unparseable). */
function calendarDaysBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86400000);
}

/** TTM-CNTT actual-stripe width ratio, in CALENDAR days — matches isTtmCnttStripeOnTrack's own
 * calendar-date basis (see its doc comment) so a stripe rendered red/over is never visually
 * shorter than the baseline it's failing against, which is what a working-day ratio produced here
 * (e.g. 14/15 working days ≈ 93% width, even though the calendar end date had already passed the
 * baseline's calendar end date over a weekend). */
function ttmCnttWidthRatio(fromDate: string | null, actualToDate: string | null, baselineToDate: string | null): number {
  const baselineDays = calendarDaysBetween(fromDate, baselineToDate);
  const actualDays = calendarDaysBetween(fromDate, actualToDate);
  return baselineDays > 0 ? actualDays / baselineDays : 0;
}

const PAGE_SIZE = 20;

const EMPTY_EPIC_ALERT_ROWS: EpicAlertRow[] = [];
const EMPTY_LAYER_DATES: string[] = [];
// "Chọn lớp dữ liệu" only shows the newest 5 as quick-pick chips — everything older lives in a
// dropdown right after them, so any recorded layer stays reachable without the button row growing
// unbounded (availableLayerDates now returns up to 365 dates, not just 7).
const RECENT_LAYER_CHIP_COUNT = 5;

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
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

type AlertFilterValue = AlertLevel | 'FAIL_E2E' | 'ACHIEVED_CNTT' | 'ACHIEVED_E2E' | 'STATUS_MISMATCH' | 'DATA_ANOMALY' | 'WAITING_GOLIVE' | 'RELEASE_EARLY' | 'JUSTIFY_GOLIVE' | '';

const ALERT_FILTER_OPTIONS: { label: string; value: AlertFilterValue }[] = [
  { label: 'Tất cả nhận xét', value: '' },
  { label: 'Đạt TTM-CNTT', value: 'ACHIEVED_CNTT' },
  { label: 'Đạt TTM-E2E', value: 'ACHIEVED_E2E' },
  { label: 'Cảnh báo sớm', value: 'EARLY' },
  { label: 'Cảnh báo muộn', value: 'LATE' },
  { label: 'Fail TTM-CNTT', value: 'FAIL' },
  { label: 'Fail TTM-E2E', value: 'FAIL_E2E' },
  { label: 'Sai Status', value: 'STATUS_MISMATCH' },
  { label: 'Sai lệch dữ liệu', value: 'DATA_ANOMALY' },
  { label: 'Chờ golive', value: 'WAITING_GOLIVE' },
  { label: 'Cảnh báo sớm Release', value: 'RELEASE_EARLY' },
  { label: 'Giải trình Golive', value: 'JUSTIFY_GOLIVE' },
];

/**
 * "Lọc Nhận xét" (formerly "Cảnh báo") — matches the same "Nhận xét" badges rendered in the table
 * (see the Nhận xét TD below): FAIL_E2E, ACHIEVED_CNTT, ACHIEVED_E2E, STATUS_MISMATCH,
 * DATA_ANOMALY, WAITING_GOLIVE, RELEASE_EARLY and JUSTIFY_GOLIVE are sentinel values layered on top
 * of the raw AlertLevel values (EARLY/LATE/FAIL) already used elsewhere (sorting, stat widgets). A
 * "Sai Status" row never also matches ACHIEVED_CNTT — see resolveTtmCnttStatusMismatch in
 * epic-alert-service.ts, which only ever flags status mismatch when the underlying axis is
 * objectively on schedule (alertLevel NONE). "Đạt TTM-E2E" (2026-09-24 rule) requires status
 * Released, not just an on-schedule R4G Date — see resolveTtmE2eRelease's own doc comment.
 */
function matchesAlertFilter(row: EpicAlertRow, alertFilter: AlertFilterValue): boolean {
  switch (alertFilter) {
    case '': return true;
    case 'FAIL_E2E': return row.ttmE2eAlertLevel === 'FAIL';
    case 'ACHIEVED_CNTT': return row.alertLevel === 'NONE' && Boolean(row.r4gDate) && !row.ttmCnttStatusMismatch && row.ttmActualToDate === row.r4gDate;
    case 'ACHIEVED_E2E': return row.ttmE2eAlertLevel === 'NONE' && normalizeEpicWorkflowStatus(row.currentStatus) === 'RELEASED' && Boolean(row.r4gDate) && row.ttmE2eActualToDate === row.r4gDate;
    case 'STATUS_MISMATCH': return row.ttmCnttStatusMismatch;
    case 'DATA_ANOMALY': return row.hasDataAnomaly;
    case 'WAITING_GOLIVE': return row.releaseAxisState === 'WAITING_GOLIVE';
    case 'RELEASE_EARLY': return row.releaseAxisState === 'EARLY_WARNING';
    case 'JUSTIFY_GOLIVE': return row.releaseAxisState === 'JUSTIFY_GOLIVE';
    default: return row.alertLevel === alertFilter;
  }
}

const ACCESS_ROLE_LABEL: Record<EpicAlertAccessRole, string> = {
  CBQL_PHONG: 'CBQL Phòng',
  LEAD: 'Lead',
  PM_SM: 'PM-SM',
};

function stageHighlightClass(cell: StageCell): string {
  return cell.pillVariant === 'lateAlert' ? 'hl-overdue' : '';
}

function StagePill({ cell, doneDisplay = 'icon' }: { cell: StageCell; doneDisplay?: 'icon' | 'date' }) {
  if (cell.pillVariant === 'done') {
    if (doneDisplay === 'date' && cell.dateLabel) {
      return (
        <TD className={stageHighlightClass(cell)} title="Ngày Ready4Golive thực tế">
          <span className="ttm-stage-pill done">{formatDate(cell.dateLabel)}</span>
        </TD>
      );
    }
    return (
      <TD className={stageHighlightClass(cell)} title={cell.dateLabel ? `Hoàn thành: ${formatDate(cell.dateLabel)}` : cell.planLabel}>
        <span className="ttm-stage-pass-label">Pass</span>
      </TD>
    );
  }
  if (cell.pillVariant === 'earlyAlert' || cell.pillVariant === 'lateAlert') {
    return (
      <TD className={stageHighlightClass(cell)} title="Status hiện tại của epic">
        <span className={`ttm-stage-pill ${cell.pillVariant === 'earlyAlert' ? 'early-alert' : 'late-alert'}`}>{cell.pillLabel}</span>
      </TD>
    );
  }
  return (
    <TD className={stageHighlightClass(cell)} title={cell.isCurrentStage ? 'Status hiện tại của epic' : undefined}>
      <div className="ttm-stage-plan">{cell.planLabel}</div>
    </TD>
  );
}

/** Truncates epic summary text for the Epic column's subtitle line — full text stays in the title tooltip. */
function truncateSummary(value: string, maxLength = 50): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="ttm-empty-warning">—</span>;
  return <span className="ttm-status-badge">{status}</span>;
}

function TtmCnttStrips({ row }: { row: EpicAlertRow }) {
  const target = row.ttmCnttTargetWorkingDays;
  const elapsed = row.ttmActualElapsedWorkingDays ?? 0;
  const fromDate = row.t1StartDate;
  const ratio = ttmCnttWidthRatio(fromDate, row.ttmActualToDate, row.targetR4gDate);
  // "Sai Status" (see resolveTtmCnttStatusMismatch in epic-alert-service.ts) forces the stripe to
  // stay red — with a "*" marker — even though its length is within budget, since the workflow
  // status hasn't actually caught up to R4GOLIVE yet.
  const isOver = row.ttmCnttStatusMismatch || !isTtmCnttStripeOnTrack(row.currentStatus, row.r4gDate, row.ttmActualToDate, row.targetR4gDate);
  const BASE_WIDTH = 56;
  const actualWidth = Math.max(6, Math.min(ratio, 2) * BASE_WIDTH);
  const mismatchNote = ' — * đã đạt tiến độ theo ngày ghi nhận nhưng status Epic chưa chuyển đúng quy định';

  return (
    <TD className="ttm-metric">
      <div className="ttm-strip-wrap" title={`${elapsed}/${target} ngày làm việc${row.ttmCnttStatusMismatch ? mismatchNote : ''}`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(fromDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(row.targetR4gDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.ttmActualFromDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">
            {formatDate(row.ttmActualToDate)}
            {row.ttmCnttStatusMismatch && (
              <span className="ttm-strip-status-mismatch-mark" title="Đã đạt tiến độ theo ngày ghi nhận nhưng status Epic chưa chuyển đúng quy định — vui lòng cập nhật status.">*</span>
            )}
          </span>
        </div>
      </div>
    </TD>
  );
}

/** TTM-E2E's two-stripe metric cell — same layout/rule as TtmCnttStrips above, but counted from
 * T0 (Idea Approved Date, else Start Date, else Jira creation date) to Due Date/today, against the
 * TTM-E2E baseline (see resolveTtmE2eRelease in epic-alert-service.ts). Mirrors the TTM-E2E column
 * on "Quản trị Epic (đầy đủ)". */
function TtmE2eStrips({ row }: { row: EpicAlertRow }) {
  const target = row.ttmE2eTargetWorkingDays;
  const elapsed = row.ttmE2eElapsedWorkingDays ?? 0;
  const ratio = target > 0 ? elapsed / target : 0;
  const isOver = row.ttmE2eAlertLevel === 'FAIL';
  const BASE_WIDTH = 56;
  const actualWidth = Math.max(6, Math.min(ratio, 2) * BASE_WIDTH);

  return (
    <TD className="ttm-metric ttm-col-border-right">
      <div className="ttm-strip-wrap" title={`${elapsed}/${target} ngày làm việc`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.ttmE2eBaselineSourceDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(row.ttmE2eBaselineDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.ttmE2eBaselineSourceDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">
            {formatDate(row.ttmE2eActualToDate)}
          </span>
        </div>
      </div>
    </TD>
  );
}

function Ready4GoliveCell({ row }: { row: EpicAlertRow }) {
  return (
    <TD className={row.r4gDate ? 'ttm-r4g-cell is-complete' : 'ttm-r4g-cell'}>
      {row.r4gDate && (
        <span className="ttm-r4g-actual inline-flex items-center gap-0.5 text-black font-bold">
          <Checks className="size-3 shrink-0 text-black" weight="bold" />
          <span>{formatDate(row.r4gDate)}</span>
        </span>
      )}
      <span className="ttm-r4g-target inline-flex items-center gap-0.5 text-slate-500 font-medium">
        <ArrowBendUpRight className="size-3 shrink-0 text-slate-500" weight="bold" />
        <span>Target TTM={formatDate(row.targetR4gDate)}</span>
      </span>
    </TD>
  );
}

const ALERT_HISTORY_TYPE_LABEL: Record<EpicAlertHistoryEntry['alertType'], string> = {
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
};

function AlertHistoryButton({ row, onOpen }: { row: EpicAlertRow; onOpen: (row: EpicAlertRow) => void }) {
  return (
    <button
      type="button"
      className={`ttm-alert-history-trigger${row.hasAlertHistory ? ' has-history' : ''}`}
      title={row.hasAlertHistory ? 'Xem lịch sử cảnh báo Epic' : 'Epic chưa có lịch sử cảnh báo'}
      onClick={() => { trackDataUsage(); onOpen(row); }}
    >
      <Warning weight="fill" size={16} />
    </button>
  );
}

function JiraLinkButton({ epicKey, viewIssueBaseUrl }: { epicKey: string; viewIssueBaseUrl: string }) {
  if (!viewIssueBaseUrl) return null;
  return (
    <a
      className="ttm-alert-history-trigger ttm-jira-link-trigger"
      href={`${viewIssueBaseUrl}${epicKey}`}
      onClick={(event) => event.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
      title="Mở Epic trên Jira"
    >
      <ArrowSquareOut weight="bold" size={16} />
    </a>
  );
}

function AlertHistoryPanel({ row, onClose }: { row: EpicAlertRow; onClose: () => void }) {
  const [entries, setEntries] = useState<EpicAlertHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/epic-alerts/${encodeURIComponent(row.epicKey)}/alert-history`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) { setError(body.error || 'Lỗi hệ thống khi tải lịch sử cảnh báo.'); return; }
        setEntries(body.history ?? []);
      })
      .catch(() => { if (!cancelled) setError('Không thể kết nối API.'); });
    return () => { cancelled = true; };
  }, [row.epicKey]);

  return (
    <Modal isOpen onClose={onClose} title={`Lịch sử cảnh báo — ${row.epicKey}`} maxWidth="sm">
      {row.dataAnomalyViolations.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4 className="ttm-alert-popup-section-title">Sai lệch dữ liệu ({row.dataAnomalyViolations.length})</h4>
          <DataAnomalyList violations={row.dataAnomalyViolations} />
        </div>
      )}
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}
      {!error && entries === null && <p className="ttm-page-subtitle">Đang tải…</p>}
      {!error && entries?.length === 0 && <p className="ttm-page-subtitle">Chưa có lịch sử cảnh báo cho Epic này.</p>}
      {!error && entries && entries.length > 0 && (
        <ul className="ttm-alert-history-list">
          {entries.map((entry, index) => (
            <li key={`${entry.alertDate}-${entry.alertType}-${index}`} className="ttm-alert-history-item">
              <span className={`ttm-badge ${entry.alertType === 'FAIL' ? 'fail' : 'late-warning'}`}>{ALERT_HISTORY_TYPE_LABEL[entry.alertType]}</span>
              <span className="ttm-alert-history-status">{entry.alertStatus}</span>
              <span className="ttm-alert-history-date">{formatDate(entry.alertDate)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function EpicAlertsPage() {
  const [data, setData] = useState<EpicAlertResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectFilters, setProjectFilters] = useState<string[]>([]);
  const [pmSmFilter, setPmSmFilter] = useState('');
  const [componentFilters, setComponentFilters] = useState<string[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilterValue>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [requestingUnitFilter, setRequestingUnitFilter] = useState('');
  const [dataIssueFilter, setDataIssueFilter] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // "Bộ lọc nâng cao" — collapsed by default; see epic-alerts-15/page.tsx for the shared pattern
  // this mirrors (reports/page.tsx's "Cấu hình nâng cao..." is the original source of this UI).
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [selectedLayerAnchor, setSelectedLayerAnchor] = useState('');
  const [createdDateFrom, setCreatedDateFrom] = useState('');
  const [startDateFromFilter, setStartDateFromFilter] = useState('');
  const [dueDateFromFilter, setDueDateFromFilter] = useState('');
  const [alertHistoryRow, setAlertHistoryRow] = useState<EpicAlertRow | null>(null);
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  const availableLayerDates = data?.availableLayerDates ?? EMPTY_LAYER_DATES;
  const recentLayerDates = useMemo(() => availableLayerDates.slice(0, RECENT_LAYER_CHIP_COUNT), [availableLayerDates]);
  const olderLayerDates = useMemo(() => availableLayerDates.slice(RECENT_LAYER_CHIP_COUNT), [availableLayerDates]);
  // Selecting the newest layer (or none yet) needs no restriction at all — the same query this
  // screen has always run. Only an OLDER anchor narrows the window (see EpicAlertFilters.layerDates
  // — "drill xuống các lớp cũ hơn" picks each Epic's latest row within that window).
  // Default selection = newest layer, without a setState-in-effect: selectedLayerAnchor starts
  // unset, and this just falls back to the newest available layer until the user clicks a chip.
  const effectiveLayerAnchor = selectedLayerAnchor || availableLayerDates[0] || '';
  const layerWindow = useMemo(() => {
    if (!effectiveLayerAnchor) return null;
    const anchorIndex = availableLayerDates.indexOf(effectiveLayerAnchor);
    return anchorIndex > 0 ? availableLayerDates.slice(anchorIndex) : null;
  }, [availableLayerDates, effectiveLayerAnchor]);
  const layerWindowKey = layerWindow ? layerWindow.join(',') : '';

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (layerWindow) {
        query.set('layerDates', layerWindow.join(','));
        query.set('asOfDate', effectiveLayerAnchor);
      }
      if (createdDateFrom) query.set('createdDateFrom', createdDateFrom);
      if (startDateFromFilter) query.set('startDateFrom', startDateFromFilter);
      if (dueDateFromFilter) query.set('dueDateFrom', dueDateFromFilter);
      const queryString = query.toString();
      const res = await fetch(`/api/epic-alerts${queryString ? `?${queryString}` : ''}`);
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Lỗi hệ thống khi tải dữ liệu.');
      } else {
        setData(result);
      }
    } catch {
      setError('Không thể kết nối API Epic Alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup. Also
    // re-runs whenever an advanced filter changes — those are applied server-side (see
    // EpicAlertFilters), unlike every other toolbar filter which stays client-side on `rows`.
    void Promise.resolve().then(fetchData);
  }, [layerWindowKey, createdDateFrom, startDateFromFilter, dueDateFromFilter]);

  useEffect(() => {
    fetch('/api/project-components').then((res) => (res.ok ? res.json() : [])).then(setProjectComponents).catch(() => undefined);
  }, []);

  const rows = data?.rows ?? EMPTY_EPIC_ALERT_ROWS;
  const projectOptions = useMemo(() => [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(), [rows]);
  // PM/SM options: ownerName is comma-joined when a project has several PM/SM users (see
  // getProjectMetaByProjectKeyMap) — split back out so each individual person is its own option,
  // and selecting one shows every Epic whose project lists them (single-choice, next to "Dự án").
  const pmSmOptions = useMemo(
    () => [...new Set(rows.flatMap((row) => row.ownerName.split(',').map((name) => name.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
  );
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort(), [rows]);
  const requestingUnitOptions = useMemo(
    () => [...new Set(rows.map((row) => row.requestingUnit).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
  );
  // Options = the catalog's components for whichever projects are selected — disabled entirely
  // (no options, filter cleared) until at least one project is picked.
  const componentOptions = useMemo(
    () => [...new Set(projectComponents.filter((component) => projectFilters.includes(component.projectKey)).map((component) => component.componentName))].sort(),
    [projectComponents, projectFilters],
  );
  const handleProjectFiltersChange = (values: string[]) => {
    setProjectFilters(values);
    if (values.length === 0) setComponentFilters([]);
    setPage(1);
  };

  // Admin/superadmin-tier viewers (accessRole LEAD/CBQL_PHONG) — see resolveAccessScope in
  // epic-alert-service.ts: SUPERADMIN/SUPERVISOR → CBQL_PHONG, ADMIN → LEAD, USER → PM_SM.
  const isAdminTierAccess = data ? data.accessRole !== 'PM_SM' : false;

  // Domain → Project Keys, derived from the rows already scoped to this viewer's own access —
  // Domain filter picks a Domain and auto-selects every Project Key under it into the Project
  // filter. Admin/superadmin-tier only: a PM/SM's own project scope is already small.
  const domainProjectKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.domainName || !row.projectKey) continue;
      if (!map.has(row.domainName)) map.set(row.domainName, new Set());
      map.get(row.domainName)!.add(row.projectKey);
    }
    return map;
  }, [rows]);
  const domainOptions = useMemo(() => [...domainProjectKeys.keys()].sort((a, b) => a.localeCompare(b, 'vi')), [domainProjectKeys]);
  const [domainFilter, setDomainFilter] = useState('');
  const handleDomainFilterChange = (value: string) => {
    setDomainFilter(value);
    handleProjectFiltersChange(value ? [...(domainProjectKeys.get(value) ?? [])].sort() : []);
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    return (projectFilters.length === 0 || projectFilters.includes(row.projectKey))
      && (!pmSmFilter || row.ownerName.split(',').map((name) => name.trim()).includes(pmSmFilter))
      && (componentFilters.length === 0 || row.components.some((component) => componentFilters.includes(component)))
      && matchesAlertFilter(row, alertFilter)
      && (!typeFilter || row.epicType === typeFilter)
      && (!statusFilter || row.currentStatus === statusFilter)
      && (!dataIssueFilter || row.hasDataAnomaly)
      && (!requestingUnitFilter || row.requestingUnit === requestingUnitFilter)
      && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  }), [rows, projectFilters, pmSmFilter, componentFilters, alertFilter, typeFilter, statusFilter, dataIssueFilter, requestingUnitFilter, search]);

  // Raw status strings (case as stored) whose normalized form is PENDING/TO DO — the Status filter
  // is a single exact-match value, so the Pending/To Do stat widgets need the actual string(s) to
  // set it to. Usually exactly one, but data could in principle carry more than one case variant.
  const pendingStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'PENDING'), [statusOptions]);
  const todoStatusValues = useMemo(() => statusOptions.filter((status) => status.trim().toLocaleUpperCase('en-US') === 'TO DO'), [statusOptions]);

  const statCounts = useMemo(() => {
    let failCntt = 0;
    let failE2e = 0;
    let late = 0;
    let dataIssue = 0;
    let pending = 0;
    let todo = 0;
    for (const row of filteredRows) {
      if (row.alertLevel === 'FAIL') failCntt += 1;
      if (row.ttmE2eAlertLevel === 'FAIL') failE2e += 1;
      if (row.alertLevel === 'LATE') late += 1;
      if (row.hasDataAnomaly) dataIssue += 1;
      const normalizedStatus = row.currentStatus.trim().toLocaleUpperCase('en-US');
      if (normalizedStatus === 'PENDING') pending += 1;
      else if (normalizedStatus === 'TO DO') todo += 1;
    }
    return { dataIssue, failCntt, failE2e, late, pending, todo };
  }, [filteredRows]);

  // Admin/superadmin-tier viewers (accessRole LEAD/CBQL_PHONG) can be scoped to a huge number of
  // project keys, so the stat widgets only compute/show once the Project filter narrows that down
  // to a workable range (1–3 projects) — a PM/SM viewer's own scope is already small, so it's exempt.
  const statWidgetsGateMessage = isAdminTierAccess && (projectFilters.length === 0 || projectFilters.length > 3)
    ? 'Chọn từ 1 đến 3 dự án ở bộ lọc "Dự án" để xem thống kê nhanh.'
    : undefined;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      <InfoBannerDisplay pathname="/epic-alerts" />
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}
      {data?.asOfDate && (
        <div className="ttm-note" style={{ background: '#fff7e6', borderColor: '#f0c36d', color: '#7a5200', fontWeight: 700 }}>
          Đang xem dữ liệu &amp; đánh giá cảnh báo tại thời điểm {data.asOfDate.split('-').reverse().join('/')} (không phải hôm nay thực tế).
        </div>
      )}

      <section className="ttm-toolbar" aria-label="Bộ lọc Epic">
        {isAdminTierAccess && (
          <select
            className={`ttm-select${domainFilter ? ' has-filter' : ''}`}
            aria-label="Domain"
            value={domainFilter}
            onChange={(event) => handleDomainFilterChange(event.target.value)}
          >
            <option value="">Chọn Domain…</option>
            {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        )}
        <ToolbarMultiSelect
          ariaLabel="Dự án"
          allLabel="Tất cả dự án của tôi"
          options={projectOptions}
          value={projectFilters}
          onChange={(values) => { setDomainFilter(''); handleProjectFiltersChange(values); }}
        />
        <select
          className={`ttm-select${pmSmFilter ? ' has-filter' : ''}`}
          aria-label="PM/SM"
          value={pmSmFilter}
          onChange={(event) => { setPmSmFilter(event.target.value); setPage(1); }}
          title="Lọc theo PM/SM của dự án — hiển thị Epic của mọi dự án do người này phụ trách"
        >
          <option value="">Tất cả PM/SM</option>
          {pmSmOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <ToolbarMultiSelect
          ariaLabel="Components"
          allLabel={projectFilters.length === 0 ? 'Chọn dự án trước' : 'Tất cả Components'}
          disabled={projectFilters.length === 0}
          options={componentOptions}
          value={componentFilters}
          onChange={(values) => { setComponentFilters(values); setPage(1); }}
        />
        <select
          className={`ttm-select${alertFilter ? ' has-filter' : ''}`}
          aria-label="Lọc Nhận xét"
          value={alertFilter}
          onChange={(event) => { setAlertFilter(event.target.value as AlertFilterValue); setPage(1); }}
        >
          {ALERT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          className={`ttm-select${typeFilter ? ' has-filter' : ''}`}
          aria-label="Loại Epic"
          value={typeFilter}
          onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}
        >
          <option value="">Tất cả loại Epic</option>
          {EPIC_COMPLEXITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select
          className={`ttm-select${statusFilter ? ' has-filter' : ''}`}
          aria-label="Status"
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
        >
          <option value="">Tất cả status</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select
          className={`ttm-select${requestingUnitFilter ? ' has-filter' : ''}`}
          aria-label="Đơn vị yêu cầu"
          value={requestingUnitFilter}
          onChange={(event) => { setRequestingUnitFilter(event.target.value); setPage(1); }}
        >
          <option value="">Tất cả đơn vị yêu cầu</option>
          {requestingUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <input
          className={`ttm-field ttm-search-field${search.trim() ? ' has-filter' : ''}`}
          type="search"
          aria-label="Tìm epic"
          placeholder="Tìm epic"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </section>

      <div className="border-t border-slate-300 pt-3 mb-4">
        <button
          type="button"
          onClick={() => setAdvancedFiltersOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors"
        >
          {advancedFiltersOpen ? <CaretDown className="size-4 text-[#1463f7]" weight="bold" /> : <CaretRight className="size-4 text-[#1463f7]" weight="bold" />}
          <span>Bộ lọc nâng cao...</span>
        </button>
        {advancedFiltersOpen && (
          <div className="mt-3 space-y-3 pl-2 border-l-2 border-[#1463f7] pt-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-black">Chọn lớp dữ liệu</label>
                <span className="text-[10px] text-gray-700 font-medium">Chọn 1 lớp dữ liệu, dữ liệu sẽ tự động drill xuống các lớp cũ hơn nếu thiếu.</span>
              </div>
              {availableLayerDates.length === 0 ? (
                <p className="text-[11px] text-gray-600">Chưa có lớp dữ liệu nào trong hệ thống.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {recentLayerDates.map((layer, idx) => {
                    const isSelected = layer === effectiveLayerAnchor;
                    return (
                      <button
                        key={layer}
                        type="button"
                        onClick={() => { setSelectedLayerAnchor(layer); setPage(1); }}
                        title={`Chọn lớp dữ liệu ${layer} (drill xuống các lớp cũ hơn)`}
                        className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${isSelected ? 'border-[#1463f7] bg-[#1463f7] text-white' : 'border-slate-400 bg-white text-gray-800 hover:border-black'}`}
                      >
                        {isSelected && <Check className="size-3.5" weight="bold" />}
                        <span>{layer}</span>
                        {idx === 0 && <span className="bg-black text-white px-1 text-[9px] uppercase">Mới nhất</span>}
                      </button>
                    );
                  })}
                  {olderLayerDates.length > 0 && (
                    <select
                      className={`rounded-none border px-2 py-1.5 text-xs font-bold font-mono cursor-pointer ${olderLayerDates.includes(effectiveLayerAnchor) ? 'border-[#1463f7] text-[#1463f7]' : 'border-slate-400 text-gray-800'}`}
                      value={olderLayerDates.includes(effectiveLayerAnchor) ? effectiveLayerAnchor : ''}
                      onChange={(event) => { if (event.target.value) { setSelectedLayerAnchor(event.target.value); setPage(1); } }}
                      title="Chọn 1 lớp dữ liệu cũ hơn (ngoài 5 lớp gần nhất) — drill xuống các lớp cũ hơn nữa"
                    >
                      <option value="">Lớp dữ liệu cũ hơn…</option>
                      {olderLayerDates.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-300 pt-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic tạo mới từ (Created Date ≥)</label>
                <input
                  type="date"
                  value={createdDateFrom}
                  onChange={(event) => { setCreatedDateFrom(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${createdDateFrom ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic start date từ (Start CNTT / T1 ≥)</label>
                <input
                  type="date"
                  value={startDateFromFilter}
                  onChange={(event) => { setStartDateFromFilter(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${startDateFromFilter ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-black">Epic golive sau (Due Date ≥)</label>
                <input
                  type="date"
                  value={dueDateFromFilter}
                  onChange={(event) => { setDueDateFromFilter(event.target.value); setPage(1); }}
                  className={`w-full rounded-none border ${dueDateFromFilter ? 'border-red-600 has-filter' : 'border-slate-400'} bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {data && (
        <EpicStatWidgets
          gateMessage={statWidgetsGateMessage}
          items={[
            {
              icon: XCircle, isActive: alertFilter === 'FAIL', key: 'fail-cntt', label: 'Epic Fail TTM-CNTT',
              onClick: () => { setAlertFilter((current) => (current === 'FAIL' ? '' : 'FAIL')); setPage(1); },
              tone: 'danger', value: statCounts.failCntt,
            },
            {
              icon: Prohibit, isActive: alertFilter === 'FAIL_E2E', key: 'fail-e2e', label: 'Epic Fail TTM-E2E',
              onClick: () => { setAlertFilter((current) => (current === 'FAIL_E2E' ? '' : 'FAIL_E2E')); setPage(1); },
              tone: 'danger', value: statCounts.failE2e,
            },
            {
              icon: ClockCountdown, isActive: alertFilter === 'LATE', key: 'late', label: 'Epic Cảnh báo muộn',
              onClick: () => { setAlertFilter((current) => (current === 'LATE' ? '' : 'LATE')); setPage(1); },
              tone: 'warning', value: statCounts.late,
            },
            {
              icon: WarningOctagon, isActive: dataIssueFilter, key: 'data-issue', label: 'Epic sai lệch dữ liệu',
              onClick: () => { setDataIssueFilter((current) => !current); setPage(1); },
              tone: 'warning', value: statCounts.dataIssue,
            },
            {
              icon: HourglassMedium, isActive: pendingStatusValues.length > 0 && pendingStatusValues.includes(statusFilter), key: 'pending', label: 'Epic Pending',
              onClick: () => { setStatusFilter((current) => (pendingStatusValues.includes(current) ? '' : (pendingStatusValues[0] ?? ''))); setPage(1); },
              tone: 'neutral', value: statCounts.pending,
            },
            {
              icon: ListChecks, isActive: todoStatusValues.length > 0 && todoStatusValues.includes(statusFilter), key: 'todo', label: 'Epic To Do',
              onClick: () => { setStatusFilter((current) => (todoStatusValues.includes(current) ? '' : (todoStatusValues[0] ?? ''))); setPage(1); },
              tone: 'neutral', value: statCounts.todo,
            },
          ]}
        />
      )}

      <section className="ttm-legend" aria-label="Chú thích màu">
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-warning-100)', border: '1px solid #f5d46b' }} />Cảnh báo sớm</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-danger-100)', border: '1px solid #f3b3b3' }} />Cảnh báo muộn</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-success-100)', border: '1px solid #cfe8d6' }} />Đã hoàn thành</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-neutral-100)', border: '1px solid var(--ttm-border)' }} />Chưa tới</span>
      </section>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Không có Epic phù hợp" description="Thử thay đổi bộ lọc." />
      ) : (
        <TableContainer>
          <Table className="min-w-[1400px]">
            <THead>
              <TR>
                <TH className="min-w-[180px] ttm-col-border-right" title="issues.issue_key / issues.issue_name">Epic</TH>
                <TH className="min-w-[100px]" title="T0 = Idea Approved Date, hoặc ngày tạo Jira nếu không có — điểm bắt đầu chu kỳ TTM-E2E">START-E2E</TH>
                <TH title="issues.start_date">START-CNTT</TH>
                <TH title="Tính từ issues.start_date + issues.epic_complexity_type (số ngày làm việc thực tế / chuẩn)">TTM-CNTT</TH>
                <TH className="ttm-col-border-right" title="Baseline (dòng trên) = T0 + TTM-E2E; Thực tế (dòng dưới) = T0 → Due Date (hoặc hôm nay nếu chưa có). T0 = Idea Approved Date, hoặc Start Date, hoặc ngày tạo Jira">TTM-E2E</TH>
                <TH title="issues.current_status">Status</TH>
                <TH className="min-w-[120px]" title="Tính toán (alertLevel) — không lưu trực tiếp trong CSDL">Nhận xét</TH>
                <TH className="min-w-[118px]" title="Tính từ issues.start_date theo rule offset (giai đoạn Design)">Design</TH>
                <TH className="min-w-[118px]" title="Tính từ issues.start_date theo rule offset (giai đoạn In Progress)">In Progress</TH>
                <TH className="min-w-[118px]" title="issues.r4g_date">Ready4Golive</TH>
                <TH className="min-w-[118px]" title="issues.due_date">Release</TH>
              </TR>
            </THead>
            <TBody>
              {pageRows.map((row: EpicAlertRow) => {
                const isMissingCore = !row.t1StartDate;
                return (
                  <TR key={row.epicKey} className={row.hasDataAnomaly ? 'missing-row' : undefined}>
                    <TD className="ttm-col-border-right">
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryRow} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <span className="ttm-epic-key" title={`Lớp dữ liệu: ${formatDate(row.dataLayerDate)}`}>{row.epicKey}</span>
                      {row.epicName && (
                        <span className="ttm-epic-summary" title={row.epicName}>{truncateSummary(row.epicName)}</span>
                      )}
                      <span className="ttm-project-tag">
                        {row.projectKey}{row.domainName ? ` · ${row.domainName}` : ''}
                      </span>
                      {(row.epicType || row.ownerName) && (
                        <span className="ttm-project-tag">{row.epicType ? `${row.epicType}. ` : ''}PM/SM: {row.ownerName || '-'}</span>
                      )}
                      {row.missingStandardInfo.filter((item) => item !== 'Start Date').length > 0 && (
                        <span>
                          {row.missingStandardInfo
                            .filter((item) => item !== 'Start Date')
                            .map((item) => (
                              <span key={item} className="ttm-missing-tag">Thiếu {item}</span>
                            ))}
                        </span>
                      )}
                    </TD>
                    {/* START-E2E / TTM-E2E: T0 (Idea Approved → Jira creation date) always resolves —
                        independent of Start Date, so these render the same whether or not the Epic
                        is missing its Start Date (see resolveTtmE2eRelease in epic-alert-service.ts). */}
                    <TD>
                      {row.ttmE2eBaselineSourceDate ? (
                        <span className="inline-flex items-center gap-0.5 text-slate-500 font-medium text-[11px]">
                          <CaretRight className="size-3 shrink-0 text-slate-500" weight="bold" />
                          <span>{formatDate(row.ttmE2eBaselineSourceDate)}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    {isMissingCore ? (
                      <TD><span className="ttm-metric na">Không có</span></TD>
                    ) : (
                      <TD>
                        <span className="inline-flex items-center gap-0.5 text-slate-500 font-medium text-[11px]">
                          <CaretLineRight className="size-3 shrink-0 text-slate-500" weight="bold" />
                          <span>{formatDate(row.t1StartDate)}</span>
                        </span>
                      </TD>
                    )}
                    {isMissingCore ? (
                      <TD className="ttm-metric na">Không tính được</TD>
                    ) : (
                      <TtmCnttStrips row={row} />
                    )}
                    <TtmE2eStrips row={row} />
                    <TD><StatusBadge status={row.currentStatus} /></TD>
                    <TD>
                      {(() => {
                        // "Sai Status" (see resolveTtmCnttStatusMismatch in epic-alert-service.ts) always
                        // takes priority over Đạt/Fail TTM-CNTT — the recorded date is on schedule, but
                        // the workflow status hasn't caught up, so neither badge would be honest here.
                        // "Đạt TTM-CNTT" requires the recorded date to have actually already passed —
                        // ttmActualToDate only equals r4gDate once it's chronological AND <= today (see
                        // resolveTtmActualRange); a future-dated R4G Date (still "in progress") must not
                        // be praised as achieved just because it exists.
                        const isTtmCnttAchieved = !row.ttmCnttStatusMismatch && row.alertLevel === 'NONE' && Boolean(row.r4gDate) && row.ttmActualToDate === row.r4gDate;
                        // "Đạt TTM-E2E" (2026-09-24 rule): status Released AND T0→R4G Date on schedule —
                        // see resolveTtmE2eRelease's doc comment for why status alone isn't derived there.
                        const isTtmE2eAchieved = row.ttmE2eAlertLevel === 'NONE' && normalizeEpicWorkflowStatus(row.currentStatus) === 'RELEASED' && Boolean(row.r4gDate) && row.ttmE2eActualToDate === row.r4gDate;
                        const hasCnttBadge = row.ttmCnttStatusMismatch || row.alertLevel !== 'NONE' || isTtmCnttAchieved;
                        const hasE2eBadge = row.ttmE2eAlertLevel === 'FAIL' || isTtmE2eAchieved;
                        const hasReleaseBadge = row.releaseAxisState !== 'NONE';
                        const hasAnyBadge = hasCnttBadge || hasE2eBadge || hasReleaseBadge || row.hasDataAnomaly;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {row.ttmCnttStatusMismatch ? (
                              <Tooltip content="R4G Date đã ghi nhận và đúng hạn theo TTM-CNTT, nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status đúng quy định." className="inline-flex w-auto">
                                <span className="ttm-badge status-mismatch">Sai Status</span>
                              </Tooltip>
                            ) : row.alertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-cntt">Fail TTM-CNTT</span>
                            ) : row.alertLevel === 'LATE' ? (
                              <span className="ttm-badge late-warning">Cảnh báo muộn</span>
                            ) : row.alertLevel === 'EARLY' ? (
                              <span className="ttm-badge early-warning">Cảnh báo sớm</span>
                            ) : isTtmCnttAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM-CNTT</span>
                            ) : null}

                            {row.ttmE2eAlertLevel === 'FAIL' ? (
                              <span className="ttm-badge fail-e2e">Fail TTM-E2E</span>
                            ) : isTtmE2eAchieved ? (
                              <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-E2E đúng hạn theo rule (T0 → R4G Date) và đã Released">Đạt TTM-e2e</span>
                            ) : null}

                            {row.releaseAxisState === 'WAITING_GOLIVE' ? (
                              <Tooltip content={`Epic đã có R4G Date, còn trong hạn ${formatDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) và chưa có Due Date.`} className="inline-flex w-auto">
                                <span className="ttm-badge waiting-golive">Chờ golive</span>
                              </Tooltip>
                            ) : row.releaseAxisState === 'EARLY_WARNING' ? (
                              <Tooltip content={`Đã qua R4GOLIVE, còn trong hạn ${formatDate(row.releaseGraceDeadline)} để có Due Date hợp lệ và chuyển status Released.`} className="inline-flex w-auto">
                                <span className="ttm-badge early-warning">Cảnh báo sớm</span>
                              </Tooltip>
                            ) : row.releaseAxisState === 'JUSTIFY_GOLIVE' ? (
                              <Tooltip content={`Đã quá hạn ${formatDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) mà Epic chưa Released đúng hạn hoặc Due Date vượt hạn — cần giải trình.`} className="inline-flex w-auto">
                                <span className="ttm-badge justify-golive">Giải trình Golive</span>
                              </Tooltip>
                            ) : null}

                            {!hasAnyBadge && <span className="ttm-empty-warning">—</span>}

                            {row.hasDataAnomaly && <DataAnomalyBadge violations={row.dataAnomalyViolations} />}
                          </div>
                        );
                      })()}
                    </TD>
                    {isMissingCore ? (
                      <TD colSpan={3} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT do thiếu dữ liệu bắt buộc.</TD>
                    ) : (
                      <>
                        <StagePill cell={row.stages.design} />
                        <StagePill cell={row.stages.inProgress} />
                        <Ready4GoliveCell row={row} />
                      </>
                    )}
                    {/* Release: for "rút gọn" this cell only ever depends on Due Date (issues.due_date),
                        never on Start Date — see releaseCell in getEpicAlertRows — so it's unconditional. */}
                    <StagePill cell={row.stages.release} />
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <div className="ttm-pagination-row">
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{data ? formatDateTime(data.lastAggregatedAt) : '—'}</b></div>
        {filteredRows.length > 0 && (
          <nav className="ttm-pagination" aria-label="Điều hướng phân trang">
            <button type="button" className="ttm-button" disabled={currentPage <= 1} onClick={() => { trackDataUsage(); setPage((current) => Math.max(1, current - 1)); }}>‹ Trước</button>
            <span className="ttm-pagination-label">Trang</span>
            <select className="ttm-select" aria-label="Chọn trang" value={currentPage} onChange={(event) => { trackDataUsage(); setPage(Number(event.target.value)); }}>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
              ))}
            </select>
            <span className="ttm-pagination-label">/ {totalPages}</span>
            <button type="button" className="ttm-button" disabled={currentPage >= totalPages} onClick={() => { trackDataUsage(); setPage((current) => Math.min(totalPages, current + 1)); }}>Sau ›</button>
          </nav>
        )}
        <StatusColorLegend />
      </div>

      <p className="ttm-page-subtitle" style={{ marginTop: 12 }}>
        Hiển thị {pageRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + pageRows.length} / {filteredRows.length} Epic{data ? ` — vai trò: ${ACCESS_ROLE_LABEL[data.accessRole]}` : ''}.
      </p>

      {alertHistoryRow && (
        <AlertHistoryPanel key={alertHistoryRow.epicKey} row={alertHistoryRow} onClose={() => setAlertHistoryRow(null)} />
      )}
    </div>
  );
}
