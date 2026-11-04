'use client';

import * as React from 'react';
import '@/app/ttm-shared.css';
import { ArrowLeft, ArrowSquareOut, CaretDown, CaretLineRight, CaretRight, CaretUp, CaretUpDown, Checks, Lightning, Warning } from '@phosphor-icons/react';
import type { EarlyStartFailEpic, EarlyStartSummary } from '@/lib/early-start-report';
import { compareWorkflowStatus } from '@/lib/scoring/derive';
import { formatTtmPassPct, formatTtmPct1, hasTtmVerdict, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { cn } from '@/lib/utils';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { EpicMarkCell } from '@/components/epic-mark/EpicMarkCell';
import { EpicMarkModal } from '@/components/epic-mark/EpicMarkModal';
import { TtmBlackListDot } from '@/components/ui/TtmBlackListDot';
import { getStatusTextColorClass } from './EpicReportScreen';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04). TTM-CNTT (QLDA) as every screen shows it, next to the same ratio with
 * the Epics carrying the recommendation "Start sớm" judged from Epic_Real_Start_Date (Scoring Service, rule
 * early-start). The widgets come from the daily cache of the viewer's scope (built on the first visit of the day); the
 * table of the "Start sớm" Epics that fail from that date is read live, filtered / sorted / paged here.
 */

const PAGE_SIZE = 30;

interface ReportPayload {
  summary: EarlyStartSummary & { cacheDate: string | null; computedAt: string | null; status: string };
  failedEpics: EarlyStartFailEpic[];
  lastAggregatedAt: string | null;
}

type FetchResult = { report?: ReportPayload; error?: string };

async function requestReport(): Promise<FetchResult> {
  try {
    const response = await fetch('/api/reports/early-start');
    const data = (await response.json()) as ReportPayload & { error?: string };
    return response.ok ? { report: data } : { error: data.error || 'Không thể tải Báo cáo Epic start sớm.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Không thể tải Báo cáo Epic start sớm.' };
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function signed(value: number, unit: 'pct' | 'count'): string {
  if (value === 0) return unit === 'pct' ? '±0 điểm %' : '±0 Epic';
  const sign = value > 0 ? '+' : '−';
  return unit === 'pct' ? `${sign}${formatTtmPct1(Math.abs(value))} điểm %` : `${sign}${Math.abs(value)} Epic`;
}

function ratioCaption(summary: TtmCnttSummary): string {
  return hasTtmVerdict(summary) ? `Đạt ${summary.pass} / mẫu số ${summary.denominator} Epic` : 'Chưa có Epic nào được kết luận';
}

function Widget({ caption, delta, title, tone, value }: { title: string; value: string; caption: string; delta?: string; tone: 'brand' | 'danger' }) {
  return (
    <div className="flex flex-col gap-1 border border-fb-border bg-white p-4">
      <span className="text-[11px] font-bold uppercase tracking-wide text-fb-text-secondary">{title}</span>
      <span className={cn('text-3xl font-extrabold tabular-nums', tone === 'danger' ? 'text-status-danger' : 'text-[var(--color-text-brand)]')}>{value}</span>
      <span className="text-[11px] text-fb-text-secondary">{caption}</span>
      {delta && <span className="text-[11px] font-bold text-black">So với chỉ số hiện tại: {delta}</span>}
    </div>
  );
}

// ---- Sorting -------------------------------------------------------------------------------------------------------

type SortKey = 'projectKey' | 'epicKey' | 'domainName' | 'ownerName' | 'status' | 'ideaApprovedDate' | 'startDate' | 'realStartDate' | 'daysEarly' | 'r4gDate' | 'releasedDate';
interface SortState { key: SortKey; direction: 'asc' | 'desc' }

function compareBy(key: SortKey, a: EarlyStartFailEpic, b: EarlyStartFailEpic): number {
  if (key === 'daysEarly') return a.daysEarly - b.daysEarly;
  if (key === 'status') return compareWorkflowStatus(a.status, b.status);
  if (key === 'epicKey') return a.epicKey.localeCompare(b.epicKey, undefined, { numeric: true });
  const left = a[key] ?? '';
  const right = b[key] ?? '';
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return left.localeCompare(right, 'vi');
}

function SortHeader({ children, className, onSort, sortKey, sort, title }: { children: React.ReactNode; className?: string; onSort: (key: SortKey) => void; sortKey: SortKey; sort: SortState | null; title?: string }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? CaretUpDown : sort.direction === 'asc' ? CaretUp : CaretDown;
  return (
    <th className={cn('whitespace-nowrap border-r border-fb-border px-2 py-1.5', className)} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-bold text-black hover:text-[var(--color-text-brand)]">
        {children}
        <Icon className={cn('size-3 shrink-0', active ? 'text-[var(--color-text-brand)]' : 'text-fb-text-placeholder')} weight="bold" />
      </button>
    </th>
  );
}

// ---- Table ---------------------------------------------------------------------------------------------------------

function DateText({ value, className, icon }: { value: string | null; className?: string; icon?: React.ReactNode }) {
  if (!value) return <>-</>;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {icon}
      <span>{value}</span>
    </span>
  );
}

interface FailTableProps {
  items: EarlyStartFailEpic[];
  jiraViewIssueBaseUrl: string;
  offset: number;
  onOpenEpic: (epicKey: string) => void;
  onOpenReview: (epicKey: string) => void;
  onSort: (key: SortKey) => void;
  sort: SortState | null;
}

function FailTable({ items, jiraViewIssueBaseUrl, offset, onOpenEpic, onOpenReview, onSort, sort }: FailTableProps) {
  const cell = 'px-2 py-1.5 border-r border-fb-border';
  const header = { onSort, sort };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1160px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="select-none border-b border-fb-border bg-fb-surface-muted font-bold text-black">
            <th className="w-7 border-r border-fb-border px-2 py-1.5 text-center">STT</th>
            <SortHeader {...header} sortKey="projectKey" className="w-14">Project</SortHeader>
            <SortHeader {...header} sortKey="epicKey" className="max-w-[220px]">Epic Key / Summary</SortHeader>
            <th className="w-[1%] min-w-[44px] border-r border-fb-border px-2 py-1.5 text-center" title="Epic có comment (cờ: cam = Giao việc To do, xanh lá = Done) và/hoặc bạn đã ẩn (mắt gạch chéo) — bấm để mở Review Notes">REVIEW</th>
            <SortHeader {...header} sortKey="domainName">Domain</SortHeader>
            <SortHeader {...header} sortKey="ownerName">PM/SM</SortHeader>
            <SortHeader {...header} sortKey="status" className="w-20">Status</SortHeader>
            <SortHeader {...header} sortKey="ideaApprovedDate" className="min-w-[86px]">Start E2E</SortHeader>
            <SortHeader {...header} sortKey="startDate" className="min-w-[86px]">Start CNTT</SortHeader>
            <SortHeader {...header} sortKey="realStartDate" className="min-w-[110px]">Epic_Real_Start_Date</SortHeader>
            <SortHeader {...header} sortKey="daysEarly" title="Start Date − Epic_Real_Start_Date (ngày lịch)">Chênh lệch</SortHeader>
            <SortHeader {...header} sortKey="r4gDate" className="min-w-[86px]">R4G Date</SortHeader>
            <SortHeader {...header} sortKey="releasedDate" className="min-w-[86px] border-r-0">Released Date</SortHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-fb-border">
          {items.map((item, index) => {
            const jiraHref = jiraViewIssueBaseUrl ? `${jiraViewIssueBaseUrl}${encodeURIComponent(item.epicKey)}` : null;
            return (
              <tr key={item.epicKey} className="hover:bg-fb-surface-muted">
                <td className={cn(cell, 'text-center font-mono text-fb-text-placeholder')}>{offset + index + 1}</td>
                <td className={cn(cell, 'font-mono font-bold text-black')}>{item.projectKey}</td>
                <td className={cell}>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenEpic(item.epicKey)}
                      className="text-left font-mono text-[11px] font-bold text-[var(--color-text-brand)] hover:underline"
                      title={`Duyệt Epic — ${item.epicKey}`}
                    >
                      {item.epicKey}
                    </button>
                    <Warning className="size-3 shrink-0 text-status-danger" weight="fill" aria-label="Fail TTM-CNTT start sớm" />
                    {item.ttmBlackListed && <TtmBlackListDot />}
                    {jiraHref && (
                      <a href={jiraHref} target="_blank" rel="noopener noreferrer" className="text-fb-text-placeholder hover:text-[var(--color-text-brand)]" title="Mở Epic trên Jira (cửa sổ mới)">
                        <ArrowSquareOut className="size-3 shrink-0" weight="bold" />
                      </a>
                    )}
                  </div>
                  <div className="max-w-[220px] truncate text-[11px] text-fb-text-secondary" title={item.ruleGroupName ? `${item.summary}\nNhóm rule: ${item.ruleGroupName}` : item.summary}>
                    {item.summary}
                  </div>
                </td>
                <td className={cn(cell, 'text-center')}><EpicMarkCell onOpen={onOpenReview} row={item} /></td>
                <td className={cn(cell, 'whitespace-nowrap')}>{item.domainName || '-'}</td>
                <td className={cell}>{item.ownerName || '-'}</td>
                <td className={cn(cell, 'font-bold', getStatusTextColorClass(item.status))}>{item.status}</td>
                <td className={cn(cell, 'whitespace-nowrap font-mono')}>
                  <DateText value={item.ideaApprovedDate} icon={<CaretRight className="size-3 shrink-0 text-[var(--color-text-secondary)]" weight="bold" />} />
                </td>
                <td className={cn(cell, 'whitespace-nowrap font-mono')}>
                  <DateText value={item.startDate} className="font-bold text-[var(--early-start-t1-color)]" icon={<CaretLineRight className="size-3 shrink-0 text-[var(--color-text-secondary)]" weight="bold" />} />
                </td>
                <td className={cn(cell, 'whitespace-nowrap font-mono')} title={item.earlyTargetDate ? `Target TTM-CNTT (QLDA) tính từ ngày này: ${item.earlyTargetDate}` : undefined}>
                  <DateText value={item.realStartDate} className="font-bold text-[var(--early-start-real-color)]" />
                </td>
                <td className={cn(cell, 'whitespace-nowrap text-right font-mono font-bold text-black')}>{item.daysEarly} ngày</td>
                <td className={cn(cell, 'whitespace-nowrap font-mono')}>
                  {item.r4gDate ? <DateText value={item.r4gDate} icon={<Checks className="size-3 shrink-0 text-black" weight="bold" />} /> : <span className="font-semibold text-status-danger">Thiếu thông tin</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                  {item.releasedDate ? <DateText value={item.releasedDate} icon={<Checks className="size-3 shrink-0 text-black" weight="bold" />} /> : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Filters -------------------------------------------------------------------------------------------------------

interface Filters { domain: string; project: string; pmSm: string; status: string }
const NO_FILTERS: Filters = { domain: '', project: '', pmSm: '', status: '' };

function filterOptions(epics: readonly EarlyStartFailEpic[]) {
  const sorted = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
  return {
    domain: sorted(epics.map((epic) => epic.domainName)),
    project: sorted(epics.map((epic) => epic.projectKey)),
    pmSm: sorted(epics.flatMap((epic) => epic.ownerNames)),
    status: [...new Set(epics.map((epic) => epic.status).filter(Boolean))].sort(compareWorkflowStatus),
  };
}

function matches(epic: EarlyStartFailEpic, filters: Filters): boolean {
  return (!filters.domain || epic.domainName === filters.domain)
    && (!filters.project || epic.projectKey === filters.project)
    && (!filters.pmSm || epic.ownerNames.includes(filters.pmSm))
    && (!filters.status || epic.status === filters.status);
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <select aria-label={label} className={cn('ttm-select', value && 'has-filter')} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}: Tất cả</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

// ---- Screen --------------------------------------------------------------------------------------------------------

export function EarlyStartReportScreen({ onBack }: { onBack: () => void }) {
  const jiraViewIssueBaseUrl = useJiraViewIssueUrl();
  const [report, setReport] = React.useState<ReportPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [sort, setSort] = React.useState<SortState | null>(null);
  const [browsingEpicKey, setBrowsingEpicKey] = React.useState<string | null>(null);
  const [reviewEpicKey, setReviewEpicKey] = React.useState<string | null>(null);

  const applyResult = React.useCallback((result: FetchResult) => {
    if (result.report) {
      setReport(result.report);
      setError(null);
    } else {
      setError(result.error ?? 'Không thể tải Báo cáo Epic start sớm.');
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let active = true;
    void requestReport().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const failedEpics = React.useMemo(() => report?.failedEpics ?? [], [report]);
  const options = React.useMemo(() => filterOptions(failedEpics), [failedEpics]);
  const visibleEpics = React.useMemo(() => {
    const filtered = failedEpics.filter((epic) => matches(epic, filters));
    if (!sort) return filtered; // the server's default order: Domain → Project → biggest gap
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareBy(sort.key, a, b) || a.epicKey.localeCompare(b.epicKey, undefined, { numeric: true }));
  }, [failedEpics, filters, sort]);
  const totalPages = Math.max(1, Math.ceil(visibleEpics.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = visibleEpics.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const summary = report?.summary ?? null;
  const pctDelta = summary && hasTtmVerdict(summary.current) && hasTtmVerdict(summary.earlyStart) ? summary.earlyStart.pctPrecise - summary.current.pctPrecise : null;
  const setFilter = (key: keyof Filters) => (value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  // asc → desc → back to the default order.
  const onSort = (key: SortKey) => {
    setSort((current) => (current?.key !== key ? { key, direction: 'asc' } : current.direction === 'asc' ? { key, direction: 'desc' } : null));
    setPage(1);
  };
  const hasFilter = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6 bg-white p-4 text-black md:p-6">
      <InfoBannerDisplay pathname="/reports" />

      <div className="rounded-none border-2 border-fb-border bg-fb-control-hover p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="grid size-8 place-items-center border border-fb-border bg-white text-black hover:bg-fb-surface-muted"
            title="Quay lại Báo cáo Epic (beta 2)"
            aria-label="Quay lại Báo cáo Epic (beta 2)"
          >
            <ArrowLeft className="size-4" weight="bold" />
          </button>
          <div className="grid size-8 place-items-center bg-[var(--color-text-brand)] text-white">
            <Lightning className="size-4" weight="bold" />
          </div>
          <div>
            <h1 className="text-base font-bold text-black">Báo cáo Epic start sớm</h1>
            <p className="text-[11px] font-medium text-fb-text-secondary">
              TTM-CNTT (QLDA) trong phạm vi tính, lớp dữ liệu mới nhất{summary?.dataLayerDate ? ` (${summary.dataLayerDate})` : ''}. Epic có khuyến nghị &quot;Start sớm&quot; được tính lại với Start Date = Epic_Real_Start_Date.
              {summary?.computedAt ? ` Số liệu widget: cache lúc ${formatDateTime(summary.computedAt)}.` : ''}
            </p>
          </div>
        </div>
      </div>

      {error && <div className="border border-status-danger bg-status-danger-soft px-3 py-2 text-xs font-semibold text-status-danger">{error}</div>}

      {/* Panel 1 — 4 widgets (daily cache) */}
      <section aria-label="Chỉ số TTM-CNTT" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Widget title="Chỉ số TTM-CNTT" tone="brand" value={summary ? formatTtmPassPct(summary.current) : '…'} caption={summary ? ratioCaption(summary.current) : 'Đang tải…'} />
        <Widget title="Số Epic fail TTM-CNTT" tone="danger" value={summary ? String(summary.current.fail) : '…'} caption="Epic Fail TTM-CNTT (QLDA) trong phạm vi tính" />
        <Widget
          title="Chỉ số TTM-CNTT start sớm"
          tone="brand"
          value={summary ? formatTtmPassPct(summary.earlyStart) : '…'}
          caption={summary ? ratioCaption(summary.earlyStart) : 'Đang tải…'}
          delta={pctDelta === null ? undefined : signed(pctDelta, 'pct')}
        />
        <Widget
          title="Số Epic fail TTM-CNTT start sớm"
          tone="danger"
          value={summary ? String(summary.earlyStart.fail) : '…'}
          caption="Fail khi Epic start sớm tính từ Epic_Real_Start_Date"
          delta={summary ? signed(summary.earlyStart.fail - summary.current.fail, 'count') : undefined}
        />
      </section>

      {/* Panel 2 — Epic "Start sớm" that fail from their real start date */}
      <section className="overflow-hidden rounded-none border border-black">
        <div className="flex flex-col justify-between gap-1 border-b border-fb-border bg-fb-control-hover px-3 py-2 text-xs font-bold text-black sm:flex-row sm:items-center">
          <span>DANH SÁCH CÁC EPIC FAIL TTM-CNTT START SỚM</span>
          <span className="bg-[var(--color-text-brand)] px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">
            {hasFilter ? `${visibleEpics.length} / ${failedEpics.length}` : `Tổng số: ${failedEpics.length}`} Epic
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-fb-border bg-white px-3 py-2">
          <FilterSelect label="Domain" options={options.domain} value={filters.domain} onChange={setFilter('domain')} />
          <FilterSelect label="Project" options={options.project} value={filters.project} onChange={setFilter('project')} />
          <FilterSelect label="PM/SM" options={options.pmSm} value={filters.pmSm} onChange={setFilter('pmSm')} />
          <FilterSelect label="Status" options={options.status} value={filters.status} onChange={setFilter('status')} />
          {hasFilter && (
            <button type="button" className="ttm-button" onClick={() => { setFilters(NO_FILTERS); setPage(1); }}>Xoá lọc</button>
          )}
        </div>
        {loading && !report ? (
          <div className="bg-fb-surface-muted p-3 text-center text-[11px] text-fb-text-placeholder">Đang tải…</div>
        ) : visibleEpics.length === 0 ? (
          <div className="bg-fb-surface-muted p-3 text-center text-[11px] text-fb-text-placeholder">Không có Epic nào trong danh sách này.</div>
        ) : (
          <FailTable
            items={pageItems}
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            offset={(currentPage - 1) * PAGE_SIZE}
            onOpenEpic={setBrowsingEpicKey}
            onOpenReview={setReviewEpicKey}
            onSort={onSort}
            sort={sort}
          />
        )}
      </section>

      {/* Same pagination bar as Quản trị Epic. */}
      <div className="ttm-pagination-row">
        <div className="ttm-report-date">Dữ liệu cập nhật lần cuối: <b>{formatDateTime(report?.lastAggregatedAt ?? null)}</b></div>
        {visibleEpics.length > 0 && (
          <nav className="ttm-pagination flex-nowrap whitespace-nowrap" aria-label="Điều hướng phân trang">
            <button type="button" className="ttm-button" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>‹ Trước</button>
            <span className="ttm-pagination-label whitespace-nowrap">Trang</span>
            <select className="ttm-select" aria-label="Chọn trang" value={currentPage} onChange={(event) => setPage(Number(event.target.value))}>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
              ))}
            </select>
            <span className="ttm-pagination-label whitespace-nowrap select-none">/&nbsp;{totalPages}</span>
            <button type="button" className="ttm-button" disabled={currentPage >= totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>Sau ›</button>
          </nav>
        )}
      </div>

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
      {reviewEpicKey && (
        <EpicMarkModal
          key={reviewEpicKey}
          epicKey={reviewEpicKey}
          onChanged={() => { void requestReport().then(applyResult); }}
          onClose={() => setReviewEpicKey(null)}
        />
      )}
    </div>
  );
}
