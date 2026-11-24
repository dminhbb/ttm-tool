'use client';

import * as React from 'react';
import { CalendarBlank, Info } from '@phosphor-icons/react';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { TtmPhaseTimeline } from '@/components/ttm-calculator/TtmPhaseTimeline';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';
import type { TtmCalculatorResult } from '@/lib/ttm-calculator';
import { CALCULATOR_LEVELS, toCalculatorRequestType } from '@/lib/ttm-calculator-text';

/**
 * Tab "TTM Calendar" của popup "Thông tin Epic" (REQ-20261120-03): tái sử dụng timeline SVG các pha của màn hình
 * TTM Calculator (`TtmPhaseTimeline`) cho chính Epic đang xem. Nếu Epic thiếu 1 trong 3 thông tin bắt buộc —
 * Start date, Phân loại epic, Requirement level — hiển thị thông báo "Thiếu thông tin: ...". Khi đủ, gọi
 * `POST /api/epic-ttm-calendar` (cùng phép tính với TTM Calculator nhưng không gắn quyền ttm_calculator) để lấy kết quả + danh sách ngày nghỉ / ngày làm bù
 * rồi vẽ timeline. Lazy-load khi tab mở (pattern giống `EpicTreeTab`).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Start date là chuỗi ISO hợp lệ (YYYY-MM-DD, ngày tồn tại trong lịch). */
function isValidIsoDate(value: string | null | undefined): value is string {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function MissingInfo() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-fb-text-secondary">
      <CalendarBlank className="size-8 text-fb-text-placeholder" aria-hidden="true" />
      <p className="m-0 text-sm">
        <Info className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
        Thiếu thông tin: Start date, Phân loại epic và Requirement level
      </p>
    </div>
  );
}

export function TtmCalendarTab({ summary }: { summary: EpicBrowserSummary | null }) {
  const [result, setResult] = React.useState<TtmCalculatorResult | null>(null);
  const [holidays, setHolidays] = React.useState<ReadonlySet<string>>(new Set());
  const [workdays, setWorkdays] = React.useState<ReadonlySet<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const startDate = summary?.startDate;
  const level = summary?.requirementLevel ?? null;
  const requestType = toCalculatorRequestType(summary?.epicType);
  // Ba thông tin bắt buộc để vẽ timeline: Start date + Phân loại epic + Requirement level.
  const hasRequired = isValidIsoDate(startDate) && requestType !== null && level !== null && (CALCULATOR_LEVELS as readonly string[]).includes(level);

  React.useEffect(() => {
    if (!hasRequired) return;
    const controller = new AbortController();
    void (async () => {
      try {
        // Timeline chỉ cần 3 thông tin bắt buộc (Start date, Phân loại epic, Requirement level) — không gửi
        // createdDate/ideaApprovedDate (chỉ dùng cho TTM-E2E), tránh API báo "Created date / Ngày duyệt ý tưởng không hợp lệ".
        const response = await fetch('/api/epic-ttm-calendar', {
          body: JSON.stringify({
            requestType,
            requirementLevel: level,
            startDate,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string; result?: TtmCalculatorResult; holidays?: string[]; workdays?: string[] };
        if (controller.signal.aborted) return;
        if (!response.ok || !data.result) setError(data.error ?? 'Không thể tính toán các mốc TTM.');
        else {
          setResult(data.result);
          setHolidays(new Set(data.holidays ?? []));
          setWorkdays(new Set(data.workdays ?? []));
        }
      } catch {
        if (!controller.signal.aborted) setError('Không thể kết nối máy chủ.');
      }
    })();
    return () => controller.abort();
  }, [hasRequired, startDate, level, requestType]);

  if (!hasRequired) return <MissingInfo />;
  if (error) return <p className="m-0 text-sm text-status-danger">{error}</p>;
  if (!result) return <TableSkeleton rows={4} />;

  if (result.rows.length === 0 || !result.goliveDate) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-fb-text-secondary">
        <CalendarBlank className="size-8 text-fb-text-placeholder" aria-hidden="true" />
        <p className="m-0 text-xs">Epic đủ 3 thông tin bắt buộc nhưng chưa có bộ ngân sách TTM-CNTT phù hợp nên chưa vẽ được timeline.</p>
      </div>
    );
  }

  return (
    <TtmPhaseTimeline
      goliveDate={result.goliveDate}
      holidays={holidays}
      rows={result.rows}
      startDate={result.startDate}
      startIsNonWorkingDay={result.startIsNonWorkingDay}
      workdays={workdays}
    />
  );
}
