'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Lets a page "beam" small header-bar widgets up into AppShell's shared sticky header (the bar
 * that already shows the page title/subtitle) without AppShell fetching any page-specific data
 * itself — the page (e.g. epic-alerts-15) already has the numbers in memory from its own fetch, so
 * this only carries the already-computed display strings, never triggers a query. AppShell owns all
 * rendering (label/value/tooltip markup); the page only supplies data.
 */
export interface EpicHeaderWidgetItem {
  key: string;
  label: string;
  /** Multi-line tooltip text (rendered with the same `Tooltip` component used by the "Nhận xét"
   * badges elsewhere) — join lines with '\n'. */
  tooltip: string;
  tone: 'qa' | 'ttm';
  /** Already formatted for display, e.g. "91,5%" or "—" when there's nothing to show yet. */
  value: string;
}

interface EpicHeaderWidgetsContextValue {
  items: EpicHeaderWidgetItem[] | null;
  setItems: (items: EpicHeaderWidgetItem[] | null) => void;
}

const EpicHeaderWidgetsContext = createContext<EpicHeaderWidgetsContextValue | null>(null);

export function EpicHeaderWidgetsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EpicHeaderWidgetItem[] | null>(null);
  return (
    <EpicHeaderWidgetsContext.Provider value={{ items, setItems }}>
      {children}
    </EpicHeaderWidgetsContext.Provider>
  );
}

/** Call from a page to publish its header widgets — pass `null` (or unmount) to clear them. */
export function useEpicHeaderWidgets(): EpicHeaderWidgetsContextValue {
  const ctx = useContext(EpicHeaderWidgetsContext);
  if (!ctx) throw new Error('useEpicHeaderWidgets must be used within EpicHeaderWidgetsProvider (see AppShell.tsx)');
  return ctx;
}
