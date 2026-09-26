'use client';

import React, { useMemo, useState } from 'react';

export interface DonutDataItem {
  name: string;
  value: number;
}

export interface DonutChartCardProps {
  data: DonutDataItem[];
  emptyMessage?: string;
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
  const strokeWidth = 18;
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
    setHoveredIndex(idx);
    setTooltipState({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipState(null);
  };

  return (
    <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-[#f8fafc] p-5 shadow-xs transition-shadow hover:shadow-sm">
      {/* Title */}
      <h3 className="text-center text-sm font-bold text-slate-800">
        {title}
      </h3>

      {/* Donut Chart Visual */}
      <div className="relative my-4 flex items-center justify-center">
        {/* Floating Tooltip */}
        {tooltipState?.visible && activeItem && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-xs transition-all duration-75"
            style={{ left: tooltipState.x, top: tooltipState.y - 12 }}
          >
            <div className="flex items-center gap-1.5 font-bold">
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: activeItem.color }}
              />
              <span className="truncate max-w-[150px]">{activeItem.name}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-300">
              {activeItem.value} {unitLabel} &bull; <strong className="text-amber-300 font-extrabold text-xs">{activeItem.pct}%</strong>
            </div>
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
            segments.map((seg) => {
              const isHovered = hoveredIndex === seg.index;
              const isDimmed = hoveredIndex !== null && !isHovered;

              return (
                <circle
                  key={`${seg.name}-${seg.index}`}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  className="cursor-pointer transition-all duration-200 ease-out"
                  style={{
                    filter: isHovered ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' : undefined,
                    opacity: isDimmed ? 0.4 : 1,
                  }}
                  onMouseMove={(e) => handleMouseMove(e, seg.index)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })
          )}
        </svg>

        {/* Center Text */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          {activeItem ? (
            <>
              <span
                className="text-2xl font-black leading-none transition-all duration-150"
                style={{ color: activeItem.color }}
              >
                {activeItem.pct}%
              </span>
              <span className="text-[11px] font-semibold text-slate-600 mt-1 truncate max-w-[90px]" title={activeItem.name}>
                {activeItem.name}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-black text-slate-900 leading-none">
                {total}
              </span>
              <span className="text-xs font-medium text-slate-500 mt-1">
                {unitLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legend & Breakdown Table */}
      <div className="mt-2 space-y-1 border-t border-slate-200/60 pt-3">
        {total === 0 || displayItems.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400 italic">
            {emptyMessage}
          </p>
        ) : (
          displayItems.map((item, idx) => {
            const isHovered = hoveredIndex === idx;
            const isDimmed = hoveredIndex !== null && !isHovered;

            return (
              <div
                key={item.name}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-blue-50 ring-1 ring-blue-300 font-bold shadow-xs'
                    : isDimmed
                      ? 'opacity-35 hover:opacity-80'
                      : 'hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 mr-2">
                  <span
                    className={`shrink-0 rounded-full transition-all ${
                      isHovered
                        ? 'size-3 ring-2 ring-offset-1 ring-blue-400 scale-110'
                        : 'size-2.5'
                    }`}
                    style={{ backgroundColor: item.color }}
                  />
                  <span
                    className={`truncate ${isHovered ? 'text-blue-900 font-bold' : 'font-medium text-slate-700'}`}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`w-8 text-right font-bold ${isHovered ? 'text-blue-900 text-sm' : 'text-slate-900'}`}>
                    {item.value}
                  </span>
                  <span className={`w-9 text-right font-bold ${isHovered ? 'text-blue-700' : 'text-slate-400 font-medium'}`}>
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
