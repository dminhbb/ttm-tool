'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-alerts.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell } from '@/lib/epic-alert-types';
import type { EpicAlertHistoryEntry } from '@/lib/epic-alert-history-service';
import type { AlertLevel } from '@/lib/ttm-rules';
import { ArrowSquareOut, Circle, Stack, Warning } from '@phosphor-icons/react';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';

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

const EPIC_TYPE_ICON: Record<string, { icon: typeof Circle; label: string }> = {
  SIMPLE: { icon: Circle, label: 'Epic đơn giản' },
  COMPLEX: { icon: Stack, label: 'Epic phức tạp' },
};

function EpicTypeIcon({ epicType }: { epicType: string | null }) {
  const entry = epicType ? EPIC_TYPE_ICON[epicType] : undefined;
  if (!entry) return <span className="ttm-empty-warning">-</span>;
  const Icon = entry.icon;
  return (
    <span title={entry.label}>
      <Icon weight="fill" size={18} className="ttm-epic-type-icon" />
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
  const ratio = target > 0 ? elapsed / target : 0;
  // Tied to the same alertLevel shown in "Nhận xét" (not re-derived from elapsed/target here) so
  // the stripe color can never disagree with the Fail TTM badge at the day-boundary — elapsed is a
  // working-day count (reaching the target day still reads as "not yet over"), while alertLevel's
  // FAIL already fires that same day (see computeTtmAlert in ttm-rules.ts).
  const isOver = row.alertLevel === 'FAIL';
  const BASE_WIDTH = 56;
  const actualWidth = Math.max(6, Math.min(ratio, 2) * BASE_WIDTH);
  const fromDate = row.t1StartDate;

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
      onClick={() => onOpen(row.epicKey)}
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

  const [projectFilter, setProjectFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState<AlertLevel | ''>('');
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
  }, []);

  const rows = data?.rows ?? EMPTY_EPIC_ALERT_ROWS;
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
      <p className="ttm-page-subtitle">Màn hình read-only theo các dự án được phân quyền. Không có hành động ghi ngược Jira.</p>

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
          <Table className="min-w-[1300px]">
            <THead>
              <TR>
                <TH className="min-w-[180px]" title="issues.issue_key / issues.issue_name">Epic</TH>
                <TH title="import_rows.normalized_data_json->>'epicType' (fallback: issues.epic_complexity_type)">Loại Epic</TH>
                <TH title="issues.start_date">Start Date</TH>
                <TH title="Tính từ issues.start_date + issues.epic_complexity_type (số ngày làm việc thực tế / chuẩn)">TTM-CNTT</TH>
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
                  <TR key={row.epicKey} className={isMissingCore ? 'missing-row' : undefined}>
                    <TD>
                      <AlertHistoryButton row={row} onOpen={setAlertHistoryEpicKey} />
                      <JiraLinkButton epicKey={row.epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <span className="ttm-epic-key">{row.epicKey}</span>
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
                    {isMissingCore ? (
                      <>
                        <TD><span className="ttm-metric na">Không có</span></TD>
                        <TD className="ttm-metric na">Không tính được</TD>
                        <TD><StatusBadge status={row.currentStatus} /></TD>
                        <TD>{row.currentStatus === 'To Do' ? <span className="ttm-empty-warning">—</span> : <span className="ttm-badge fail">Thiếu Start Date</span>}</TD>
                        <TD colSpan={4} className="ttm-metric na">Chưa thể tính lịch TTM-CNTT do thiếu dữ liệu bắt buộc.</TD>
                      </>
                    ) : (
                      <>
                        <TD>{formatDate(row.t1StartDate)}</TD>
                        <TtmCnttStrips row={row} />
                        <TD><StatusBadge status={row.currentStatus} /></TD>
                        <TD>
                          {row.alertLevel === 'NONE'
                            ? (row.r4gDate
                              ? <span className="ttm-badge-achieved" title="Epic hoàn thành TTM-CNTT đúng hạn theo rule">Đạt TTM</span>
                              : <span className="ttm-empty-warning">—</span>)
                            : <span className={`ttm-badge ${ALERT_BADGE_CLASS[row.alertLevel]}`}>{row.alertLevel === 'EARLY' ? 'Cảnh báo sớm' : row.alertLevel === 'LATE' ? 'Cảnh báo muộn' : 'Fail TTM-CNTT'}</span>}
                        </TD>
                        <StagePill cell={row.stages.design} />
                        <StagePill cell={row.stages.inProgress} />
                        <Ready4GoliveCell row={row} />
                        <StagePill cell={row.stages.release} />
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

      {alertHistoryEpicKey && (
        <AlertHistoryPanel key={alertHistoryEpicKey} epicKey={alertHistoryEpicKey} onClose={() => setAlertHistoryEpicKey(null)} />
      )}
    </div>
  );
}
