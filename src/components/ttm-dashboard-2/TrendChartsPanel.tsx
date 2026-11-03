'use client';

import * as React from 'react';
import { ChartLineUp } from '@phosphor-icons/react';
import { Tooltip } from '@/components/ui/Tooltip';
import type { TtmTrendPoint, TtmTrendValues } from '@/lib/ttm-dashboard-trend';

/**
 * "Xu hướng biến động chỉ số" (owner 2026-11-03) — three trend charts under the funnel, in the style of the visit chart of
 * "Thống kê truy cập": the newest data layer and every 5th layer before it (7 points), read from the frozen history. A
 * layer the history does not hold is a gap in the line, not a zero. Shown in the company view only (the API sends no series
 * otherwise).
 */

interface ChartSpec {
  id: string;
  title: string;
  /** Tailwind color utility of the line (stroke / dots follow currentColor). */
  tone: string;
  dot: string;
  kind: 'count' | 'percent';
  unit: string;
  valueOf: (values: TtmTrendValues) => number | null;
}

const CHARTS: readonly ChartSpec[] = [
  { dot: 'bg-status-danger', id: 'fail', kind: 'count', title: 'Số lượng Epic Fail TTM-CNTT', tone: 'text-status-danger', unit: 'Epic', valueOf: (values) => values.failCntt },
  { dot: 'bg-status-success', id: 'cntt', kind: 'percent', title: 'Chỉ số TTM-CNTT (QLDA)', tone: 'text-status-success', unit: '%', valueOf: (values) => values.ttmCnttPct },
  { dot: 'bg-status-warning', id: 'anomaly', kind: 'count', title: 'Số lượng Epic sai lệch dữ liệu', tone: 'text-status-warning', unit: 'Epic', valueOf: (values) => values.anomaly },
];

const viDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const shortDate = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

interface ChartPoint {
  date: string;
  value: number | null;
  x: number;
  y: number;
}

function MetricChart({ points, spec }: { points: readonly TtmTrendPoint[]; spec: ChartSpec }) {
  const values = points.map((point) => spec.valueOf(point.values));
  const known = values.filter((value): value is number => value !== null);
  // Counts start at 0; a percentage is drawn between its own lowest and highest values so a small drift is visible.
  const rawMin = spec.kind === 'count' ? 0 : known.length > 0 ? Math.floor(Math.min(...known) - 1) : 0;
  const rawMax = known.length > 0 ? Math.max(...known) : 0;
  const maxY = spec.kind === 'count' ? (rawMax === 0 ? 5 : Math.ceil(rawMax * 1.2)) : Math.max(rawMin + 2, Math.ceil(rawMax + 1));
  const minY = spec.kind === 'count' ? 0 : Math.max(0, rawMin);
  const span = Math.max(1, maxY - minY);

  const plot = React.useMemo<ChartPoint[]>(() => points.map((point, index) => {
    const value = spec.valueOf(point.values);
    return {
      date: point.date,
      value,
      x: points.length > 1 ? (index / (points.length - 1)) * 100 : 50,
      y: value === null ? 0 : 94 - ((value - minY) / span) * 88,
    };
  }), [points, spec, minY, span]);

  // One path per run of known values: a missing layer breaks the line.
  const runs = React.useMemo(() => {
    const result: ChartPoint[][] = [];
    let current: ChartPoint[] = [];
    for (const point of plot) {
      if (point.value === null) { if (current.length > 0) result.push(current); current = []; } else current.push(point);
    }
    if (current.length > 0) result.push(current);
    return result;
  }, [plot]);
  const pathOf = (run: ChartPoint[]) => run.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const format = (value: number) => `${NUMBER.format(value)}${spec.kind === 'percent' ? '%' : ''}`;

  return (
    <div className={`w-full select-none pt-2 ${spec.tone}`}>
      <div className="flex h-[150px] items-stretch gap-2.5">
        <div className="flex w-9 shrink-0 select-none flex-col justify-between py-1 text-right text-[11px] font-semibold text-fb-text-secondary">
          <span>{format(maxY)}</span>
          <span>{format(Math.round(((maxY + minY) / 2) * 10) / 10)}</span>
          <span>{format(minY)}</span>
        </div>
        <div className="relative h-full flex-1">
          <div className="pointer-events-none absolute inset-x-0 bottom-1 top-1 flex flex-col justify-between">
            <div className="w-full border-b border-dashed border-fb-border" />
            <div className="w-full border-b border-dashed border-fb-border" />
            <div className="w-full border-b border-dashed border-fb-border" />
          </div>
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            {runs.map((run, index) => run.length > 1 && (
              <path d={`${pathOf(run)} L ${run[run.length - 1].x.toFixed(2)} 98 L ${run[0].x.toFixed(2)} 98 Z`} fill="currentColor" fillOpacity="0.1" key={`area-${index}`} />
            ))}
            {runs.map((run, index) => (
              <path d={pathOf(run)} fill="none" key={`line-${index}`} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {plot.map((point) => point.value !== null && (
            <div className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" key={point.date} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
              <Tooltip
                className="inline-flex w-auto"
                content={(
                  <div className="flex flex-col gap-0.5 px-1 py-0.5 text-center">
                    <span className="text-[11px] text-fb-text-secondary">Lớp dữ liệu {viDate(point.date)}</span>
                    <span className="text-sm font-bold">{NUMBER.format(point.value)}{spec.kind === 'percent' ? '%' : ` ${spec.unit}`}</span>
                  </div>
                )}
                side="top"
              >
                <button aria-label={`${viDate(point.date)}: ${format(point.value)}`} className="group flex size-6 items-center justify-center rounded-full focus:outline-none" type="button">
                  <span className={`size-2.5 rounded-full ring-2 ring-fb-surface transition-all duration-150 group-hover:scale-150 ${spec.dot}`} />
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-2 h-5 w-full pl-[46px]">
        <div className="relative h-full w-full">
          {plot.map((point) => (
            <span className="absolute -translate-x-1/2 select-none text-[11px] font-medium text-fb-text-secondary" key={`x-${point.date}`} style={{ left: `${point.x}%` }}>
              {shortDate(point.date)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrendChartsPanel({ series }: { series: readonly TtmTrendPoint[] }) {
  if (series.length === 0) return null;
  const newest = series[series.length - 1].date;
  const oldest = series[0].date;
  return (
    <section aria-label="Xu hướng biến động chỉ số" className="min-w-0 rounded-2xl border border-fb-border bg-fb-surface p-5 shadow-sm md:p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-fb-border pb-3">
        <div className="flex items-center gap-2">
          <ChartLineUp aria-hidden="true" className="size-4 text-[var(--color-text-brand)]" weight="bold" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-fb-text-primary">Xu hướng biến động chỉ số</h2>
        </div>
        <span className="text-[11px] text-fb-text-secondary">
          {series.length} mốc, mỗi mốc cách nhau 5 lớp dữ liệu • {viDate(oldest)} → {viDate(newest)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {CHARTS.map((spec) => (
          <div className="min-w-0" key={spec.id}>
            <h3 className="text-xs font-bold text-fb-text-primary">{spec.title}</h3>
            <MetricChart points={series} spec={spec} />
          </div>
        ))}
      </div>
    </section>
  );
}
