'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-in-po.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StatusColorLegend } from '@/components/ui/StatusColorLegend';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import type { EpicAlertAccessRole, EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import type { EpicAlertHistoryEntry } from '@/lib/epic-alert-history-service';
import type { EpicMilestoneHistoryEntry } from '@/lib/epic-milestone-history-service';
import type { ProjectComponent } from '@/lib/master-data-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { ArrowSquareOut, ArrowsInLineHorizontal, ArrowsOutLineHorizontal, Warning } from '@phosphor-icons/react';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { trackDataUsage } from '@/lib/usage-tracking';

const PAGE_SIZE = 20;

const EMPTY_ROWS: EpicAlertRowPhased[] = [];

/** "Epic in PO" only ever shows Epics in these 3 statuses — clone of Quản trị Epic
 * (epic-alerts-15), filtered to the pre-Design part of the workflow plus Released. Matched via
 * normalizeEpicWorkflowStatus so casing/whitespace variants in raw Jira data (e.g. "To Do",
 * "TO DO") all resolve the same way as everywhere else status is classified. */
const IN_PO_STATUSES = new Set(['TO DO', 'IN PO', 'RELEASED']);

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

const ALERT_BADGE_CLASS: Record<AlertLevel, string> = {
  FAIL: 'fail-cntt',
  LATE: 'late-warning',
  EARLY: 'early-warning',
  NONE: '',
};

type AlertFilterValue = AlertLevel | 'FAIL_E2E' | '';

const ALERT_FILTER_OPTIONS: { label: string; value: AlertFilterValue }[] = [
  { label: 'Tất cả cảnh báo', value: '' },
  { label: 'Cảnh báo sớm', value: 'EARLY' },
  { label: 'Cảnh báo muộn', value: 'LATE' },
  { label: 'Fail TTM-CNTT', value: 'FAIL' },
  { label: 'Fail TTM-E2E', value: 'FAIL_E2E' },
];

const ACCESS_ROLE_LABEL: Record<EpicAlertAccessRole, string> = {
  CBQL_PHONG: 'CBQL Phòng',
  LEAD: 'Lead',
  PM_SM: 'PM-SM',
};


/**
 * light green (pass) — đã hoàn thành (isDone); light red (fail) — chưa hoàn thành và đã tới/quá
 * baseline (Cảnh báo muộn); light yellow (warning) — Cảnh báo sớm; không màu — chưa hoàn thành,
 * chưa tới baseline.
 */
function phaseCellColorClass(cell: PhaseCell): string {
  if (cell.isDone) return 'pass';
  if (cell.alertLevel === 'LATE') return 'fail';
  if (cell.alertLevel === 'EARLY') return 'warning';
  return '';
}

/** Two-line cell: baseline (top, computed from the phase-division rule) vs — only for phases that
 * have a real recorded date (R4GOLIVE's R4G Date, Release's Due Date) — that date (bottom).
 * Completion itself is shown purely via the cell's background color (phaseCellColorClass); other
 * phases no longer have a recorded completion date at all, so their bottom line stays empty. */
function PhaseStageCell({ actualDateText, cell }: { actualDateText?: string | null; cell: PhaseCell }) {
  const colorClass = phaseCellColorClass(cell);
  const baselineTitle = cell.baselineSourceLabel
    ? `Tính từ ${cell.baselineSourceLabel}: ${formatDate(cell.baselineSourceDate)}`
    : 'Baseline chuẩn theo rule phân chia giai đoạn (tính từ Start Date)';
  return (
    <TD className={`ttm-phase-cell${colorClass ? ` ${colorClass}` : ''}`}>
      {cell.isCurrentStage && <span className="ttm-phase-current-dot" title="Giai đoạn hiện tại của Epic" aria-hidden="true" />}
      <span className="ttm-phase-baseline" title={baselineTitle}>{formatDate(cell.baselineDate)}</span>
      <span className="ttm-phase-actual">{actualDateText ? formatDate(actualDateText) : null}</span>
    </TD>
  );
}

/** DESIGN/DEV/TEST/PENTEST can be individually collapsed to save horizontal space (the table has
 * grown to 13 columns) — R4GOLIVE/Release stay always-expanded since their bottom line carries a
 * real recorded date (R4G Date / Due Date), not just the baseline. */
type CollapsiblePhase = 'DESIGN' | 'DEV' | 'TEST' | 'PENTEST';

const COLLAPSIBLE_PHASES: CollapsiblePhase[] = ['DESIGN', 'DEV', 'TEST', 'PENTEST'];

const PHASE_COLUMN_META: Record<CollapsiblePhase, { char: string; title: string }> = {
  DESIGN: { char: 'D', title: 'Baseline = Start Date + 20% TTM-CNTT (làm tròn ngày)' },
  DEV: { char: 'V', title: 'Baseline = Start Date + (20%+30%) TTM-CNTT (làm tròn ngày)' },
  TEST: { char: 'T', title: 'Baseline = Start Date + (20%+30%+30%) TTM-CNTT (làm tròn ngày)' },
  PENTEST: { char: 'P', title: 'Baseline = Start Date + (20%+30%+30%+10%) TTM-CNTT (làm tròn ngày)' },
};

/** Expanded: full name, click to collapse. Collapsed: thin stub showing one representative
 * character with an immediate tooltip carrying the full name, click to expand — no sort affordance
 * either way (TH's sortDirection prop is intentionally left unset on this column). */
function CollapsiblePhaseHeader({ isCollapsed, onToggle, phase }: { isCollapsed: boolean; onToggle: (phase: CollapsiblePhase) => void; phase: CollapsiblePhase }) {
  const meta = PHASE_COLUMN_META[phase];
  if (isCollapsed) {
    return (
      <TH className="ttm-col-collapsed">
        <Tooltip content={phase} side="right">
          <button type="button" className="ttm-col-collapsed-toggle" onClick={() => onToggle(phase)} aria-label={`Hiện cột ${phase}`}>
            {meta.char}
          </button>
        </Tooltip>
      </TH>
    );
  }
  return (
    <TH className="min-w-[110px]" title={meta.title}>
      <button type="button" className="ttm-col-header-toggle" onClick={() => onToggle(phase)} aria-label={`Ẩn cột ${phase}`}>{phase}</button>
    </TH>
  );
}

/** Body-side counterpart of CollapsiblePhaseHeader — a collapsed column renders as an empty thin
 * cell (no content, per the collapse rule), matching the header's width/right-border. */
function CollapsiblePhaseCell({ actualDateText, cell, isCollapsed }: { actualDateText?: string | null; cell: PhaseCell; isCollapsed: boolean }) {
  if (isCollapsed) {
    // Collapsed background reuses the same pass/warning/fail class as the expanded cell (see
    // phaseCellColorClass) so the thin stub still shows the column's real status at a glance.
    const colorClass = phaseCellColorClass(cell);
    return <TD className={`ttm-phase-cell ttm-col-collapsed${colorClass ? ` ${colorClass}` : ''}`} />;
  }
  return <PhaseStageCell actualDateText={actualDateText} cell={cell} />;
}

const EPIC_TYPE_DOT: Record<string, { label: string; variant: string }> = {
  SIMPLE: { label: 'Epic đơn giản', variant: 'epic-type-simple' },
  COMPLEX: { label: 'Epic phức tạp', variant: 'epic-type-complex' },
};

function EpicTypeDot({ epicType }: { epicType: string | null }) {
  const entry = epicType ? EPIC_TYPE_DOT[epicType] : undefined;
  if (!entry) return <span className="ttm-empty-warning">-</span>;
  return <span className={`ttm-epic-type-dot ${entry.variant}`} title={entry.label} role="img" aria-label={entry.label} />;
}

/** Truncates epic summary text for the table's subtitle line — full text stays in the title tooltip. */
function truncateSummary(value: string, maxLength = 50): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="ttm-empty-warning">—</span>;
  return <span className="ttm-status-badge">{status}</span>;
}

/** True when `actual` (an ISO "YYYY-MM-DD" date) falls strictly after `baseline` — ISO date strings
 * sort lexicographically the same as chronologically, so a plain string compare is exact here. */
function isPastBaseline(actual: string | null, baseline: string | null): boolean {
  return Boolean(actual && baseline && actual > baseline);
}

/** Two-stripe metric cell shared by the TTM-CNTT and TTM-E2E columns: top stripe is the baseline
 * (planned) window, bottom stripe is the actual window so far — same start date as the baseline,
 * end date is either a real recorded date (R4G Date / Due Date) or today while still ongoing. The
 * bottom stripe's color signals whether its end date has passed the baseline's end date. */
function TtmMetricStrips({
  actualFromDate, actualToDate, baselineFromDate, baselineToDate, className, compact, elapsed, target,
}: {
  actualFromDate: string | null;
  actualToDate: string | null;
  baselineFromDate: string | null;
  baselineToDate: string | null;
  className?: string;
  compact: boolean;
  elapsed: number | null;
  target: number;
}) {
  const elapsedDays = elapsed ?? 0;
  const ratio = target > 0 ? elapsedDays / target : 0;
  const isOver = isPastBaseline(actualToDate, baselineToDate);
  // Compact mode (all four collapsible phase columns collapsed) shrinks these tracks so the whole
  // table fits the viewport with no horizontal scroll — see the toolbar's collapse-all toggle.
  const BASE_WIDTH = compact ? 30 : 56;
  // Hard cap in px (not just a ratio multiplier) so an Epic with an unusually long actual
  // duration can never stretch the strip wide enough to break the table's layout.
  const MAX_ACTUAL_WIDTH = compact ? 56 : 112;
  const actualWidth = Math.min(Math.max(6, ratio * BASE_WIDTH), MAX_ACTUAL_WIDTH);

  return (
    <TD className={`ttm-metric${compact ? ' ttm-metric-compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ttm-strip-wrap" title={`${elapsedDays}/${target} ngày làm việc`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(baselineFromDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(baselineToDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(actualFromDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">{formatDate(actualToDate)}</span>
        </div>
      </div>
    </TD>
  );
}

function TtmCnttStrips({ compact, row }: { compact: boolean; row: EpicAlertRowPhased }) {
  return (
    <TtmMetricStrips
      actualFromDate={row.ttmActualFromDate}
      actualToDate={row.ttmActualToDate}
      baselineFromDate={row.t1StartDate}
      baselineToDate={row.targetR4gDate}
      compact={compact}
      elapsed={row.ttmActualElapsedWorkingDays}
      target={row.ttmCnttTargetWorkingDays}
    />
  );
}

/** T0 (release baseline's own source date) doubles as both stripes' start — same convention as
 * TTM-CNTT's Start Date. */
function TtmE2eStrips({ compact, row }: { compact: boolean; row: EpicAlertRowPhased }) {
  const t0 = row.stages.release.baselineSourceDate;
  return (
    <TtmMetricStrips
      actualFromDate={t0}
      actualToDate={row.ttmE2eActualToDate}
      baselineFromDate={t0}
      baselineToDate={row.stages.release.baselineDate}
      className="ttm-col-border-right"
      compact={compact}
      elapsed={row.ttmE2eElapsedWorkingDays}
      target={row.ttmE2eTargetWorkingDays}
    />
  );
}

const ALERT_HISTORY_TYPE_LABEL: Record<EpicAlertHistoryEntry['alertType'], string> = {
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
};

const ALERT_HISTORY_PHASE_LABEL: Record<EpicAlertHistoryEntry['phase'], string> = {
  OVERALL: '',
  DESIGN: 'DESIGN',
  DEV: 'DEV',
  TEST: 'TEST',
  PENTEST: 'PENTEST',
  R4GOLIVE: 'R4GOLIVE',
};

const MILESTONE_LABEL: Record<string, string> = {
  DESIGN_DONE: 'Design Done',
  DEV_DONE: 'Dev Done',
  TEST_DONE: 'Test Done',
};

function AlertHistoryButton({ row, onOpen }: { row: EpicAlertRowPhased; onOpen: (row: EpicAlertRowPhased) => void }) {
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

function AlertPopupField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ttm-alert-popup-field">
      <span className="ttm-alert-popup-field-label">{label}</span>
      <span className="ttm-alert-popup-field-value">{value}</span>
    </div>
  );
}

function AlertHistoryPanel({ row, onClose }: { row: EpicAlertRowPhased; onClose: () => void }) {
  const [entries, setEntries] = useState<EpicAlertHistoryEntry[] | null>(null);
  const [milestones, setMilestones] = useState<EpicMilestoneHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/epic-alerts/${encodeURIComponent(row.epicKey)}/alert-history`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) { setError(body.error || 'Lỗi hệ thống khi tải lịch sử Epic.'); return; }
        setEntries(body.history ?? []);
        setMilestones(body.milestones ?? []);
      })
      .catch(() => { if (!cancelled) setError('Không thể kết nối API.'); });
    return () => { cancelled = true; };
  }, [row.epicKey]);

  const isLoading = entries === null || milestones === null;

  return (
    <Modal isOpen onClose={onClose} title={`Epic History — ${row.epicKey}`} maxWidth="xl">
      <div className="ttm-alert-popup">
        <div className="ttm-alert-popup-left">
          <AlertPopupField label="Summary" value={row.epicName || '-'} />
          <AlertPopupField label="Tên dự án" value={row.projectName || '-'} />
          <AlertPopupField label="Ngày duyệt ý tưởng (T0)" value={formatDate(row.t0IdeaApprovedDate)} />
          <AlertPopupField label="Start Date (T1)" value={formatDate(row.t1StartDate)} />
          <AlertPopupField label="Status" value={row.currentStatus || '-'} />
          <AlertPopupField label="PM/SM" value={row.ownerName || '-'} />
          <AlertPopupField label="Domain (của PM/SM)" value={row.domainName || '-'} />
          <AlertPopupField label="Lớp dữ liệu đang sử dụng" value={formatDate(row.dataLayerDate)} />
        </div>
        <div className="ttm-alert-popup-right">
          {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}
          {!error && isLoading && <p className="ttm-alert-popup-right-empty">Đang tải…</p>}
          {!error && !isLoading && (
            <>
              <h4 className="ttm-alert-popup-section-title">Mốc hoàn thành</h4>
              {milestones.length === 0 ? (
                <p className="ttm-alert-popup-right-empty">Chưa có mốc hoàn thành nào được ghi nhận.</p>
              ) : (
                <ul className="ttm-alert-history-list">
                  {milestones.map((milestone) => (
                    <li key={milestone.milestone} className="ttm-alert-history-item">
                      <span className="ttm-badge-achieved">{MILESTONE_LABEL[milestone.milestone] ?? milestone.milestone}</span>
                      <span className="ttm-alert-history-status">Hoàn thành</span>
                      <span className="ttm-alert-history-date">{formatDate(milestone.milestoneDate)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="ttm-alert-popup-section-title ttm-alert-popup-section-title-spaced">Cảnh báo</h4>
              {entries.length === 0 ? (
                <p className="ttm-alert-popup-right-empty">Chưa có lịch sử cảnh báo cho Epic này.</p>
              ) : (
                <ul className="ttm-alert-history-list">
                  {entries.map((entry, index) => (
                    <li key={`${entry.alertDate}-${entry.alertType}-${entry.phase}-${index}`} className="ttm-alert-history-item">
                      <span className={`ttm-badge ${entry.alertType === 'FAIL' ? 'fail' : 'late-warning'}`}>
                        {ALERT_HISTORY_TYPE_LABEL[entry.alertType]}{ALERT_HISTORY_PHASE_LABEL[entry.phase] ? ` (${ALERT_HISTORY_PHASE_LABEL[entry.phase]})` : ''}
                      </span>
                      <span className="ttm-alert-history-status">{entry.alertStatus}</span>
                      <span className="ttm-alert-history-date">{formatDate(entry.alertDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function EpicInPoPage() {
  const [data, setData] = useState<EpicAlertPhasedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectFilters, setProjectFilters] = useState<string[]>([]);
  const [componentFilters, setComponentFilters] = useState<string[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilterValue>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<CollapsiblePhase>>(new Set(['DESIGN', 'DEV', 'TEST', 'PENTEST']));
  const toggleColumn = (phase: CollapsiblePhase) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase); else next.add(phase);
      return next;
    });
  };
  // "Compact mode": only while every collapsible phase column is collapsed does the table shrink
  // its other wide elements (TTM-CNTT/E2E strips, Status/R4GOLIVE/Release widths) to fit the
  // viewport without horizontal scroll. Expanding any one of them drops back to the wider fixed
  // layout — the user then scrolls horizontally instead.
  const allColumnsCollapsed = collapsedColumns.size === COLLAPSIBLE_PHASES.length;
  const toggleAllColumns = () => setCollapsedColumns(allColumnsCollapsed ? new Set() : new Set(COLLAPSIBLE_PHASES));
  const [alertHistoryRow, setAlertHistoryRow] = useState<EpicAlertRowPhased | null>(null);
  const [browsingEpicKey, setBrowsingEpicKey] = useState<string | null>(null);
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/epic-alerts-15');
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Lỗi hệ thống khi tải dữ liệu.');
      } else {
        setData(result);
      }
    } catch {
      setError('Không thể kết nối API Epic in PO.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup.
    void Promise.resolve().then(fetchData);
    fetch('/api/project-components').then((res) => (res.ok ? res.json() : [])).then(setProjectComponents).catch(() => undefined);
  }, []);

  // Same source data as Quản trị Epic, sliced down to just TO DO / IN PO / RELEASED — this is the
  // one thing that makes "Epic in PO" a distinct screen rather than the same page.
  const rows = useMemo(
    () => (data?.rows ?? EMPTY_ROWS).filter((row) => IN_PO_STATUSES.has(normalizeEpicWorkflowStatus(row.currentStatus))),
    [data],
  );
  const projectOptions = useMemo(() => [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(), [rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort(), [rows]);
  const componentOptions = useMemo(
    () => [...new Set(projectComponents.filter((component) => projectFilters.includes(component.projectKey)).map((component) => component.componentName))].sort(),
    [projectComponents, projectFilters],
  );
  const handleProjectFiltersChange = (values: string[]) => {
    setProjectFilters(values);
    if (values.length === 0) setComponentFilters([]);
    setPage(1);
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    return (projectFilters.length === 0 || projectFilters.includes(row.projectKey))
      && (componentFilters.length === 0 || row.components.some((component) => componentFilters.includes(component)))
      && (!alertFilter || (alertFilter === 'FAIL_E2E' ? row.ttmE2eAlertLevel === 'FAIL' : row.alertLevel === alertFilter))
      && (!typeFilter || row.epicType === typeFilter)
      && (statusFilters.length === 0 || statusFilters.includes(row.currentStatus))
      && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  }), [rows, projectFilters, componentFilters, alertFilter, typeFilter, statusFilters, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      <p className="ttm-page-subtitle">
        Màn hình read-only theo các dự án được phân quyền, chỉ hiển thị Epic đang ở trạng thái To Do, In PO hoặc Released.
      </p>

      {data && (
        <div className="ttm-note">
          Trạng thái hoàn thành của Epic: tính theo trạng thái của story, hoặc trạng thái Done của các subtask của mỗi role BA, DEV, TEST.
        </div>
      )}
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}

      <section className="ttm-toolbar" aria-label="Bộ lọc Epic">
        <ToolbarMultiSelect
          ariaLabel="Dự án"
          allLabel="Tất cả dự án của tôi"
          options={projectOptions}
          value={projectFilters}
          onChange={handleProjectFiltersChange}
        />
        <ToolbarMultiSelect
          ariaLabel="Components"
          allLabel={projectFilters.length === 0 ? 'Chọn dự án trước' : 'Tất cả Components'}
          disabled={projectFilters.length === 0}
          options={componentOptions}
          value={componentFilters}
          onChange={(values) => { setComponentFilters(values); setPage(1); }}
        />
        <select className="ttm-select" aria-label="Cảnh báo" value={alertFilter} onChange={(event) => { setAlertFilter(event.target.value as AlertFilterValue); setPage(1); }}>
          {ALERT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className="ttm-select" aria-label="Loại Epic" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả loại Epic</option>
          <option value="SIMPLE">Epic đơn giản</option>
          <option value="COMPLEX">Epic phức tạp</option>
        </select>
        <ToolbarMultiSelect
          ariaLabel="Status"
          allLabel="Tất cả status"
          options={statusOptions}
          value={statusFilters}
          onChange={(values) => { setStatusFilters(values); setPage(1); }}
        />
        <input className="ttm-field" type="search" aria-label="Tìm Epic Key hoặc Epic Name" placeholder="Tìm Epic Key hoặc Epic Name…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <button
          type="button"
          className="ttm-button ghost ttm-collapse-all-toggle"
          onClick={toggleAllColumns}
          title={allColumnsCollapsed ? 'Mở rộng các cột DESIGN/DEV/TEST/PENTEST' : 'Thu gọn các cột DESIGN/DEV/TEST/PENTEST'}
          aria-label={allColumnsCollapsed ? 'Mở rộng các cột DESIGN/DEV/TEST/PENTEST' : 'Thu gọn các cột DESIGN/DEV/TEST/PENTEST'}
        >
          {allColumnsCollapsed ? <ArrowsOutLineHorizontal size={16} weight="bold" /> : <ArrowsInLineHorizontal size={16} weight="bold" />}
        </button>
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{data ? formatDateTime(data.lastAggregatedAt) : '—'}</b></div>
      </section>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Không có Epic phù hợp" description="Thử thay đổi bộ lọc." />
      ) : (
        <TableContainer>
          <Table className={allColumnsCollapsed ? 'ttm-table-compact' : 'min-w-[1440px]'}>
            <THead>
              <TR>
                <TH className={`ttm-epic-col-sticky ttm-col-border-right ${allColumnsCollapsed ? 'min-w-[150px]' : 'min-w-[180px]'}`} title="issues.issue_key / issues.issue_name">Epic</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[90px]' : 'min-w-[120px]'} title="Tính toán (alertLevel) — không lưu trực tiếp trong CSDL">Nhận xét</TH>
                <TH title="Baseline (dòng trên) = Start Date + TTM-CNTT; Thực tế (dòng dưới) = Start Date → R4G Date (hoặc hôm nay nếu chưa có)">TTM-CNTT</TH>
                <TH className="ttm-col-border-right" title="Baseline (dòng trên) = T0 + TTM-E2E; Thực tế (dòng dưới) = T0 → Due Date (hoặc hôm nay nếu chưa có). T0 = Idea Approved Date, hoặc Start Date, hoặc ngày tạo Jira">TTM-E2E</TH>
                <TH className={allColumnsCollapsed ? 'ttm-col-compact-status' : undefined} title="issues.current_status">Status</TH>
                <TH title="issues.start_date">Start Date</TH>
                <CollapsiblePhaseHeader phase="DESIGN" isCollapsed={collapsedColumns.has('DESIGN')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="DEV" isCollapsed={collapsedColumns.has('DEV')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="TEST" isCollapsed={collapsedColumns.has('TEST')} onToggle={toggleColumn} />
                <CollapsiblePhaseHeader phase="PENTEST" isCollapsed={collapsedColumns.has('PENTEST')} onToggle={toggleColumn} />
                <TH className={allColumnsCollapsed ? 'min-w-[92px]' : 'min-w-[110px]'} title="Baseline = Start Date + 100% TTM-CNTT; dòng dưới = issues.r4g_date">R4GOLIVE</TH>
                <TH className={allColumnsCollapsed ? 'min-w-[98px]' : 'min-w-[118px]'} title="Baseline = Ngày duyệt ý tưởng (hoặc Ngày epic created nếu không có) + 20 ngày làm việc, không tính holiday. Dòng dưới = issues.due_date">Release</TH>
              </TR>
            </THead>
            <TBody>
              {pageRows.map((row: EpicAlertRowPhased) => {
                const isMissingCore = !row.t1StartDate;
                return (
                  <TR key={row.epicKey} className={isMissingCore ? 'missing-row' : undefined}>
                    <TD className="ttm-epic-col-sticky ttm-col-border-right">
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryRow} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <button
                        type="button"
                        className="ttm-epic-key"
                        onClick={() => { trackDataUsage(); setBrowsingEpicKey(row.epicKey); }}
                        title={`Duyệt Epic (Epic Browser) — Lớp dữ liệu: ${formatDate(row.dataLayerDate)}`}
                      >
                        {row.epicKey}
                      </button>
                      <EpicTypeDot epicType={row.epicType} />
                      {row.epicName && (
                        <span className="ttm-epic-summary" title={row.epicName}>{truncateSummary(row.epicName)}</span>
                      )}
                      {row.ownerName && (
                        <span className="ttm-project-tag">PM/SM: {row.ownerName}</span>
                      )}
                      {row.missingStandardInfo.length > 0 && (
                        <span>
                          {row.missingStandardInfo.map((item) => (
                            <span key={item} className="ttm-missing-tag">Thiếu {item}</span>
                          ))}
                        </span>
                      )}
                    </TD>
                    {isMissingCore ? (
                      <>
                        <TD>{row.currentStatus === 'To Do' ? <span className="ttm-empty-warning">—</span> : <span className="ttm-badge fail">Thiếu Start Date</span>}</TD>
                        <TD className="ttm-metric na">Không tính được</TD>
                        <TD className="ttm-metric na ttm-col-border-right">Không tính được</TD>
                        <TD><StatusBadge status={row.currentStatus} /></TD>
                        <TD><span className="ttm-metric na">Không có</span></TD>
                        <TD colSpan={6} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT do thiếu dữ liệu bắt buộc.</TD>
                      </>
                    ) : (
                      <>
                        <TD>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {row.alertLevel === 'NONE'
                              ? (row.r4gDate
                                ? <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM</span>
                                : <span className="ttm-empty-warning">—</span>)
                              : <span className={`ttm-badge ${ALERT_BADGE_CLASS[row.alertLevel]}`}>{row.alertLevel === 'EARLY' ? 'Cảnh báo sớm' : row.alertLevel === 'LATE' ? 'Cảnh báo muộn' : 'Fail TTM-CNTT'}</span>}
                            {row.ttmE2eAlertLevel === 'FAIL' && <span className="ttm-badge fail-e2e">Fail TTM-E2E</span>}
                          </div>
                        </TD>
                        <TtmCnttStrips compact={allColumnsCollapsed} row={row} />
                        <TtmE2eStrips compact={allColumnsCollapsed} row={row} />
                        <TD className={allColumnsCollapsed ? 'ttm-col-compact-status' : undefined}><StatusBadge status={row.currentStatus} /></TD>
                        <TD className="ttm-phase-cell pass">{formatDate(row.t1StartDate)}</TD>
                        <CollapsiblePhaseCell cell={row.stages.design} isCollapsed={collapsedColumns.has('DESIGN')} />
                        <CollapsiblePhaseCell cell={row.stages.dev} isCollapsed={collapsedColumns.has('DEV')} />
                        <CollapsiblePhaseCell cell={row.stages.test} isCollapsed={collapsedColumns.has('TEST')} />
                        <CollapsiblePhaseCell cell={row.stages.pentest} isCollapsed={collapsedColumns.has('PENTEST')} />
                        <PhaseStageCell cell={row.stages.r4golive} actualDateText={row.r4gDate} />
                        <PhaseStageCell cell={row.stages.release} actualDateText={row.dueDate} />
                      </>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <div className="ttm-pagination-row">
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

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
