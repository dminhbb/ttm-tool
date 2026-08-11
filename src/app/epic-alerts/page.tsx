'use client';

import { useEffect, useMemo, useState } from 'react';
import './epic-alerts.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { EpicAlertAccessRole, EpicAlertResponse, EpicAlertRow, StageCell } from '@/lib/epic-alert-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { CheckCircle, Circle, Stack } from '@phosphor-icons/react';

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

const STAGE_VARIANT_REMAINING: Record<string, number> = { d1: 1, d2: 2, d3: 3, overdue: 0 };

function stageHighlightClass(cell: StageCell, threshold: number): string {
  const remaining = STAGE_VARIANT_REMAINING[cell.pillVariant];
  if (remaining === undefined) return '';
  if (cell.pillVariant === 'overdue') return 'hl-overdue';
  if (remaining > threshold) return '';
  return `hl-${cell.pillVariant}`;
}

function StagePill({ cell, threshold, doneDisplay = 'icon' }: { cell: StageCell; threshold: number; doneDisplay?: 'icon' | 'date' }) {
  if (cell.pillVariant === 'done') {
    if (doneDisplay === 'date' && cell.dateLabel) {
      return (
        <TD className={stageHighlightClass(cell, threshold)} title="Ngày Ready4Golive thực tế">
          <span className="ttm-stage-pill done">{formatDate(cell.dateLabel)}</span>
        </TD>
      );
    }
    return (
      <TD className={stageHighlightClass(cell, threshold)} title={cell.dateLabel ? `Hoàn thành: ${formatDate(cell.dateLabel)}` : cell.planLabel}>
        <CheckCircle weight="fill" size={18} className="ttm-stage-done-icon" />
      </TD>
    );
  }
  return (
    <TD className={stageHighlightClass(cell, threshold)} title={cell.isCurrentStage ? 'Đang xử lý (status hiện tại của epic)' : undefined}>
      <div className="ttm-stage-plan">{cell.planLabel}</div>
      <span className={`ttm-stage-pill ${cell.pillVariant}`}>{cell.pillLabel}</span>
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
  const elapsed = row.ttmCnttElapsedWorkingDays ?? 0;
  const ratio = target > 0 ? elapsed / target : 0;
  const isOver = elapsed > target;
  const BASE_WIDTH = 56;
  const actualWidth = Math.max(6, Math.min(ratio, 2) * BASE_WIDTH);
  const actualEnd = row.r4gDate ?? new Date().toISOString().slice(0, 10);

  return (
    <TD className="ttm-metric">
      <div className="ttm-strip-wrap" title={`${elapsed}/${target} ngày làm việc`}>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.t1StartDate)}</span>
          <span className="ttm-strip-track" style={{ width: `${BASE_WIDTH}px` }} />
          <span className="ttm-strip-date">{formatDate(row.targetR4gDate)}</span>
        </div>
        <div className="ttm-strip-row">
          <span className="ttm-strip-date">{formatDate(row.t1StartDate)}</span>
          <span className={`ttm-strip-track actual ${isOver ? 'over' : 'under'}`} style={{ width: `${actualWidth}px` }} />
          <span className="ttm-strip-date">{formatDate(actualEnd)}</span>
        </div>
      </div>
    </TD>
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
  const [threshold, setThreshold] = useState(3);
  const [search, setSearch] = useState('');

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
        <select className="ttm-select" aria-label="Dự án" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
          <option value="">Tất cả dự án của tôi</option>
          {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <select className="ttm-select" aria-label="Cảnh báo" value={alertFilter} onChange={(event) => setAlertFilter(event.target.value as AlertLevel | '')}>
          {ALERT_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className="ttm-select" aria-label="Loại Epic" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">Tất cả loại Epic</option>
          <option value="SIMPLE">Epic đơn giản</option>
          <option value="COMPLEX">Epic phức tạp</option>
        </select>
        <select className="ttm-select" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">Tất cả status</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select className="ttm-select" aria-label="Ngưỡng highlight" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))}>
          <option value={3}>Ngưỡng highlight: ≤ 3 ngày</option>
          <option value={2}>≤ 2 ngày</option>
          <option value={1}>≤ 1 ngày</option>
        </select>
        <input className="ttm-field" type="search" aria-label="Tìm Epic Key hoặc Epic Name" placeholder="Tìm Epic Key hoặc Epic Name…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{data ? formatDateTime(data.lastAggregatedAt) : '—'}</b></div>
      </section>

      <section className="ttm-legend" aria-label="Chú thích màu">
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-d0)' }} />Quá hạn</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-d1)' }} />Còn 1 ngày</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-d2)' }} />Còn 2 ngày</span>
        <span className="ttm-legend-item"><i className="ttm-legend-dot" style={{ background: 'var(--ttm-d3)' }} />Còn 3 ngày</span>
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
              {filteredRows.map((row: EpicAlertRow) => {
                const isMissingCore = !row.t1StartDate;
                return (
                  <TR key={row.epicKey} className={isMissingCore ? 'missing-row' : undefined}>
                    <TD>
                      <span className="ttm-epic-key">{row.epicKey}</span>
                      <span className="ttm-source-tag">{row.sourceType}</span>
                      <span className="ttm-project-tag">
                        {row.projectKey}{row.domainName ? ` · ${row.domainName}` : ''}{row.ownerName ? ` · Owner: ${row.ownerName}` : ''}
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
                        <StagePill cell={row.stages.design} threshold={threshold} />
                        <StagePill cell={row.stages.inProgress} threshold={threshold} />
                        <StagePill cell={row.stages.r4g} threshold={threshold} doneDisplay="date" />
                        <StagePill cell={row.stages.release} threshold={threshold} />
                      </>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <p className="ttm-page-subtitle" style={{ marginTop: 12 }}>
        Hiển thị {filteredRows.length} / {rows.length} Epic{data ? ` — vai trò: ${ACCESS_ROLE_LABEL[data.accessRole]}` : ''}.
      </p>
    </div>
  );
}
