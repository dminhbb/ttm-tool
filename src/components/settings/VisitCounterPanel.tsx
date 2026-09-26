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
  DomainVisitStat,
  RecentLoginUser,
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

export function VisitCounterPanel() {
  const [stats, setStats] = React.useState<DetailedVisitStats | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = React.useState<Date | null>(null);
  const [expandedDomainKeys, setExpandedDomainKeys] = React.useState<Set<string>>(new Set());

  const fetchStats = React.useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

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

  React.useEffect(() => {
    void fetchStats(false);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-fb-border pb-4">
        <div>
          <h3 className="text-base font-bold text-fb-text-primary flex items-center gap-2">
            <ChartLineUp className="size-5 text-fb-blue" weight="bold" />
            Thống kê truy cập (Visit counter)
          </h3>
          <p className="text-xs text-fb-text-secondary mt-0.5">
            Tổng quan lưu lượng đăng nhập và lượt sử dụng các màn hình chức năng trên hệ thống
          </p>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      )}

      {/* Content when loaded */}
      {stats && (
        <>
          {/* a) 3 KPI Cards */}
          <section aria-label="Tổng số lượt truy cập ứng dụng">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Total */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm transition-all hover:border-fb-border-strong">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Tổng số (Lũy kế)</span>
                  <div className="grid size-8 place-items-center rounded-lg bg-fb-blue-soft text-fb-blue">
                    <ChartLineUp className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-fb-text-primary">
                    {(stats.appVisits.total ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt truy cập</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary">
                  Toàn bộ lượt login từ trước đến nay
                </p>
              </div>

              {/* Card 2: Weekly */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm transition-all hover:border-fb-border-strong">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Tuần này (T-7 → T)</span>
                  <div className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <CalendarBlank className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {(stats.appVisits.weekly ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt truy cập</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary">
                  Lượt login trong 7 ngày gần nhất đến hôm nay
                </p>
              </div>

              {/* Card 3: Today */}
              <div className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm transition-all hover:border-fb-border-strong">
                <div className="flex items-center justify-between text-fb-text-secondary">
                  <span className="text-xs font-semibold uppercase tracking-wider">Hôm nay (T)</span>
                  <div className="grid size-8 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <Clock className="size-4" weight="bold" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                    {(stats.appVisits.today ?? 0).toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-fb-text-secondary font-medium">lượt truy cập</span>
                </div>
                <p className="mt-1 text-[11px] text-fb-text-secondary">
                  Lượt login ghi nhận trong ngày hôm nay
                </p>
              </div>
            </div>
          </section>

          {/* b) Trend Line Chart (SVG) */}
          <section aria-label="Biểu đồ xu hướng truy cập" className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <h4 className="text-sm font-bold text-fb-text-primary">
                  Xu hướng truy cập ứng dụng trong tuần (T-7 → T)
                </h4>
                <p className="text-xs text-fb-text-secondary">
                  Biến động số lượt đăng nhập mỗi ngày trong vòng 1 tuần qua
                </p>
              </div>
            </div>

            <TrendLineChart points={stats.trendLine} />
          </section>

          {/* c) Screen Visits: Dual Column Bar Chart + Detail Table */}
          <section aria-label="Lượt truy cập theo màn hình" className="rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-fb-text-primary flex items-center gap-2">
                  <Desktop className="size-4 text-fb-blue" weight="bold" />
                  Lượt truy cập theo 4 màn hình chức năng
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

            {/* Dual Column Bar Chart */}
            <ScreenDualBarChart screenStats={stats.screenStats} />

            {/* Detailed Table */}
            <div className="mt-4">
              <TableContainer className="rounded-lg border border-fb-border">
                <Table>
                  <THead>
                    <TR className="bg-fb-surface-muted/60 text-xs">
                      <TH className="py-2.5 px-3">Màn hình</TH>
                      <TH className="py-2.5 px-3 text-right">Hôm nay (T)</TH>
                      <TH className="py-2.5 px-3 text-right">Tuần này (T-7 → T)</TH>
                      <TH className="py-2.5 px-3 text-right">Tuần trước (T-15 → T-8)</TH>
                      <TH className="py-2.5 px-3 text-right">Tổng số (Lũy kế)</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {stats.screenStats.map((screen) => (
                      <TR key={screen.screenKey} className="hover:bg-fb-control/40 text-xs">
                        <TD className="py-2.5 px-3 font-semibold text-fb-text-primary flex items-center gap-2">
                          <Desktop className="size-3.5 text-fb-text-secondary shrink-0" weight="bold" />
                          {screen.screenName}
                        </TD>
                        <TD className="py-2.5 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                          {(screen.todayVisits ?? 0).toLocaleString('vi-VN')}
                        </TD>
                        <TD className="py-2.5 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                          {(screen.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                        </TD>
                        <TD className="py-2.5 px-3 text-right text-slate-500 font-medium">
                          {(screen.prevWeeklyVisits ?? 0).toLocaleString('vi-VN')}
                        </TD>
                        <TD className="py-2.5 px-3 text-right font-bold text-fb-text-primary">
                          {(screen.totalVisits ?? 0).toLocaleString('vi-VN')}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            </div>
          </section>

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
              <Table>
                <THead>
                  <TR className="bg-fb-surface-muted/60 text-xs">
                    <TH className="py-2.5 px-3 w-1/3">Domain</TH>
                    <TH className="py-2.5 px-3 text-center">Số user</TH>
                    <TH className="py-2.5 px-3 text-right">Hôm nay (T)</TH>
                    <TH className="py-2.5 px-3 text-right">Tuần này (T-7 → T)</TH>
                    <TH className="py-2.5 px-3 text-right">Tổng số (Lũy kế)</TH>
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

                      return (
                        <React.Fragment key={domainKey}>
                          <TR
                            onClick={() => toggleDomain(domainKey)}
                            className={cn(
                              'cursor-pointer text-xs transition-colors hover:bg-fb-control/40 select-none',
                              isExpanded && 'bg-fb-blue-soft/30'
                            )}
                          >
                            <TD className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span className="text-fb-text-secondary transition-transform duration-200">
                                  {isExpanded ? (
                                    <CaretDown className="size-3.5" weight="bold" />
                                  ) : (
                                    <CaretRight className="size-3.5" weight="bold" />
                                  )}
                                </span>
                                <span className="font-semibold text-fb-text-primary">
                                  {domain.domainName || domain.domainCode}
                                </span>
                                {domain.domainCode && (
                                  <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
                                    {domain.domainCode}
                                  </Badge>
                                )}
                              </div>
                            </TD>
                            <TD className="py-2.5 px-3 text-center font-medium text-fb-text-secondary">
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-3" />
                                {domain.users.length}
                              </span>
                            </TD>
                            <TD className="py-2.5 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                              {(domain.todayVisits ?? 0).toLocaleString('vi-VN')}
                            </TD>
                            <TD className="py-2.5 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                              {(domain.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                            </TD>
                            <TD className="py-2.5 px-3 text-right font-bold text-fb-text-primary">
                              {(domain.totalVisits ?? 0).toLocaleString('vi-VN')}
                            </TD>
                          </TR>

                          {/* Expanded Users Sub-table */}
                          {isExpanded && (
                            <TR className="bg-fb-surface-muted/30">
                              <TD colSpan={5} className="p-0 border-t border-fb-border">
                                {domain.users.length === 0 ? (
                                  <div className="py-3 px-8 text-xs text-fb-text-secondary italic">
                                    Chưa có lượt truy cập từ người dùng nào thuộc domain này.
                                  </div>
                                ) : (
                                  <div className="px-6 py-2">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                        <tr className="border-b border-fb-border/60 text-fb-text-secondary font-medium">
                                          <th className="py-1.5 px-2">Tên đăng nhập</th>
                                          <th className="py-1.5 px-2">Họ và tên</th>
                                          <th className="py-1.5 px-2">Email</th>
                                          <th className="py-1.5 px-2 text-right">Hôm nay</th>
                                          <th className="py-1.5 px-2 text-right">Tuần này</th>
                                          <th className="py-1.5 px-2 text-right">Tổng số</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {domain.users.map((u) => (
                                          <tr
                                            key={`dom-user-${u.userId}-${u.username}`}
                                            className="border-b border-fb-border/30 last:border-b-0 hover:bg-fb-control/20"
                                          >
                                            <td className="py-1.5 px-2 font-medium text-fb-text-primary">
                                              {u.username}
                                            </td>
                                            <td className="py-1.5 px-2 text-fb-text-secondary">
                                              {u.fullName || '—'}
                                            </td>
                                            <td className="py-1.5 px-2 text-fb-text-secondary font-mono text-[11px]">
                                              {u.email}
                                            </td>
                                            <td className="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400 font-medium">
                                              {(u.todayVisits ?? 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-1.5 px-2 text-right text-blue-600 dark:text-blue-400 font-semibold">
                                              {(u.weeklyVisits ?? 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-1.5 px-2 text-right text-fb-text-primary font-bold">
                                              {(u.totalVisits ?? 0).toLocaleString('vi-VN')}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
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
              <Table>
                <THead>
                  <TR className="bg-fb-surface-muted/60 text-xs">
                    <TH className="py-2.5 px-3 w-12 text-center">STT</TH>
                    <TH className="py-2.5 px-3">Username</TH>
                    <TH className="py-2.5 px-3">Họ và tên</TH>
                    <TH className="py-2.5 px-3">Email</TH>
                    <TH className="py-2.5 px-3 text-right">Thời điểm đăng nhập</TH>
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
                        <TD className="py-2 px-3 text-center text-fb-text-secondary font-medium">
                          {idx + 1}
                        </TD>
                        <TD className="py-2 px-3">
                          <Tooltip
                            className="inline-flex w-auto"
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
                            <span className="cursor-pointer font-semibold text-fb-blue underline decoration-dotted decoration-fb-blue/60 underline-offset-2 hover:text-fb-blue-hover transition-colors">
                              {user.username}
                            </span>
                          </Tooltip>
                        </TD>
                        <TD className="py-2 px-3 font-medium text-fb-text-primary">
                          {user.fullName || '—'}
                        </TD>
                        <TD className="py-2 px-3 font-mono text-[11px] text-fb-text-secondary">
                          {user.email || '—'}
                        </TD>
                        <TD className="py-2 px-3 text-right font-medium text-fb-text-secondary">
                          {formatLoginDateTime(user.lastLoginAt)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableContainer>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Trend Line SVG Chart component with responsive HTML hover tooltips.
 */
function TrendLineChart({ points }: { points: TrendLinePoint[] }) {
  const chartWidth = 700;
  const chartHeight = 200;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 35;

  const w = chartWidth - paddingLeft - paddingRight;
  const h = chartHeight - paddingTop - paddingBottom;

  const maxRaw = points.length > 0 ? Math.max(...points.map((p) => p.count), 0) : 0;
  const maxY = maxRaw === 0 ? 5 : Math.ceil(maxRaw * 1.2);

  // Compute calculated SVG coordinates
  const calculatedPoints = React.useMemo(() => {
    if (points.length === 0) return [];
    const count = points.length;
    return points.map((p, i) => {
      const x = count > 1 ? paddingLeft + (i / (count - 1)) * w : paddingLeft + w / 2;
      const y = paddingTop + h - (p.count / maxY) * h;
      return { ...p, x, y };
    });
  }, [points, w, h, maxY]);

  // Construct SVG paths
  const linePath = React.useMemo(() => {
    if (calculatedPoints.length === 0) return '';
    return calculatedPoints
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [calculatedPoints]);

  const areaPath = React.useMemo(() => {
    if (calculatedPoints.length === 0) return '';
    const firstX = calculatedPoints[0].x.toFixed(1);
    const lastX = calculatedPoints[calculatedPoints.length - 1].x.toFixed(1);
    const baseY = (paddingTop + h).toFixed(1);
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [calculatedPoints, linePath, h]);

  const yTicks = [
    { value: maxY, y: paddingTop },
    { value: Math.round(maxY / 2), y: paddingTop + h / 2 },
    { value: 0, y: paddingTop + h },
  ];

  return (
    <div className="relative w-full h-[220px] select-none">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
            <stop offset="90%" stopColor="#2563eb" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines & Y labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={tick.y}
              x2={chartWidth - paddingRight}
              y2={tick.y}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-fb-border"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-fb-text-secondary text-[10px] font-medium"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {/* Gradient Area Fill */}
        {areaPath && <path d={areaPath} fill="url(#trendGradient)" />}

        {/* Stroke Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* X-axis Date Labels */}
        {calculatedPoints.map((pt, idx) => (
          <text
            key={`xlabel-${idx}`}
            x={pt.x}
            y={chartHeight - 12}
            textAnchor="middle"
            className="fill-fb-text-secondary text-[11px] font-medium"
          >
            {pt.label}
          </text>
        ))}
      </svg>

      {/* Interactive Tooltip Overlay Dots */}
      {calculatedPoints.map((pt, idx) => (
        <div
          key={`point-${idx}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
          style={{
            left: `${(pt.x / chartWidth) * 100}%`,
            top: `${(pt.y / chartHeight) * 100}%`,
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
    <div className="pt-4 pb-2">
      <div className="grid grid-cols-4 gap-2 sm:gap-6">
        {screenStats.map((screen) => {
          const prevPct = Math.min(100, Math.round((screen.prevWeeklyVisits / maxBarValue) * 100));
          const currentPct = Math.min(100, Math.round((screen.weeklyVisits / maxBarValue) * 100));

          return (
            <div key={screen.screenKey} className="flex flex-col items-center">
              {/* Dual Bars Container */}
              <div className="flex h-44 w-full items-end justify-center gap-1.5 sm:gap-3 border-b border-fb-border px-1 pb-1">
                {/* Bar 1: Previous Week (Slate) */}
                <div className="flex flex-col items-center justify-end h-full w-5 sm:w-10">
                  <span className="mb-1 text-[10px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap">
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
                <div className="flex flex-col items-center justify-end h-full w-5 sm:w-10">
                  <span className="mb-1 text-[10px] sm:text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
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
              <span className="mt-2 text-xs font-semibold text-fb-text-primary text-center truncate max-w-full">
                {screen.screenName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
