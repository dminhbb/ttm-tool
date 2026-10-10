'use client';

import React, { useMemo, useState } from 'react';

export interface DonutDataItem {
  name: string;
  value: number;
}

export interface DonutChartCardProps {
  data: DonutDataItem[];
  emptyMessage?: string;
  onItemClick?: (item: DonutDataItem) => void;
  title: string;
  unitLabel?: string;
}

const PALETTE = [
  '#2563eb', // Blue
  '#0891b2', // Teal / Cyan
  '#7c3aed', // Purple / Violet
  '#f59e0b', // Amber / Orange
  '#94a3b8', // Slate / Gray for 'Khác..'
];

export function DonutChartCard({
  data,
  emptyMessage = 'Không có dữ liệu',
  onItemClick,
  title,
  unitLabel = 'Epic',
}: DonutChartCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipState, setTooltipState] = useState<{ visible: boolean; x: number; y: number } | null>(null);

  const { displayItems, total } = useMemo(() => {
    const validItems = data.filter((d) => d.value > 0);
    const sum = validItems.reduce((acc, curr) => acc + curr.value, 0);

    if (sum === 0) {
      return { displayItems: [], total: 0 };
    }

    // Sort descending by count
    const sorted = [...validItems].sort((a, b) => b.value - a.value);

    let processed: Array<{ color: string; name: string; pct: number; value: number }> = [];

    if (sorted.length <= 5) {
      processed = sorted.map((item, idx) => ({
        ...item,
        color: PALETTE[idx % PALETTE.length],
        pct: Math.round((item.value / sum) * 100),
      }));
    } else {
      const top4 = sorted.slice(0, 4);
      const remaining = sorted.slice(4);
      const remainingSum = remaining.reduce((acc, curr) => acc + curr.value, 0);

      processed = top4.map((item, idx) => ({
        ...item,
        color: PALETTE[idx],
        pct: Math.round((item.value / sum) * 100),
      }));

      processed.push({
        color: PALETTE[4],
        name: 'Khác..',
        pct: Math.round((remainingSum / sum) * 100),
        value: remainingSum,
      });
    }

    return { displayItems: processed, total: sum };
  }, [data]);

  // SVG Donut calculation
  const radius = 55;
  const strokeWidth = 19;
  const circumference = 2 * Math.PI * radius;

  let accumulatedOffset = 0;
  const segments = displayItems.map((item, idx) => {
    const segmentLength = (item.value / total) * circumference;
    const strokeDasharray = `${segmentLength} ${circumference - segmentLength}`;
    const strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += segmentLength;

    return {
      color: item.color,
      index: idx,
      name: item.name,
      pct: item.pct,
      strokeDasharray,
      strokeDashoffset,
      value: item.value,
    };
  });

  const activeItem = hoveredIndex !== null ? displayItems[hoveredIndex] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGCircleElement>, idx: number) => {
    const target = e.currentTarget.ownerSVGElement?.parentElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (hoveredIndex !== idx) {
      setHoveredIndex(idx);
    }
    setTooltipState({
      visible: true,
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipState(null);
  };

  return (
    <div className="relative flex flex-col rounded-2xl border border-fb-border/90 bg-[var(--color-bg-page)] p-5 shadow-xs transition-shadow hover:shadow-sm">
      {/* Title with fixed height */}
      <h3 className="flex h-5 items-center justify-center text-center text-sm font-bold text-fb-text-primary line-clamp-1">
        {title}
      </h3>

      {/* Donut Chart Visual - fixed height container */}
      <div className="relative my-3 flex h-44 items-center justify-center select-none">
        {/* Floating Tooltip - absolute with zero transition lag to prevent jitter */}
        {tooltipState?.visible && activeItem && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full rounded-lg bg-fb-text-primary/95 px-2.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-xs select-none"
            style={{ left: tooltipState.x, top: tooltipState.y - 10 }}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: activeItem.color }}
              />
              <span className="truncate max-w-[150px]">{activeItem.name}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-fb-text-placeholder">
              {activeItem.value} {unitLabel} &bull; <strong className="text-status-warning font-bold text-xs">{activeItem.pct}%</strong>
            </div>
            {onItemClick && (
              <div className="mt-1 border-t border-fb-border-strong/80 pt-1 text-[11px] text-fb-blue">
                Click để duyệt danh sách Epic
              </div>
            )}
          </div>
        )}

        <svg
          className="size-44 -rotate-90 transform"
          viewBox="0 0 140 140"
        >
          {total === 0 ? (
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="transparent"
              stroke="#e2e8f0"
              strokeWidth={strokeWidth}
            />
          ) : (
            // Render hovered segment last so it stays on top without clipping
            [...segments]
              .sort((a, b) => {
                if (a.index === hoveredIndex) return 1;
                if (b.index === hoveredIndex) return -1;
                return 0;
              })
              .map((seg) => {
                const isHovered = hoveredIndex === seg.index;

                return (
                  <circle
                    key={`${seg.name}-${seg.index}`}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    className="cursor-pointer transition-[stroke-width] duration-150 ease-out"
                    style={{
                      // KHÔNG làm mờ các section khác - giữ nguyên 100% độ rõ
                      opacity: 1,
                    }}
                    onMouseEnter={() => setHoveredIndex(seg.index)}
                    onMouseMove={(e) => handleMouseMove(e, seg.index)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => {
                      if (onItemClick) {
                        const raw = displayItems[seg.index];
                        if (raw) onItemClick({ name: raw.name, value: raw.value });
                      }
                    }}
                  />
                );
              })
          )}
        </svg>

        {/* Center Text - constant size & position to eliminate layout shift */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4 select-none">
          <span
            className="text-2xl font-black leading-none tabular-nums"
            style={{ color: activeItem ? activeItem.color : '#0f172a' }}
          >
            {activeItem ? `${activeItem.pct}%` : total}
          </span>
          <span
            className="text-[11px] font-semibold text-fb-text-placeholder mt-1 truncate max-w-[100px] leading-tight"
            title={activeItem ? activeItem.name : unitLabel}
          >
            {activeItem ? activeItem.name : unitLabel}
          </span>
        </div>
      </div>

      {/* Legend & Breakdown Table - fixed row height to eliminate any shaking */}
      <div className="mt-auto space-y-1 border-t border-fb-border/60 pt-3">
        {total === 0 || displayItems.length === 0 ? (
          <p className="py-2 text-center text-xs text-fb-text-placeholder italic">
            {emptyMessage}
          </p>
        ) : (
          displayItems.map((item, idx) => {
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={item.name}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  if (onItemClick) onItemClick({ name: item.name, value: item.value });
                }}
                className={`flex h-8 items-center justify-between text-xs px-2.5 rounded-lg border transition-colors cursor-pointer select-none ${
                  isHovered
                    ? 'bg-fb-blue-soft/90 text-fb-blue border-fb-blue/80 shadow-xs'
                    : 'bg-transparent text-fb-text-secondary border-transparent hover:bg-fb-surface-muted/70'
                }`}
              >
                {/* Left: Dot & Name */}
                <div className="flex items-center gap-2 min-w-0 mr-2">
                  <span
                    className={`size-2.5 shrink-0 rounded-full transition-shadow ${
                      isHovered ? 'ring-2 ring-fb-blue ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: item.color }}
                  />
                  <span
                    className={`truncate text-xs ${
                      isHovered ? 'font-bold text-fb-blue' : 'font-medium text-fb-text-secondary'
                    }`}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </div>

                {/* Right: Value & Pct (constant text-xs, tabular-nums to eliminate layout shift) */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`w-9 text-right text-xs tabular-nums ${
                      isHovered ? 'font-bold text-fb-blue' : 'font-semibold text-fb-text-primary'
                    }`}
                  >
                    {item.value}
                  </span>
                  <span
                    className={`w-10 text-right text-xs tabular-nums ${
                      isHovered ? 'font-bold text-fb-blue' : 'font-medium text-fb-text-placeholder'
                    }`}
                  >
                    {item.pct}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
