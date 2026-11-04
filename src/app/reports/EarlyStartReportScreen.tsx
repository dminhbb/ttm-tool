'use client';

import * as React from 'react';
import { ArrowLeft, ArrowSquareOut, ArrowsClockwise, CaretLineRight, CaretRight, Checks, Lightning, Warning } from '@phosphor-icons/react';
import type { EarlyStartFailEpic, EarlyStartReport } from '@/lib/early-start-report';
import { formatTtmPassPct, formatTtmPct1, hasTtmVerdict, type TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { cn } from '@/lib/utils';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { Pagination } from '@/components/ui/Pagination';
import { TtmBlackListDot } from '@/components/ui/TtmBlackListDot';
import { getStatusTextColorClass } from './EpicReportScreen';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04). TTM-CNTT (QLDA) as every screen shows it, next to the same ratio with
 * the Epics carrying the recommendation "Start sớm" judged from Epic_Real_Start_Date (Scoring Service, rule
 * early-start) — all read from the Epic row cache (newest data layer, the viewer's report scope). Panel 2 lists the
 * "Start sớm" Epics that fail when judged from that date.
 */

const PAGE_SIZE = 30;

type ReportResponse = EarlyStartReport & { error?: string };
type FetchResult = { report?: EarlyStartReport; error?: string };

async function requestReport(): Promise<FetchResult> {
  try {
    const response = await fetch('/api/reports/early-start');
    const data = (await response.json()) as ReportResponse;
    return response.ok ? { report: data } : { error: data.error || 'Không thể tải Báo cáo Epic start sớm.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Không thể tải Báo cáo Epic start sớm.' };
  }
}

function signed(value: number, digits: 'pct' | 'count'): string {
  if (value === 0) return digits === 'pct' ? '±0 điểm %' : '±0 Epic';
  const sign = value > 0 ? '+' : '−';
  return digits === 'pct' ? `${sign}${formatTtmPct1(Math.abs(value))} điểm %` : `${sign}${Math.abs(value)} Epic`;
}

interface WidgetProps {
  title: string;
  value: string;
  caption: string;
  delta?: string;
  tone: 'brand' | 'danger';
}

function Widget({ caption, delta, title, tone, value }: WidgetProps) {
  return (
    <div className="flex flex-col gap-1 border border-fb-border bg-white p-4">
      <span className="text-[11px] font-bold uppercase tracking-wide text-fb-text-secondary">{title}</span>
      <span className={cn('text-3xl font-extrabold tabular-nums', tone === 'danger' ? 'text-status-danger' : 'text-[var(--color-text-brand)]')}>{value}</span>
      <span className="text-[11px] text-fb-text-secondary">{caption}</span>
      {delta && <span className="text-[11px] font-bold text-black">So với chỉ số hiện tại: {delta}</span>}
    </div>
  );
}

function ratioCaption(summary: TtmCnttSummary): string {
  return hasTtmVerdict(summary) ? `Đạt ${summary.pass} / mẫu số ${summary.denominator} Epic` : 'Chưa có Epic nào được kết luận';
}

function DateText({ value, className, icon }: { value: string | null; className?: string; icon?: React.ReactNode }) {
  if (!value) return <>-</>;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {icon}
      <span>{value}</span>
    </span>
  );
}

function FailTable({ items, jiraViewIssueBaseUrl, offset, onOpenEpic }: { items: EarlyStartFailEpic[]; jiraViewIssueBaseUrl: string; offset: number; onOpenEpic: (epicKey: string) => void }) {
  const head = 'px-2 py-1.5 whitespace-nowrap border-r border-fb-border';
  const cell = 'px-2 py-1.5 border-r border-fb-border';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="select-none border-b border-fb-border bg-fb-surface-muted font-bold text-black">
            <th className={cn(head, 'w-7 text-center')}>STT</th>
            <th className={cn(head, 'w-14')}>Project</th>
            <th className="max-w-[220px] border-r border-fb-border px-2 py-1.5">Epic Key / Summary</th>
            <th className={head}>Domain</th>
            <th className={head}>PM/SM</th>
            <th className={cn(head, 'w-20')}>Status</th>
            <th className={cn(head, 'min-w-[86px]')}>Start E2E</th>
            <th className={cn(head, 'min-w-[86px]')}>Start CNTT</th>
            <th className={cn(head, 'min-w-[110px]')}>Epic_Real_Start_Date</th>
            <th className={cn(head, 'text-right')}>Chênh lệch</th>
            <th className={cn(head, 'min-w-[86px]')}>R4G Date</th>
            <th className="min-w-[86px] whitespace-nowrap px-2 py-1.5">Released Date</th>
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

export function EarlyStartReportScreen({ onBack }: { onBack: () => void }) {
  const jiraViewIssueBaseUrl = useJiraViewIssueUrl();
  const [report, setReport] = React.useState<EarlyStartReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [browsingEpicKey, setBrowsingEpicKey] = React.useState<string | null>(null);

  const applyResult = React.useCallback((result: FetchResult) => {
    if (result.report) {
      setReport(result.report);
      setError(null);
      setPage(1);
    } else {
      setError(result.error ?? 'Không thể tải Báo cáo Epic start sớm.');
    }
    setLoading(false);
  }, []);

  const load = () => {
    setLoading(true);
    void requestReport().then(applyResult);
  };

  React.useEffect(() => {
    let active = true;
    void requestReport().then((result) => {
      if (active) applyResult(result);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  const failedEpics = report?.failedEpics ?? [];
  const pageItems = failedEpics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pctDelta = report && hasTtmVerdict(report.current) && hasTtmVerdict(report.earlyStart) ? report.earlyStart.pctPrecise - report.current.pctPrecise : null;

  return (
    <div className="space-y-6 bg-white p-4 text-black md:p-6">
      <InfoBannerDisplay pathname="/reports" />

      <div className="space-y-1 rounded-none border-2 border-fb-border bg-fb-control-hover p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                TTM-CNTT (QLDA) trong phạm vi tính, lớp dữ liệu mới nhất{report?.dataLayerDate ? ` (${report.dataLayerDate})` : ''}. Epic có khuyến nghị &quot;Start sớm&quot; được tính lại với Start Date = Epic_Real_Start_Date.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 border border-fb-border bg-white px-3 py-1.5 text-xs font-bold text-black hover:bg-fb-surface-muted disabled:opacity-60"
          >
            <ArrowsClockwise className={cn('size-3.5', loading && 'animate-spin')} weight="bold" />
            Tải lại
          </button>
        </div>
      </div>

      {error && <div className="border border-status-danger bg-status-danger-soft px-3 py-2 text-xs font-semibold text-status-danger">{error}</div>}

      {/* Panel 1 — 4 widgets */}
      <section aria-label="Chỉ số TTM-CNTT" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Widget title="Chỉ số TTM-CNTT" tone="brand" value={report ? formatTtmPassPct(report.current) : '…'} caption={report ? ratioCaption(report.current) : 'Đang tải…'} />
        <Widget title="Số Epic fail TTM-CNTT" tone="danger" value={report ? String(report.current.fail) : '…'} caption="Epic Fail TTM-CNTT (QLDA) trong phạm vi tính" />
        <Widget
          title="Chỉ số TTM-CNTT start sớm"
          tone="brand"
          value={report ? formatTtmPassPct(report.earlyStart) : '…'}
          caption={report ? ratioCaption(report.earlyStart) : 'Đang tải…'}
          delta={pctDelta === null ? undefined : signed(pctDelta, 'pct')}
        />
        <Widget
          title="Số Epic fail TTM-CNTT start sớm"
          tone="danger"
          value={report ? String(report.earlyStart.fail) : '…'}
          caption="Fail khi Epic start sớm tính từ Epic_Real_Start_Date"
          delta={report ? signed(report.earlyStart.fail - report.current.fail, 'count') : undefined}
        />
      </section>

      {/* Panel 2 — Epic "Start sớm" that fail from their real start date */}
      <section className="overflow-hidden rounded-none border border-black">
        <div className="flex flex-col justify-between gap-1 border-b border-fb-border bg-fb-control-hover px-3 py-2 text-xs font-bold text-black sm:flex-row sm:items-center">
          <span>DANH SÁCH CÁC EPIC FAIL TTM-CNTT START SỚM</span>
          <span className="bg-[var(--color-text-brand)] px-2 py-0.5 text-[11px] font-extrabold uppercase text-white">Tổng số: {failedEpics.length} Epic</span>
        </div>
        {loading && !report ? (
          <div className="bg-fb-surface-muted p-3 text-center text-[11px] text-fb-text-placeholder">Đang tải…</div>
        ) : failedEpics.length === 0 ? (
          <div className="bg-fb-surface-muted p-3 text-center text-[11px] text-fb-text-placeholder">Không có Epic nào trong danh sách này.</div>
        ) : (
          <>
            <FailTable items={pageItems} jiraViewIssueBaseUrl={jiraViewIssueBaseUrl} offset={(page - 1) * PAGE_SIZE} onOpenEpic={setBrowsingEpicKey} />
            <div className="border-t border-fb-border px-3 py-2 text-xs">
              <Pagination currentPage={page} itemLabel="Epic" onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={failedEpics.length} />
            </div>
          </>
        )}
      </section>

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
