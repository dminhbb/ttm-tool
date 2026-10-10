'use client';

import * as React from 'react';
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CaretRight,
  ChartLineUp,
  Clock,
  Desktop,
  Globe,
  Users,
} from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import type {
  DetailedVisitStats,
  ScreenVisitStat,
  TrendLinePoint,
} from '@/lib/visit-counter-types';

/**
 * Formats an ISO date string into `DD/MM/YYYY HH:mm:ss` in GMT+7 (Asia/Ho_Chi_Minh).
 */
function formatLoginDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(date).replace(',', '');
  } catch {
    try {
      const date = new Date(isoString);
      const pad = (n: number) => String(n).padStart(2, '0');
      const utc = date.getTime() + date.getTimezoneOffset() * 60000;
      const gmt7 = new Date(utc + 7 * 3600000);
      return `${pad(gmt7.getDate())}/${pad(gmt7.getMonth() + 1)}/${gmt7.getFullYear()} ${pad(gmt7.getHours())}:${pad(gmt7.getMinutes())}:${pad(gmt7.getSeconds())}`;
    } catch {
      return isoString;
    }
  }
}

function formatTimeOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export interface VisitCounterPanelProps {
  /** Hide the panel's own title block — used on /visit-stats, where AppShell already renders the page header. */
  hideTitle?: boolean;
}

export function VisitCounterPanel({ hideTitle = false }: VisitCounterPanelProps = {}) {
  const [stats, setStats] = React.useState<DetailedVisitStats | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<Date | null>(null);
  const [expandedDomainKeys, setExpandedDomainKeys] = React.useState<Set<string>>(new Set());

  // Initial load relies on the default state (isLoading = true, error = null), so only a manual
  // refresh touches state before the await — keeps the mount effect free of synchronous setState.
  const fetchStats = React.useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
      setError(null);
    }

    try {
      const res = await fetch('/api/visit-counter/stats', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Lỗi tải dữ liệu (${res.status} ${res.statusText})`);
      }
      const data: DetailedVisitStats = await res.json();
      setStats(data);
      setLastFetchedAt(new Date());
    } catch (err: unknown) {
      console.error('[VisitCounterPanel] Failed to fetch stats:', err);
      setError(err instanceof Error ? err.message : 'Không thể tải thống kê truy cập.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Same deferral as PermissionMatrixSettings — keeps setState out of the effect body itself.
  React.useEffect(() => {
    void Promise.resolve().then(() => fetchStats(false));
  }, [fetchStats]);

  const toggleDomain = (key: string) => {
    setExpandedDomainKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllDomains = (allKeys: string[]) => {
    setExpandedDomainKeys((prev) => {
      if (prev.size === allKeys.length) {
        return new Set();
      }
      return new Set(allKeys);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', hideTitle ? 'sm:justify-end' : 'sm:justify-between border-b border-fb-border pb-4')}>
        {!hideTitle && (
        <div>
          <h3 className="text-base font-bold text-fb-text-primary flex items-center gap-2">
            <ChartLineUp className="size-5 text-fb-blue" weight="bold" />
            Thống kê truy cập (Visit counter)
          </h3>
          <p className="text-xs text-fb-text-secondary mt-0.5">
            Tổng quan lưu lượng đăng nhập và lượt sử dụng các màn hình chức năng trên hệ thống
          </p>
        </div>
        )}

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {lastFetchedAt && (
            <span className="text-[11px] text-fb-text-secondary whitespace-nowrap">
              Cập nhật: {formatTimeOnly(lastFetchedAt)}
            </span>
          )}
          <Tooltip content="Làm mới" side="bottom">
            <button
              type="button"
              onClick={() => void fetchStats(true)}
              disabled={isLoading || isRefreshing}
              className={cn(
                'grid size-8 place-items-center rounded-md border border-fb-border bg-fb-surface text-fb-text-secondary transition-colors outline-none',
                'hover:bg-fb-control hover:text-fb-text-primary disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              aria-label="Làm mới"
            >
              <ArrowsClockwise
                className={cn('size-4 shrink-0', isRefreshing && 'animate-spin')}
                weight="bold"
              />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="error" title="Không thể tải dữ liệu">
          <div className="flex items-center justify-between gap-4 mt-1">
            <span>{error}</span>
            <Button size="sm" variant="danger" onClick={() => void fetchStats(true)}>
              Thử lại
            </Button>
          </div>
        </Alert>
      )}

      {/* Loading state (first load) */}
      {isLoading && !stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 grid grid-cols-2 gap-3.5">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <div className="lg:col-span-2">
              <Skeleton className="h-full min-h-[260px] rounded-xl" />
            </div>
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      )}

      {/* Content when loaded */}
      {stats && (
        <>
          {/* Row 1: 3 Widgets (Left 1/3) & Trend Line Chart (Right 2/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* a) 3 KPI Cards Cluster (occupies 1/3 width) */}
            <div className="lg:col-span-1 grid grid-cols-2 gap-3.5">
              {/* Card 1: Total (row 1, col 1) */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-3.5 shadow-sm transition-all hover:border-fb-border-strong flex flex-col justify-between">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Tổng số (Lũy kế)</span>
                  <div className="grid size-7 place-items-center rounded-lg bg-fb-blue-soft text-fb-blue shrink-0">
                    <ChartLineUp className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-fb-text-primary">
                    {(stats.appVisits.total ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary leading-snug">
                  Toàn bộ lượt login từ trước đến nay
                </p>
              </div>

              {/* Card 2: Weekly (row 1, col 2) */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-3.5 shadow-sm transition-all hover:border-fb-border-strong flex flex-col justify-between">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Tuần này (T-7 → T)</span>
                  <div className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0">
                    <CalendarBlank className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {(stats.appVisits.weekly ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary leading-snug">
                  7 ngày gần nhất đến hôm nay
                </p>
              </div>

              {/* Card 3: Today (row 2, col 1) */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-3.5 shadow-sm transition-all hover:border-fb-border-strong flex flex-col justify-between">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Hôm nay (T)</span>
                  <div className="grid size-7 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 shrink-0">
                    <Clock className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                    {(stats.appVisits.today ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary leading-snug">
                  Lượt login trong ngày hôm nay
                </p>
              </div>
            </div>

            {/* b) Trend Line Chart (occupies 2/3 width) */}
            <section
              aria-label="Biểu đồ xu hướng truy cập"
              className="lg:col-span-2 rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm flex flex-col justify-between"
            >
              <div>
                <h4 className="text-sm font-bold text-fb-text-primary">
                  Xu hướng truy cập ứng dụng trong tuần (T-7 → T)
                </h4>
                <p className="text-xs text-fb-text-secondary">
                  Biến động số lượt đăng nhập mỗi ngày trong vòng 1 tuần qua
                </p>
              </div>

              <div className="mt-3">
                <TrendLineChart points={stats.trendLine} />
              </div>
            </section>
          </div>

          {/* Row 2: Screen Visits: Dual Column Bar Chart + Detail Table (Side-by-side, 50% each) */}
          <section aria-label="Lượt truy cập theo màn hình" className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-fb-text-primary flex items-center gap-2">
                  <Desktop className="size-4 text-fb-blue" weight="bold" />
                  Lượt truy cập theo {stats.screenStats.length} màn hình chức năng
                </h4>
                <p className="text-xs text-fb-text-secondary">
                  So sánh lượt truy cập màn hình giữa tuần này (T-7 → T) và tuần trước đó (T-15 → T-8)
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs font-semibold self-start sm:self-auto">
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-slate-500 shrink-0" aria-hidden="true" />
                  <span className="text-fb-text-secondary">Tuần trước (T-15 → T-8)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-blue-600 shrink-0" aria-hidden="true" />
                  <span className="text-fb-text-primary">Tuần này (T-7 → T)</span>
                </div>
              </div>
            </div>

            {/* Side-by-side row: Bar Chart (40%) & Table (60%) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
              {/* Dual Column Bar Chart (40%) */}
              <div className="w-full lg:col-span-2">
                <ScreenDualBarChart screenStats={stats.screenStats} />
              </div>

              {/* Detailed Table (60%) */}
              <div className="w-full lg:col-span-3">
                <TableContainer className="rounded-lg border border-fb-border">
                  <Table>
                    <THead>
                      <TR className="bg-fb-surface-muted/60 text-xs">
                        <TH className="py-2.5 px-2.5">Màn hình</TH>
                        <TH className="py-2.5 px-2 text-right">Hôm nay (T)</TH>
                        <TH className="py-2.5 px-2 text-right">Tuần này (T-7 → T)</TH>
                        <TH className="py-2.5 px-2 text-right">Tuần trước (T-15 → T-8)</TH>
                        <TH className="py-2.5 px-2 text-right">Tổng số (Lũy kế)</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {stats.screenStats.map((screen) => (
                        <TR key={screen.screenKey} className="hover:bg-fb-control/40 text-xs">
                          <TD className="py-2.5 px-2.5 font-semibold text-fb-text-primary flex items-center gap-1.5">
                            <Desktop className="size-3.5 text-fb-text-secondary shrink-0" weight="bold" />
                            <span className="truncate" title={screen.screenName}>
                              {screen.screenName}
                            </span>
                          </TD>
                          <TD className="py-2.5 px-2 text-right font-medium text-amber-600 dark:text-amber-400">
                            {(screen.todayVisits ?? 0).toLocaleString('vi-VN')}
                          </TD>
                          <TD className="py-2.5 px-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                            {(screen.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                          </TD>
                          <TD className="py-2.5 px-2 text-right text-slate-500 font-medium">
                            {(screen.prevWeeklyVisits ?? 0).toLocaleString('vi-VN')}
                          </TD>
                          <TD className="py-2.5 px-2 text-right font-bold text-fb-text-primary">
                            {(screen.totalVisits ?? 0).toLocaleString('vi-VN')}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
          </section>

          {/* Row 3: Domain Visits (50%) & 10 Recent Logins (50%) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* d) Domain Visits (Expandable list) */}
            <section aria-label="Lượt truy cập theo Domain" className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-fb-text-primary flex items-center gap-2">
                    <Globe className="size-4 text-fb-blue" weight="bold" />
                    Lượt truy cập theo Domain &amp; Người dùng
                  </h4>
                  <p className="text-xs text-fb-text-secondary">
                    Thống kê theo các user của mỗi domain; bấm vào từng domain để xem chi tiết
                  </p>
                </div>

                {stats.domainStats.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allKeys = stats.domainStats.map(
                        (d) => d.domainId !== null ? String(d.domainId) : d.domainCode || 'unassigned'
                      );
                      toggleAllDomains(allKeys);
                    }}
                    className="text-xs font-semibold text-fb-blue hover:text-fb-blue-hover self-start sm:self-auto outline-none"
                  >
                    {expandedDomainKeys.size === stats.domainStats.length
                      ? 'Thu gọn tất cả'
                      : 'Mở rộng tất cả'}
                  </button>
                )}
              </div>

              <TableContainer className="rounded-lg border border-fb-border">
                <Table className="table-fixed w-full">
                  <THead>
                    <TR className="bg-fb-surface-muted/60 text-xs">
                      <TH className="py-2.5 px-2.5 sm:px-3 w-[36%]">Domain</TH>
                      <TH className="py-2.5 px-1.5 text-center w-[15%]">Số user</TH>
                      <TH className="py-2.5 px-1.5 text-right w-[16%]">Hôm nay</TH>
                      <TH className="py-2.5 px-1.5 text-right w-[16%]">Tuần này</TH>
                      <TH className="py-2.5 px-1.5 text-right w-[17%]">Tổng số</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {stats.domainStats.length === 0 ? (
                      <TR>
                        <TD colSpan={5} className="py-6 text-center text-xs text-fb-text-secondary">
                          Chưa có dữ liệu thống kê domain.
                        </TD>
                      </TR>
                    ) : (
                      stats.domainStats.map((domain) => {
                        const domainKey =
                          domain.domainId !== null ? String(domain.domainId) : domain.domainCode || 'unassigned';
                        const isExpanded = expandedDomainKeys.has(domainKey);
                        const topUsers = [...domain.users]
                          .sort((a, b) => (b.totalVisits ?? 0) - (a.totalVisits ?? 0))
                          .slice(0, 5);

                        return (
                          <React.Fragment key={domainKey}>
                            <TR
                              onClick={() => toggleDomain(domainKey)}
                              className={cn(
                                'cursor-pointer text-xs transition-colors hover:bg-fb-control/40 select-none',
                                isExpanded && 'bg-fb-blue-soft/30'
                              )}
                            >
                              <TD className="py-2.5 px-2.5 sm:px-3">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-fb-text-secondary transition-transform duration-200 shrink-0">
                                    {isExpanded ? (
                                      <CaretDown className="size-3.5" weight="bold" />
                                    ) : (
                                      <CaretRight className="size-3.5" weight="bold" />
                                    )}
                                  </span>
                                  <span
                                    className="font-semibold text-fb-text-primary truncate"
                                    title={domain.domainName || domain.domainCode}
                                  >
                                    {domain.domainName || domain.domainCode}
                                  </span>
                                  {domain.domainCode && (
                                    // 11px là sàn cứng — khớp spec Badge size medium của IAS.
                                    <Badge variant="neutral" className="text-[11px] px-1 py-0 shrink-0 hidden sm:inline-flex">
                                      {domain.domainCode}
                                    </Badge>
                                  )}
                                </div>
                              </TD>
                              <TD className="py-2.5 px-1.5 text-center font-medium text-fb-text-secondary whitespace-nowrap">
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3" />
                                  {domain.users.length}
                                </span>
                              </TD>
                              <TD className="py-2.5 px-1.5 text-right font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                {(domain.todayVisits ?? 0).toLocaleString('vi-VN')}
                              </TD>
                              <TD className="py-2.5 px-1.5 text-right font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                {(domain.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                              </TD>
                              <TD className="py-2.5 px-1.5 text-right font-bold text-fb-text-primary whitespace-nowrap">
                                {(domain.totalVisits ?? 0).toLocaleString('vi-VN')}
                              </TD>
                            </TR>

                            {/* Expanded Top 5 Users Sub-table: All headers and data cells centered */}
                            {isExpanded && (
                              <TR className="bg-fb-surface-muted/30">
                                <TD colSpan={5} className="p-0 border-t border-fb-border">
                                  {domain.users.length === 0 ? (
                                    <div className="py-3 px-6 text-xs text-fb-text-secondary italic text-center">
                                      Chưa có lượt truy cập từ người dùng nào thuộc domain này.
                                    </div>
                                  ) : (
                                    <div className="px-3 py-2.5">
                                      <table className="w-full table-fixed text-center text-xs border-collapse">
                                        <thead>
                                          <tr className="border-b border-fb-border/60 text-fb-text-secondary font-medium">
                                            <th className="py-1.5 px-1 text-center w-[18%]">Tên đăng nhập</th>
                                            <th className="py-1.5 px-1 text-center w-[22%]">Họ và tên</th>
                                            <th className="py-1.5 px-1 text-center w-[24%]">Email</th>
                                            <th className="py-1.5 px-1 text-center w-[12%]">Hôm nay</th>
                                            <th className="py-1.5 px-1 text-center w-[12%]">Tuần này</th>
                                            <th className="py-1.5 px-1 text-center w-[12%]">Tổng số</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {topUsers.map((u) => (
                                            <tr
                                              key={`dom-user-${u.userId}-${u.username}`}
                                              className="border-b border-fb-border/30 last:border-b-0 hover:bg-fb-control/20"
                                            >
                                              <td
                                                className="py-1.5 px-1 text-center font-medium text-fb-text-primary truncate"
                                                title={u.username}
                                              >
                                                {u.username}
                                              </td>
                                              <td
                                                className="py-1.5 px-1 text-center text-fb-text-secondary truncate"
                                                title={u.fullName || '—'}
                                              >
                                                {u.fullName || '—'}
                                              </td>
                                              <td
                                                className="py-1.5 px-1 text-center text-fb-text-secondary font-mono text-[11px] truncate"
                                                title={u.email}
                                              >
                                                {u.email}
                                              </td>
                                              <td className="py-1.5 px-1 text-center text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                                                {(u.todayVisits ?? 0).toLocaleString('vi-VN')}
                                              </td>
                                              <td className="py-1.5 px-1 text-center text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                                                {(u.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                                              </td>
                                              <td className="py-1.5 px-1 text-center text-fb-text-primary font-bold whitespace-nowrap">
                                                {(u.totalVisits ?? 0).toLocaleString('vi-VN')}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      {domain.users.length > 5 && (
                                        <div className="py-1.5 text-center text-[11px] text-fb-text-secondary italic">
                                          Hiển thị top 5 người dùng có lượt truy cập cao nhất
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </TD>
                              </TR>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            </section>

            {/* e) 10 Recent Login Users */}
            <section aria-label="10 User login gần nhất" className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm space-y-3">
              <div>
                <h4 className="text-sm font-bold text-fb-text-primary flex items-center gap-2">
                  <Users className="size-4 text-fb-blue" weight="bold" />
                  Danh sách 10 user login gần nhất
                </h4>
                <p className="text-xs text-fb-text-secondary">
                  Rê chuột vào username để xem chi tiết thời điểm đăng nhập gần nhất
                </p>
              </div>

              <TableContainer className="rounded-lg border border-fb-border">
                <Table className="table-fixed w-full">
                  <THead>
                    <TR className="bg-fb-surface-muted/60 text-xs">
                      <TH className="py-2.5 px-1.5 w-9 sm:w-10 text-center">STT</TH>
                      <TH className="py-2.5 px-1.5 w-[22%]">Username</TH>
                      <TH className="py-2.5 px-1.5 w-[24%]">Họ và tên</TH>
                      <TH className="py-2.5 px-1.5 w-[24%]">Email</TH>
                      <TH className="py-2.5 px-1.5 w-[30%] text-right">
                        <span className="hidden xl:inline">Thời điểm đăng nhập</span>
                        <span className="xl:hidden">Thời gian</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {stats.recentLogins.length === 0 ? (
                      <TR>
                        <TD colSpan={5} className="py-6 text-center text-xs text-fb-text-secondary">
                          Chưa có lịch sử đăng nhập.
                        </TD>
                      </TR>
                    ) : (
                      stats.recentLogins.map((user, idx) => (
                        <TR key={`recent-${user.userId || user.username}-${idx}`} className="hover:bg-fb-control/40 text-xs">
                          <TD className="py-2 px-1 text-center text-fb-text-secondary font-medium">
                            {idx + 1}
                          </TD>
                          <TD className="py-2 px-1.5 truncate">
                            <Tooltip
                              className="inline-flex max-w-full"
                              side="top"
                              content={
                                <div className="flex flex-col gap-0.5 text-left px-1 py-0.5">
                                  <span className="font-semibold text-fb-text-primary">
                                    {user.fullName || user.username}
                                  </span>
                                  <span className="text-[11px] font-normal text-fb-text-secondary">
                                    Đăng nhập lúc: {formatLoginDateTime(user.lastLoginAt)}
                                  </span>
                                </div>
                              }
                            >
                              <span className="cursor-pointer font-semibold text-fb-blue underline decoration-dotted decoration-fb-blue/60 underline-offset-2 hover:text-fb-blue-hover transition-colors truncate block">
                                {user.username}
                              </span>
                            </Tooltip>
                          </TD>
                          <TD className="py-2 px-1.5 font-medium text-fb-text-primary truncate" title={user.fullName || '—'}>
                            {user.fullName || '—'}
                          </TD>
                          <TD className="py-2 px-1.5 font-mono text-[11px] text-fb-text-secondary truncate" title={user.email || '—'}>
                            {user.email || '—'}
                          </TD>
                          <TD className="py-2 px-1.5 text-right font-medium text-fb-text-secondary whitespace-nowrap text-[11px] sm:text-xs">
                            {formatLoginDateTime(user.lastLoginAt)}
                          </TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Trend Line SVG Chart component with responsive HTML text and hover tooltips.
 * Eliminates SVG aspect-ratio distortion by rendering text labels as crisp HTML.
 */
function TrendLineChart({ points }: { points: TrendLinePoint[] }) {
  const maxRaw = points.length > 0 ? Math.max(...points.map((p) => p.count), 0) : 0;
  const maxY = maxRaw === 0 ? 5 : Math.ceil(maxRaw * 1.2);

  // SVG normalized coordinates (viewBox 0 0 100 100)
  const normalizedPoints = React.useMemo(() => {
    if (points.length === 0) return [];
    const count = points.length;
    return points.map((p, i) => {
      const x = count > 1 ? (i / (count - 1)) * 100 : 50;
      // y from 6% (top) to 94% (bottom) to keep dots within container
      const y = maxY > 0 ? 94 - (p.count / maxY) * 88 : 94;
      return { ...p, x, y };
    });
  }, [points, maxY]);

  const linePath = React.useMemo(() => {
    if (normalizedPoints.length === 0) return '';
    return normalizedPoints
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
  }, [normalizedPoints]);

  const areaPath = React.useMemo(() => {
    if (normalizedPoints.length === 0) return '';
    const firstX = normalizedPoints[0].x.toFixed(2);
    const lastX = normalizedPoints[normalizedPoints.length - 1].x.toFixed(2);
    return `${linePath} L ${lastX} 98 L ${firstX} 98 Z`;
  }, [normalizedPoints, linePath]);

  return (
    <div className="w-full select-none pt-2">
      <div className="flex items-stretch gap-2.5 h-[175px]">
        {/* Y-axis Ticks (HTML text - never stretched) */}
        <div className="flex flex-col justify-between py-1 text-right text-[11px] font-semibold text-fb-text-secondary select-none shrink-0 w-7">
          <span>{maxY}</span>
          <span>{Math.round(maxY / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart Canvas Area */}
        <div className="relative flex-1 h-full">
          {/* Horizontal Dashed Grid lines (HTML - crisp, never stretched) */}
          <div className="absolute inset-x-0 top-1 bottom-1 flex flex-col justify-between pointer-events-none">
            <div className="border-b border-dashed border-fb-border w-full" />
            <div className="border-b border-dashed border-fb-border w-full" />
            <div className="border-b border-dashed border-fb-border w-full" />
          </div>

          {/* SVG Vector Paths */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                <stop offset="85%" stopColor="#2563eb" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>

            {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}

            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Tooltip Overlay Dots (HTML - 100% round, never distorted) */}
          {normalizedPoints.map((pt, idx) => (
            <div
              key={`point-${idx}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
              style={{
                left: `${pt.x}%`,
                top: `${pt.y}%`,
              }}
            >
              <Tooltip
                side="top"
                className="inline-flex w-auto"
                content={
                  <div className="flex flex-col gap-0.5 text-center px-1 py-0.5">
                    <span className="text-[11px] text-fb-text-secondary">
                      Ngày {pt.label} ({pt.date})
                    </span>
                    <span className="font-bold text-fb-blue text-sm">
                      {pt.count.toLocaleString('vi-VN')} lượt đăng nhập
                    </span>
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label={`Ngày ${pt.label}: ${pt.count} lượt`}
                  className="group flex size-6 items-center justify-center rounded-full focus:outline-none"
                >
                  <span className="size-2.5 rounded-full bg-blue-600 ring-2 ring-white shadow-sm transition-all duration-150 group-hover:scale-150 group-hover:ring-4 group-hover:ring-blue-300" />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>

      {/* X-axis Date Labels (HTML - aligned with plot canvas) */}
      <div className="relative w-full h-5 mt-2 pl-9">
        <div className="relative w-full h-full">
          {points.map((pt, idx) => {
            const xPercent = points.length > 1 ? (idx / (points.length - 1)) * 100 : 50;
            return (
              <span
                key={`xlabel-${idx}`}
                className="absolute -translate-x-1/2 text-[11px] font-medium text-fb-text-secondary select-none"
                style={{ left: `${xPercent}%` }}
              >
                {pt.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Dual Column Bar Chart component comparing previous week vs current week per screen.
 */
function ScreenDualBarChart({ screenStats }: { screenStats: ScreenVisitStat[] }) {
  const maxBarValue = React.useMemo(() => {
    const allCounts = screenStats.flatMap((s) => [s.weeklyVisits, s.prevWeeklyVisits]);
    const max = Math.max(...allCounts, 0);
    return max === 0 ? 5 : max;
  }, [screenStats]);

  return (
    <div className="pt-2 pb-1">
      <div className="grid gap-2 sm:gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(screenStats.length, 1)}, minmax(0, 1fr))` }}>
        {screenStats.map((screen) => {
          const prevPct = Math.min(100, Math.round((screen.prevWeeklyVisits / maxBarValue) * 100));
          const currentPct = Math.min(100, Math.round((screen.weeklyVisits / maxBarValue) * 100));

          return (
            <div key={screen.screenKey} className="flex flex-col items-center">
              {/* Dual Bars Container */}
              <div className="flex h-40 w-full items-end justify-center gap-1.5 sm:gap-2.5 border-b border-fb-border px-1 pb-1">
                {/* Bar 1: Previous Week (Slate) */}
                <div className="flex flex-col items-center justify-end h-full w-4 sm:w-8">
                  <span className="mb-1 text-[11px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {(screen.prevWeeklyVisits ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <div
                    style={{ height: `${screen.prevWeeklyVisits > 0 ? Math.max(prevPct, 4) : 2}%` }}
                    className={cn(
                      'w-full rounded-t transition-all duration-300',
                      screen.prevWeeklyVisits > 0 ? 'bg-slate-500 hover:bg-slate-600' : 'bg-slate-300 dark:bg-slate-700'
                    )}
                    title={`Tuần trước: ${screen.prevWeeklyVisits} lượt`}
                  />
                </div>

                {/* Bar 2: Current Week (Blue) */}
                <div className="flex flex-col items-center justify-end h-full w-4 sm:w-8">
                  <span className="mb-1 text-[11px] sm:text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {(screen.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <div
                    style={{ height: `${screen.weeklyVisits > 0 ? Math.max(currentPct, 4) : 2}%` }}
                    className={cn(
                      'w-full rounded-t transition-all duration-300',
                      screen.weeklyVisits > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-200 dark:bg-blue-900/40'
                    )}
                    title={`Tuần này: ${screen.weeklyVisits} lượt`}
                  />
                </div>
              </div>

              {/* Screen Name label */}
              <span
                className="mt-2 text-xs font-semibold text-fb-text-primary text-center truncate max-w-full"
                title={screen.screenName}
              >
                {screen.screenName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

