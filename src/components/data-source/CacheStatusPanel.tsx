'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

type DailyCacheState = 'FAILED' | 'FRESH' | 'RUNNING' | 'STALE';

interface DailyCacheRun {
  attemptCount: number;
  durationMs: number | null;
  epicRowCount: number | null;
  errorMessage: string | null;
  finishedAt: string | null;
  runDate: string;
  sourceImportBatchId: number | null;
  startedAt: string;
  status: 'FAILED' | 'RUNNING' | 'SUCCESS';
  triggeredByName: string | null;
}

interface CacheOverview {
  dailyStatus: { cacheComputedAt: string | null; state: DailyCacheState; today: string; todayRun: DailyCacheRun | null };
  epicRowCache: { computedAt: string | null; rowCount: number; sourceImportBatchId: number | null };
  latestImportBatch: { aggregatedAt: string; fileName: string | null; id: number } | null;
  recentRuns: DailyCacheRun[];
  ttmIndexGlobalCache: { computedAt: string; sourceImportBatchId: number | null } | null;
}

const STATE_BADGE: Record<DailyCacheState, { label: string; variant: 'danger' | 'info' | 'success' | 'warning' }> = {
  FAILED: { label: 'Lỗi — sẽ thử lại', variant: 'danger' },
  FRESH: { label: 'Đã cập nhật hôm nay', variant: 'success' },
  RUNNING: { label: 'Đang tạo cache', variant: 'info' },
  STALE: { label: 'Chưa tạo hôm nay', variant: 'warning' },
};

const RUN_BADGE: Record<DailyCacheRun['status'], { label: string; variant: 'danger' | 'info' | 'success' }> = {
  FAILED: { label: 'Lỗi', variant: 'danger' },
  RUNNING: { label: 'Đang chạy', variant: 'info' },
  SUCCESS: { label: 'Thành công', variant: 'success' },
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  // Postgres ::text timestamptz is "2026-09-26 20:44:27.49+07" — Date needs the "T" and a "+07:00" offset.
  const date = new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} s`;
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('vi-VN').format(value);
}

/**
 * "Theo dõi cache" — the derived caches every Quản trị Epic / TTM Dashboard view reads from
 * (epic_alert_row_cache, ttm_index_global_cache): when they were last built and from which import,
 * plus the once-a-day auto rebuild's status and recent history (see daily-cache-service.ts).
 */
export function CacheStatusPanel() {
  const [overview, setOverview] = useState<CacheOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data-source/cache-status', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) setError(body.error || 'Không đọc được thông tin cache.');
      else setOverview(body);
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const daily = overview?.dailyStatus;
  const cacheBatchId = overview?.epicRowCache.sourceImportBatchId ?? null;
  const latestBatchId = overview?.latestImportBatch?.id ?? null;
  const isBehindLatestImport = cacheBatchId !== null && latestBatchId !== null && cacheBatchId !== latestBatchId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theo dõi cache dữ liệu</CardTitle>
        <Button variant="outline" size="sm" isLoading={isLoading} onClick={() => void load()}>
          <ArrowsClockwise className="mr-1.5 inline size-4" />
          Làm mới
        </Button>
      </CardHeader>
      <CardBody className="gap-4">
        <p className="text-fb-text-secondary">
          Màn hình Quản trị Epic và TTM Dashboard đọc số liệu từ cache được tạo sẵn (không tính lại mỗi lần mở).
          Cache được tạo lại sau mỗi đợt import, và tự động 1 lần mỗi ngày khi người dùng đầu tiên trong ngày truy cập
          hệ thống (vì cảnh báo FAIL/LATE và số ngày còn lại được tính theo ngày hiện tại).
        </p>

        {error && <Alert variant="error" title="Lỗi">{error}</Alert>}

        {isLoading && !overview ? (
          <TableSkeleton rows={3} />
        ) : overview && daily ? (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Trạng thái hôm nay ({formatDay(daily.today)})</dt>
                <dd className="mt-1.5"><Badge variant={STATE_BADGE[daily.state].variant}>{STATE_BADGE[daily.state].label}</Badge></dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Cache Quản trị Epic</dt>
                <dd className="mt-1.5 font-bold text-fb-text-primary">{formatNumber(overview.epicRowCache.rowCount)} Epic</dd>
                <dd className="text-[12px] text-fb-text-secondary">Tạo lúc {formatDateTime(overview.epicRowCache.computedAt)}</dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Cache TTM/QA-Index (QLDA)</dt>
                <dd className="mt-1.5 text-[12px] text-fb-text-secondary">Tạo lúc {formatDateTime(overview.ttmIndexGlobalCache?.computedAt ?? null)}</dd>
                <dd className="text-[12px] text-fb-text-secondary">Từ đợt import #{overview.ttmIndexGlobalCache?.sourceImportBatchId ?? '—'}</dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Đợt import mới nhất</dt>
                <dd className="mt-1.5 font-bold text-fb-text-primary">#{latestBatchId ?? '—'}</dd>
                <dd className="text-[12px] text-fb-text-secondary">Tổng hợp lúc {formatDateTime(overview.latestImportBatch?.aggregatedAt ?? null)}</dd>
              </div>
            </dl>

            {overview.epicRowCache.rowCount === 0 && (
              <Alert variant="warning" title="Cache đang trống">
                Quản trị Epic và TTM Dashboard đang phải tính lại trực tiếp (chậm). Dùng &quot;Tổng hợp lại ngay&quot; ở panel bên phải để tạo cache.
              </Alert>
            )}
            {isBehindLatestImport && (
              <Alert variant="warning" title="Cache chưa theo kịp đợt import mới nhất">
                Cache đang được tạo từ đợt import #{cacheBatchId}, trong khi đợt mới nhất là #{latestBatchId}. Có thể lần tạo cache sau import đã lỗi — dùng &quot;Tổng hợp lại ngay&quot;.
              </Alert>
            )}
            {daily.todayRun?.status === 'FAILED' && daily.todayRun.errorMessage && (
              <Alert variant="error" title="Lần tạo cache hôm nay bị lỗi">{daily.todayRun.errorMessage}</Alert>
            )}

            <div>
              <p className="mb-2 text-[12px] font-bold text-fb-text-primary">Lịch sử tạo cache tự động hằng ngày (10 ngày gần nhất)</p>
              {overview.recentRuns.length === 0 ? (
                <EmptyState title="Chưa có lần tạo cache tự động nào" description="Lần đầu sẽ chạy khi người dùng đầu tiên trong ngày truy cập hệ thống." />
              ) : (
                <TableContainer>
                  <Table className="min-w-[760px]">
                    <THead>
                      <TR>
                        <TH className="w-[110px]">Ngày</TH>
                        <TH className="w-[110px]">Trạng thái</TH>
                        <TH>Người kích hoạt</TH>
                        <TH className="w-[170px]">Bắt đầu</TH>
                        <TH className="w-[100px] text-right">Thời gian</TH>
                        <TH className="w-[90px] text-right">Số Epic</TH>
                        <TH className="w-[90px] text-center">Đợt import</TH>
                        <TH className="w-[70px] text-center">Lần thử</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {overview.recentRuns.map((run) => (
                        <TR key={run.runDate}>
                          <TD className="font-bold text-fb-blue">{formatDay(run.runDate)}</TD>
                          <TD title={run.errorMessage ?? undefined}><Badge variant={RUN_BADGE[run.status].variant}>{RUN_BADGE[run.status].label}</Badge></TD>
                          <TD>{run.triggeredByName ?? '—'}</TD>
                          <TD>{formatDateTime(run.startedAt)}</TD>
                          <TD className="text-right">{formatDuration(run.durationMs)}</TD>
                          <TD className="text-right">{formatNumber(run.epicRowCount)}</TD>
                          <TD className="text-center">{run.sourceImportBatchId ? `#${run.sourceImportBatchId}` : '—'}</TD>
                          <TD className="text-center">{run.attemptCount}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
