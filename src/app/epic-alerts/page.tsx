'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-alerts.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StatusColorLegend } from '@/components/ui/StatusColorLegend';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell } from '@/lib/epic-alert-types';
import type { EpicAlertHistoryEntry } from '@/lib/epic-alert-history-service';
import type { ProjectComponent } from '@/lib/master-data-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { ArrowSquareOut, Circle, Stack, Warning } from '@phosphor-icons/react';
import { epicWorkflowStatusIndex } from '@/lib/ttm-phase-rules';
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

const EPIC_TYPE_ICON: Record<string, { icon: typeof Circle; label: string; variant: string }> = {
  SIMPLE: { icon: Circle, label: 'Epic đơn giản', variant: 'epic-type-simple' },
  COMPLEX: { icon: Stack, label: 'Epic phức tạp', variant: 'epic-type-complex' },
};

function EpicTypeIcon({ epicType }: { epicType: string | null }) {
  const entry = epicType ? EPIC_TYPE_ICON[epicType] : undefined;
  if (!entry) return <span className="ttm-empty-warning">-</span>;
  const Icon = entry.icon;
  return (
    <span title={entry.label}>
      <Icon weight="fill" size={18} className={`ttm-epic-type-icon ${entry.variant}`} />
    </span>
  );
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
  const isOver = !isTtmCnttStripeOnTrack(row.currentStatus, row.r4gDate, row.ttmActualToDate, row.targetR4gDate);
  const BASE_WIDTH = 56;
  const actualWidth = Math.max(6, Math.min(ratio, 2) * BASE_WIDTH);

  return (
    <TD className="ttm-metric">
      <div className="ttm-strip-wrap" title={`${elapsed}/${target} ngày làm việc`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(fromDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(row.targetR4gDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.ttmActualFromDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">{formatDate(row.ttmActualToDate)}</span>
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
          <span className="ttm-strip-date">{formatDate(row.ttmE2eActualToDate)}</span>
        </div>
      </div>
    </TD>
  );
}

function Ready4GoliveCell({ row }: { row: EpicAlertRow }) {
  return (
    <TD className={row.r4gDate ? 'ttm-r4g-cell is-complete' : 'ttm-r4g-cell'}>
      {row.r4gDate && <span className="ttm-r4g-actual">{formatDate(row.r4gDate)}</span>}
      <span className="ttm-r4g-target">Target TTM={formatDate(row.targetR4gDate)}</span>
    </TD>
  );
}

const ALERT_HISTORY_TYPE_LABEL: Record<EpicAlertHistoryEntry['alertType'], string> = {
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
};

function AlertHistoryButton({ row, onOpen }: { row: EpicAlertRow; onOpen: (epicKey: string) => void }) {
  return (
    <button
      type="button"
      className={`ttm-alert-history-trigger${row.hasAlertHistory ? ' has-history' : ''}`}
      title={row.hasAlertHistory ? 'Xem lịch sử cảnh báo Epic' : 'Epic chưa có lịch sử cảnh báo'}
      onClick={() => { trackDataUsage(); onOpen(row.epicKey); }}
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

function AlertHistoryPanel({ epicKey, onClose }: { epicKey: string; onClose: () => void }) {
  const [entries, setEntries] = useState<EpicAlertHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/epic-alerts/${encodeURIComponent(epicKey)}/alert-history`)
      .then(async (res) => ({ ok: res.ok, body: await res.json() }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) { setError(body.error || 'Lỗi hệ thống khi tải lịch sử cảnh báo.'); return; }
        setEntries(body.history ?? []);
      })
      .catch(() => { if (!cancelled) setError('Không thể kết nối API.'); });
    return () => { cancelled = true; };
  }, [epicKey]);

  return (
    <Modal isOpen onClose={onClose} title={`Lịch sử cảnh báo — ${epicKey}`} maxWidth="sm">
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
  const [componentFilters, setComponentFilters] = useState<string[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [alertFilter, setAlertFilter] = useState<AlertFilterValue>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [alertHistoryEpicKey, setAlertHistoryEpicKey] = useState<string | null>(null);
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/epic-alerts');
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
    // Deferring the initial request prevents a synchronous state update during effect setup.
    void Promise.resolve().then(fetchData);
    fetch('/api/project-components').then((res) => (res.ok ? res.json() : [])).then(setProjectComponents).catch(() => undefined);
  }, []);

  const rows = data?.rows ?? EMPTY_EPIC_ALERT_ROWS;
  const projectOptions = useMemo(() => [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(), [rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort(), [rows]);
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

  const filteredRows = useMemo(() => rows.filter((row) => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    return (projectFilters.length === 0 || projectFilters.includes(row.projectKey))
      && (componentFilters.length === 0 || row.components.some((component) => componentFilters.includes(component)))
      && (!alertFilter || (alertFilter === 'FAIL_E2E' ? row.ttmE2eAlertLevel === 'FAIL' : row.alertLevel === alertFilter))
      && (!typeFilter || row.epicType === typeFilter)
      && (!statusFilter || row.currentStatus === statusFilter)
      && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  }), [rows, projectFilters, componentFilters, alertFilter, typeFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      <p className="ttm-page-subtitle">Màn hình read-only theo các dự án được phân quyền. Không có hành động ghi ngược Jira.</p>

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
        <select className="ttm-select" aria-label="Status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả status</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <input className="ttm-field" type="search" aria-label="Tìm Epic Key hoặc Epic Name" placeholder="Tìm Epic Key hoặc Epic Name…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{data ? formatDateTime(data.lastAggregatedAt) : '—'}</b></div>
      </section>

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
                <TH title="import_rows.normalized_data_json->>'epicType' (fallback: issues.epic_complexity_type)">Loại Epic</TH>
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
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryEpicKey} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <span className="ttm-epic-key" title={`Lớp dữ liệu: ${formatDate(row.dataLayerDate)}`}>{row.epicKey}</span>
                      <span className="ttm-project-tag">
                        {row.projectKey}{row.domainName ? ` · ${row.domainName}` : ''}
                      </span>
                      {row.missingStandardInfo.length > 0 && (
                        <span>
                          {row.missingStandardInfo.map((item) => (
                            <span key={item} className="ttm-missing-tag">Thiếu {item}</span>
                          ))}
                        </span>
                      )}
                    </TD>
                    <TD><EpicTypeIcon epicType={row.epicType} /></TD>
                    {/* START-E2E / TTM-E2E: T0 (Idea Approved → Jira creation date) always resolves —
                        independent of Start Date, so these render the same whether or not the Epic
                        is missing its Start Date (see resolveTtmE2eRelease in epic-alert-service.ts). */}
                    <TD>{formatDate(row.ttmE2eBaselineSourceDate)}</TD>
                    {isMissingCore ? (
                      <TD><span className="ttm-metric na">Không có</span></TD>
                    ) : (
                      <TD>{formatDate(row.t1StartDate)}</TD>
                    )}
                    {isMissingCore ? (
                      <TD className="ttm-metric na">Không tính được</TD>
                    ) : (
                      <TtmCnttStrips row={row} />
                    )}
                    <TtmE2eStrips row={row} />
                    <TD><StatusBadge status={row.currentStatus} /></TD>
                    <TD>
                      {row.hasDataAnomaly ? (
                        isMissingCore
                          ? (row.currentStatus === 'To Do' ? <span className="ttm-empty-warning">—</span> : <span className="ttm-badge fail">Thiếu Start Date</span>)
                          : <span className="ttm-metric na">Không tính được</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          {row.alertLevel === 'NONE'
                            ? (row.r4gDate
                              ? <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM</span>
                              : <span className="ttm-empty-warning">—</span>)
                            : <span className={`ttm-badge ${ALERT_BADGE_CLASS[row.alertLevel]}`}>{row.alertLevel === 'EARLY' ? 'Cảnh báo sớm' : row.alertLevel === 'LATE' ? 'Cảnh báo muộn' : 'Fail TTM-CNTT'}</span>}
                          {row.ttmE2eAlertLevel === 'FAIL' && <span className="ttm-badge fail-e2e">Fail TTM-E2E</span>}
                        </div>
                      )}
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

      {alertHistoryEpicKey && (
        <AlertHistoryPanel key={alertHistoryEpicKey} epicKey={alertHistoryEpicKey} onClose={() => setAlertHistoryEpicKey(null)} />
      )}
    </div>
  );
}
