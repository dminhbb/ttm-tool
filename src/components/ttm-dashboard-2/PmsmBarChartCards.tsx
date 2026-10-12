'use client';

import { useMemo, useState } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { formatEpicCount, type TtmBreakdownItem } from '@/lib/ttm-funnel-summary';

interface PmsmBarItemData {
  name: string;
  value: number;
  totalEpics: number;
  item: TtmBreakdownItem;
}

interface SingleBarChartColumnProps {
  barColorClass: string;
  emptyMessage?: string;
  isExpanded: boolean;
  items: PmsmBarItemData[];
  onItemClick: (item: TtmBreakdownItem) => void;
  onToggleExpand: (expanded: boolean) => void;
  title: string;
  unitLabel?: string;
}

function SingleBarChartColumn({
  barColorClass,
  emptyMessage = 'Không có dữ liệu',
  isExpanded,
  items,
  onItemClick,
  onToggleExpand,
  title,
  unitLabel = 'Epic',
}: SingleBarChartColumnProps) {
  const totalSum = useMemo(() => items.reduce((acc, curr) => acc + curr.value, 0), [items]);
  const maxValue = useMemo(() => Math.max(...items.map((i) => i.value), 1), [items]);

  const totalCount = items.length;
  const isDivided = totalCount > 14 && !isExpanded;

  const topItems = useMemo(() => (isDivided ? items.slice(0, 7) : items), [isDivided, items]);
  const bottomItems = useMemo(() => (isDivided ? items.slice(totalCount - 7) : []), [isDivided, items, totalCount]);
  const hiddenCount = totalCount > 14 ? totalCount - 14 : 0;

  const renderRow = (entry: PmsmBarItemData, rank: number) => {
    const pctOfMax = maxValue > 0 ? Math.max(3, Math.min(100, Math.round((entry.value / maxValue) * 100))) : 0;
    const sharePct = totalSum > 0 ? ((entry.value / totalSum) * 100).toFixed(1) : '0.0';

    return (
      <button
        key={`${entry.name}-${rank}`}
        type="button"
        onClick={() => onItemClick(entry.item)}
        className="group flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-fb-surface-muted"
        title={`${entry.name}: ${formatEpicCount(entry.value)} ${unitLabel} (${sharePct}%) - Bấm để xem danh sách Epic`}
      >
        {/* Thứ hạng */}
        <span className="w-5 shrink-0 text-right font-mono text-[11px] font-bold text-fb-text-placeholder group-hover:text-fb-text-secondary">
          {rank}.
        </span>

        {/* Tên PM/SM */}
        <span
          className="w-24 shrink-0 truncate text-xs font-semibold text-fb-text-primary group-hover:text-[var(--color-text-brand)] sm:w-28"
          title={entry.name}
        >
          {entry.name}
        </span>

        {/* Thanh Bar ngang */}
        <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-fb-surface-muted dark:bg-fb-border/40">
          <div
            className={cn('h-full rounded-full transition-all duration-300', barColorClass)}
            style={{ width: `${entry.value > 0 ? pctOfMax : 0}%` }}
          />
        </div>

        {/* Giá trị và % */}
        <div className="flex shrink-0 items-baseline gap-1 font-mono text-right">
          {/* A PM/SM's number is a share of Epics (TtmBreakdownItem) — shown rounded to a whole Epic. */}
          <span className="text-xs font-bold tabular-nums text-fb-text-primary">
            {formatEpicCount(entry.value)}
          </span>
          <span className="text-[11px] tabular-nums text-fb-text-secondary">
            ({sharePct}%)
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="relative flex flex-col rounded-2xl border border-fb-border bg-fb-surface p-4 shadow-xs transition-shadow hover:shadow-sm">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between border-b border-fb-border/60 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-fb-text-primary">
          {title}
        </h3>
        <span className="font-mono text-[11px] font-semibold text-fb-text-secondary">
          {totalSum} {unitLabel}
        </span>
      </div>

      {/* Body content */}
      {items.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-xs italic text-fb-text-placeholder">
          {emptyMessage}
        </div>
      ) : (
        <div className={cn('flex flex-col', isExpanded && 'max-h-[460px] overflow-y-auto pr-1')}>
          {/* Top items */}
          <div className="space-y-1">
            {topItems.map((entry, idx) => renderRow(entry, idx + 1))}
          </div>

          {/* Dải phân cách giữa + nút load các PM/SM còn lại */}
          {isDivided && (
            <div className="relative my-2 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dashed border-fb-border" />
              </div>
              <button
                type="button"
                onClick={() => onToggleExpand(true)}
                className="relative z-10 flex cursor-pointer items-center gap-1.5 rounded-full border border-fb-border bg-fb-surface px-3 py-0.5 text-[11px] font-semibold text-fb-text-secondary shadow-2xs transition-all hover:border-[var(--color-text-brand)] hover:bg-[var(--color-primary-100)] hover:text-[var(--color-text-brand)] dark:hover:bg-fb-surface-muted"
                title={`Hiển thị tất cả ${totalCount} PM/SM`}
              >
                <span className="tracking-widest">···</span>
                <span>+{hiddenCount} PM/SM</span>
                <CaretDown size={11} weight="bold" />
              </button>
            </div>
          )}

          {/* Bottom items (Top 7 thấp nhất) */}
          {isDivided && (
            <div className="space-y-1">
              {bottomItems.map((entry, idx) => renderRow(entry, totalCount - 7 + idx + 1))}
            </div>
          )}

          {/* Nút thu gọn khi đang mở toàn bộ */}
          {isExpanded && totalCount > 14 && (
            <div className="mt-2.5 flex justify-center border-t border-fb-border/40 pt-2">
              <button
                type="button"
                onClick={() => onToggleExpand(false)}
                className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-fb-text-secondary transition-colors hover:text-[var(--color-text-brand)]"
              >
                <CaretUp size={12} weight="bold" />
                <span>Thu gọn về Top 7 đầu & cuối</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface PmsmBarChartCardsProps {
  items: TtmBreakdownItem[];
  onOpenEpicList: (name: string, alert: 'TTM_COUNTED_IN_SCOPE' | 'TTM_PASS_IN_SCOPE' | readonly string[], label: string) => void;
}

export function PmsmBarChartCards({ items, onOpenEpicList }: PmsmBarChartCardsProps) {
  // Trạng thái mở rộng được đồng bộ chung cho cả 3 nhóm
  const [isExpanded, setIsExpanded] = useState(false);

  // Nhóm 1: % Tổng số Epic (sort giảm dần theo item.total)
  const totalSortedItems = useMemo<PmsmBarItemData[]>(() => {
    return [...items]
      .filter((i) => i.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((item) => ({
        name: item.name,
        value: item.total,
        totalEpics: item.total,
        item,
      }));
  }, [items]);

  // Nhóm 2: % Pass TTM (sort giảm dần theo item.pass)
  const passSortedItems = useMemo<PmsmBarItemData[]>(() => {
    return [...items]
      .filter((i) => i.pass > 0)
      .sort((a, b) => b.pass - a.pass)
      .map((item) => ({
        name: item.name,
        value: item.pass,
        totalEpics: item.total,
        item,
      }));
  }, [items]);

  // Nhóm 3: % Fail TTM (sort giảm dần theo item.fail)
  const failSortedItems = useMemo<PmsmBarItemData[]>(() => {
    return [...items]
      .filter((i) => i.fail > 0)
      .sort((a, b) => b.fail - a.fail)
      .map((item) => ({
        name: item.name,
        value: item.fail,
        totalEpics: item.total,
        item,
      }));
  }, [items]);

  const FAIL_ALERTS = useMemo<readonly string[]>(() => ['TTM_LATE_IN_SCOPE', 'OVERDUE_MISSING_R4G_IN_SCOPE'], []);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <SingleBarChartColumn
        title="% Tổng số Epic"
        barColorClass="bg-[var(--color-bg-brand)]"
        items={totalSortedItems}
        isExpanded={isExpanded}
        onToggleExpand={setIsExpanded}
        onItemClick={(item) => onOpenEpicList(item.name, 'TTM_COUNTED_IN_SCOPE', 'Danh sách Epic')}
      />
      <SingleBarChartColumn
        title="% Pass TTM"
        barColorClass="bg-[var(--color-bg-success-solid)]"
        items={passSortedItems}
        isExpanded={isExpanded}
        onToggleExpand={setIsExpanded}
        emptyMessage="Không có Epic đạt TTM"
        onItemClick={(item) => onOpenEpicList(item.name, 'TTM_PASS_IN_SCOPE', 'Danh sách Epic Pass TTM')}
      />
      <SingleBarChartColumn
        title="% Fail TTM"
        barColorClass="bg-[var(--color-bg-error-solid)]"
        items={failSortedItems}
        isExpanded={isExpanded}
        onToggleExpand={setIsExpanded}
        emptyMessage="Không có Epic Fail TTM"
        onItemClick={(item) => onOpenEpicList(item.name, FAIL_ALERTS, 'Danh sách Epic Fail TTM')}
      />
    </div>
  );
}
