'use client';

import { useEffect, useState } from 'react';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';

/** Link target of the header widget "TTM-CNTT (SỚM)". */
export const EARLY_START_REPORT_HREF = '/reports?view=early-start';

export interface EarlyStartActualIndex {
  /** TTM-CNTT (QLDA) with the "Start sớm" Epics judged from Epic_Real_Start_Date. */
  summary: TtmCnttSummary;
  /** When the cache entry was built (the last cache rebuild). */
  computedAt: string | null;
}

export interface EarlyStartActualState {
  /** The viewer may not open the report (no "Xem" on Báo cáo Epic): the widget isn't offered at all. */
  hidden: boolean;
  /** undefined while loading, null when nothing is cached yet. */
  index: EarlyStartActualIndex | null | undefined;
}

/**
 * Header widget "TTM-CNTT (SỚM)" of TTM Dashboard 2 and Quản trị Epic (owner 2026-11-04): the newest cached numbers
 * of "Báo cáo Epic start sớm" for the viewer's scope — never computed here; every cache rebuild (import, daily run,
 * "Tạo lại cache") writes them (early-start-report-service.ts, refreshEarlyStartCaches), so they follow the other
 * widgets' data layer rather than being real-time.
 */
export function useEarlyStartActualIndex(): EarlyStartActualState {
  const [state, setState] = useState<EarlyStartActualState>({ hidden: false, index: undefined });
  useEffect(() => {
    let active = true;
    fetch('/api/reports/early-start?summary=latest')
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          setState({ hidden: true, index: null });
          return;
        }
        const data = (await response.json()) as { summary?: { earlyStart: TtmCnttSummary; computedAt: string | null } | null };
        if (active) setState({ hidden: false, index: data.summary ? { summary: data.summary.earlyStart, computedAt: data.summary.computedAt } : null });
      })
      .catch(() => {
        if (active) setState({ hidden: false, index: null });
      });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/** "dd/mm/yyyy hh:mm" of the cache entry, for the widget tooltip. */
export function formatEarlyStartCacheTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tooltip of the widget (the app's Tooltip component). */
export function earlyStartActualTooltip(): string {
  return 'Chỉ số TTM tính theo start date thực tế. Click để xem báo cáo.';
}
