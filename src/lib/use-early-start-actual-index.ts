'use client';

import { useEffect, useState } from 'react';
import type { TtmCnttSummary } from '@/lib/ttm-cntt-qa';
import type { TtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

/** Link target of the header widget "TTM-CNTT (SỚM)". */
export const EARLY_START_REPORT_HREF = '/reports?view=early-start';

export interface EarlyStartActualIndex {
  /** TTM-CNTT (QLDA) of the whole company with the "Start sớm" Epics judged from Epic_Real_Start_Date. */
  summary: TtmCnttSummary;
  /** When the cache entry was built (the last cache rebuild). */
  computedAt: string | null;
}

export interface CompanyTtmIndexState {
  /** Company-wide TTM-CNTT (SỚM); undefined while loading, null when nothing is cached yet. */
  earlyStart: EarlyStartActualIndex | null | undefined;
  /** Company-wide TTM-CNTT (QLDA) / (QA) / TTM-E2E; undefined while loading, null before the first import. */
  global: TtmIndexGlobalCache | null | undefined;
}

interface CompanyPayload {
  earlyStart: EarlyStartActualIndex | null;
  global: TtmIndexGlobalCache | null;
}

/** One request shared by every widget of the page, kept 60 s (the numbers change only when the caches are rebuilt). */
const SHARE_MS = 60_000;
let shared: { at: number; promise: Promise<CompanyPayload | null> } | null = null;

function fetchCompanyPayload(): Promise<CompanyPayload | null> {
  if (shared && Date.now() - shared.at < SHARE_MS) return shared.promise;
  const promise = fetch('/api/ttm-index-global')
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as {
        earlyStart?: { computedAt: string | null; earlyStart: TtmCnttSummary } | null;
        ttmIndexGlobal?: TtmIndexGlobalCache | null;
      };
      return {
        earlyStart: data.earlyStart ? { computedAt: data.earlyStart.computedAt, summary: data.earlyStart.earlyStart } : null,
        global: data.ttmIndexGlobal ?? null,
      };
    })
    .catch(() => null);
  shared = { at: Date.now(), promise };
  void promise.then((payload) => { if (!payload && shared?.promise === promise) shared = null; });
  return promise;
}

/**
 * The company-wide numbers of the header widgets of TTM Dashboard 2 and Quản trị Epic (owner 2026-11-07): TTM-CNTT
 * (QLDA), (SỚM), (QA) and TTM-E2E — the same for every user, whatever their projects. Never computed here: the caches
 * are written by every rebuild (import, daily run, "Tạo lại cache"), so they follow the data layer rather than being
 * real-time.
 */
export function useCompanyTtmIndex(): CompanyTtmIndexState {
  const [state, setState] = useState<CompanyTtmIndexState>({ earlyStart: undefined, global: undefined });
  useEffect(() => {
    let active = true;
    void fetchCompanyPayload().then((payload) => {
      if (active) setState({ earlyStart: payload?.earlyStart ?? null, global: payload?.global ?? null });
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
