'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-alerts-15.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import type { EpicAlertAccessRole, EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import type { EpicAlertHistoryEntry } from '@/lib/epic-alert-history-service';
import type { EpicMilestoneHistoryEntry } from '@/lib/epic-milestone-history-service';
import type { AlertLevel } from '@/lib/ttm-rules';
import { ArrowSquareOut, Warning } from '@phosphor-icons/react';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';

const PAGE_SIZE = 20;

const EMPTY_ROWS: EpicAlertRowPhased[] = [];

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
  FAIL: 'fail',
  LATE: 'late-warning',
  EARLY: 'early-warning',
  NONE: '',
};

const ALERT_FILTER_OPTIONS: { label: string; value: AlertLevel | '' }[] = [
  { label: 'Tất cả cảnh báo', value: '' },
  { label: 'Cảnh báo sớm', value: 'EARLY' },
  { label: 'Cảnh báo muộn', value: 'LATE' },
  { label: 'Fail TTM-CNTT', value: 'FAIL' },
];

const ACCESS_ROLE_LABEL: Record<EpicAlertAccessRole, string> = {
  CBQL_PHONG: 'CBQL Phòng',
  LEAD: 'Lead',
  PM_SM: 'PM-SM',
};

const ACCESS_ROLE_NOTE: Record<EpicAlertAccessRole, string> = {
  CBQL_PHONG: 'Bạn thấy toàn bộ Epic của mọi dự án (vai trò CBQL Phòng).',
  LEAD: 'Bạn thấy Epic thuộc các dự án trong Domain nghiệp vụ được phân quyền (vai trò Lead).',
  PM_SM: 'Bạn chỉ thấy Epic thuộc các dự án được phân quyền làm PM-SM.',
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
function truncateSummary(value: string, maxLength = 70): string {
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
  actualFromDate, actualToDate, baselineFromDate, baselineToDate, elapsed, target,
}: {
  actualFromDate: string | null;
  actualToDate: string | null;
  baselineFromDate: string | null;
  baselineToDate: string | null;
  elapsed: number | null;
  target: number;
}) {
  const elapsedDays = elapsed ?? 0;
  const ratio = target > 0 ? elapsedDays / target : 0;
  const isOver = isPastBaseline(actualToDate, baselineToDate);
  const BASE_WIDTH = 56;
  // Hard cap in px (not just a ratio multiplier) so an Epic with an unusually long actual
  // duration can never stretch the strip wide enough to break the table's layout.
  const MAX_ACTUAL_WIDTH = 112;
  const actualWidth = Math.min(Math.max(6, ratio * BASE_WIDTH), MAX_ACTUAL_WIDTH);

  return (
    <TD className="ttm-metric">
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

function TtmCnttStrips({ row }: { row: EpicAlertRowPhased }) {
  return (
    <TtmMetricStrips
      actualFromDate={row.ttmActualFromDate}
      actualToDate={row.ttmActualToDate}
      baselineFromDate={row.t1StartDate}
      baselineToDate={row.targetR4gDate}
      elapsed={row.ttmActualElapsedWorkingDays}
      target={row.ttmCnttTargetWorkingDays}
    />
  );
}

/** T0 (release baseline's own source date) doubles as both stripes' start — same convention as
 * TTM-CNTT's Start Date. */
function TtmE2eStrips({ row }: { row: EpicAlertRowPhased }) {
  const t0 = row.stages.release.baselineSourceDate;
  return (
    <TtmMetricStrips
      actualFromDate={t0}
      actualToDate={row.ttmE2eActualToDate}
      baselineFromDate={t0}
      baselineToDate={row.stages.release.baselineDate}
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
      onClick={() => onOpen(row)}
    >
      <Warning weight="fill" size={16} />
    </button>
  );
}

function JiraLinkButton({ epicKey, viewIssueBaseUrl }: { epicKey: string; viewIssueBaseUrl: string }) {
  if (!viewIssueBaseUrl) return null;
  return (
    <a
      className="ttm-alert-history-trigger"
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

export default function EpicAlerts15Page() {
  const [data, setData] = useState<EpicAlertPhasedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectFilter, setProjectFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState<AlertLevel | ''>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
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
      setError('Không thể kết nối API Quản trị Epic.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup.
    void Promise.resolve().then(fetchData);
  }, []);

  const rows = data?.rows ?? EMPTY_ROWS;
  const projectOptions = useMemo(() => [...new Set(rows.map((row) => row.projectKey).filter(Boolean))].sort(), [rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((row) => row.currentStatus).filter(Boolean))].sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
    return (!projectFilter || row.projectKey === projectFilter)
      && (!alertFilter || row.alertLevel === alertFilter)
      && (!typeFilter || row.epicType === typeFilter)
      && (!statusFilter || row.currentStatus === statusFilter)
      && (!normalizedSearch || row.epicKey.toLocaleLowerCase('vi-VN').includes(normalizedSearch) || row.epicName.toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  }), [rows, projectFilter, alertFilter, typeFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="ttm-app">
      <p className="ttm-page-subtitle">
        Màn hình read-only theo các dự án được phân quyền. Cột trạng thái tách theo giai đoạn DESIGN/DEV/TEST/PENTEST/R4GOLIVE (baseline 20/30/30/10/10% TTM-CNTT, tính từ Start Date).
      </p>

      {data && (
        <div className="ttm-note">
          {ACCESS_ROLE_NOTE[data.accessRole]} Toàn bộ thông tin và tính toán cảnh báo đều dựa trên đợt import dữ liệu mới nhất.
        </div>
      )}
      {error && <div className="ttm-note" style={{ background: 'var(--ttm-danger-050)', borderColor: '#f3b3b3', color: 'var(--ttm-danger-700)' }}>{error}</div>}

      <section className="ttm-toolbar" aria-label="Bộ lọc Epic">
        <select className="ttm-select" aria-label="Dự án" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả dự án của tôi</option>
          {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <select className="ttm-select" aria-label="Cảnh báo" value={alertFilter} onChange={(event) => { setAlertFilter(event.target.value as AlertLevel | ''); setPage(1); }}>
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

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="Không có Epic phù hợp" description="Thử thay đổi bộ lọc." />
      ) : (
        <TableContainer>
          <Table className="min-w-[1440px]">
            <THead>
              <TR>
                <TH className="min-w-[180px] ttm-epic-col-sticky" title="issues.issue_key / issues.issue_name">Epic</TH>
                <TH title="import_rows.normalized_data_json->>'epicType' (fallback: issues.epic_complexity_type). Xanh lá = Epic đơn giản, nâu nhạt = Epic phức tạp">Type</TH>
                <TH className="min-w-[120px]" title="Tính toán (alertLevel) — không lưu trực tiếp trong CSDL">Nhận xét</TH>
                <TH title="Baseline (dòng trên) = Start Date + TTM-CNTT; Thực tế (dòng dưới) = Start Date → R4G Date (hoặc hôm nay nếu chưa có)">TTM-CNTT</TH>
                <TH title="Baseline (dòng trên) = T0 + TTM-E2E; Thực tế (dòng dưới) = T0 → Due Date (hoặc hôm nay nếu chưa có). T0 = Idea Approved Date, hoặc Start Date, hoặc ngày tạo Jira">TTM-E2E</TH>
                <TH title="issues.current_status">Status</TH>
                <TH title="issues.start_date">Start Date</TH>
                <TH className="min-w-[110px]" title="Baseline = Start Date + 20% TTM-CNTT (làm tròn ngày)">DESIGN</TH>
                <TH className="min-w-[110px]" title="Baseline = Start Date + (20%+30%) TTM-CNTT (làm tròn ngày)">DEV</TH>
                <TH className="min-w-[110px]" title="Baseline = Start Date + (20%+30%+30%) TTM-CNTT (làm tròn ngày)">TEST</TH>
                <TH className="min-w-[110px]" title="Baseline = Start Date + (20%+30%+30%+10%) TTM-CNTT (làm tròn ngày)">PENTEST</TH>
                <TH className="min-w-[110px]" title="Baseline = Start Date + 100% TTM-CNTT; dòng dưới = issues.r4g_date">R4GOLIVE</TH>
                <TH className="min-w-[118px]" title="Baseline = Ngày duyệt ý tưởng (hoặc Ngày epic created nếu không có) + 20 ngày làm việc, không tính holiday. Dòng dưới = issues.due_date">Release</TH>
              </TR>
            </THead>
            <TBody>
              {pageRows.map((row: EpicAlertRowPhased) => {
                const isMissingCore = !row.t1StartDate;
                return (
                  <TR key={row.epicKey} className={isMissingCore ? 'missing-row' : undefined}>
                    <TD className="ttm-epic-col-sticky">
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryRow} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <button
                        type="button"
                        className="ttm-epic-key"
                        onClick={() => setBrowsingEpicKey(row.epicKey)}
                        title="Duyệt Epic (Epic Browser)"
                      >
                        {row.epicKey}
                      </button>
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
                    <TD><EpicTypeDot epicType={row.epicType} /></TD>
                    {isMissingCore ? (
                      <>
                        <TD>{row.currentStatus === 'To Do' ? <span className="ttm-empty-warning">—</span> : <span className="ttm-badge fail">Thiếu Start Date</span>}</TD>
                        <TD className="ttm-metric na">Không tính được</TD>
                        <TD className="ttm-metric na">Không tính được</TD>
                        <TD><StatusBadge status={row.currentStatus} /></TD>
                        <TD><span className="ttm-metric na">Không có</span></TD>
                        <TD colSpan={6} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT do thiếu dữ liệu bắt buộc.</TD>
                      </>
                    ) : (
                      <>
                        <TD>
                          {row.alertLevel === 'NONE'
                            ? (row.r4gDate
                              ? <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM</span>
                              : <span className="ttm-empty-warning">—</span>)
                            : <span className={`ttm-badge ${ALERT_BADGE_CLASS[row.alertLevel]}`}>{row.alertLevel === 'EARLY' ? 'Cảnh báo sớm' : row.alertLevel === 'LATE' ? 'Cảnh báo muộn' : 'Fail TTM-CNTT'}</span>}
                        </TD>
                        <TtmCnttStrips row={row} />
                        <TtmE2eStrips row={row} />
                        <TD><StatusBadge status={row.currentStatus} /></TD>
                        <TD className="ttm-phase-cell pass">{formatDate(row.t1StartDate)}</TD>
                        <PhaseStageCell cell={row.stages.design} />
                        <PhaseStageCell cell={row.stages.dev} />
                        <PhaseStageCell cell={row.stages.test} />
                        <PhaseStageCell cell={row.stages.pentest} />
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

      {filteredRows.length > 0 && (
        <nav className="ttm-pagination" aria-label="Điều hướng phân trang">
          <button type="button" className="ttm-button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹ Trước</button>
          <span className="ttm-pagination-label">Trang</span>
          <select className="ttm-select" aria-label="Chọn trang" value={currentPage} onChange={(event) => setPage(Number(event.target.value))}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
            ))}
          </select>
          <span className="ttm-pagination-label">/ {totalPages}</span>
          <button type="button" className="ttm-button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Sau ›</button>
        </nav>
      )}

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
