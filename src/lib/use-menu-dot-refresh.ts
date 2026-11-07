'use client';

import * as React from 'react';

/**
 * Keeps a menu red dot fresh without hammering the database (free-tier Supabase / Vercel, owner 2026-11-06).
 * `load` runs: at once when enabled; after any of `events` (something in this tab changed it); and — only while the tab
 * is visible and the last load is older than `staleMs` — on a tab returning to the foreground, on navigation
 * (`navigationKey` changing) and on a slow `pollMs` timer. A hidden tab never polls.
 */
export function useMenuDotRefresh(
  load: () => void,
  options: { enabled: boolean; events?: readonly string[]; navigationKey?: string; pollMs: number; staleMs: number },
): void {
  const { enabled, events = [], navigationKey, pollMs, staleMs } = options;
  const loadRef = React.useRef(load);
  const lastRef = React.useRef(0);
  React.useEffect(() => { loadRef.current = load; });

  const run = React.useCallback((force: boolean) => {
    if (!force && (document.visibilityState !== 'visible' || Date.now() - lastRef.current < staleMs)) return;
    lastRef.current = Date.now();
    loadRef.current();
  }, [staleMs]);

  // Enabled (or the role changed): load now. Later navigations only reload a stale dot.
  React.useEffect(() => {
    if (enabled) run(true);
  }, [enabled, run]);

  React.useEffect(() => {
    if (enabled) run(false);
  }, [enabled, navigationKey, run]);

  const eventKey = events.join('|');
  React.useEffect(() => {
    if (!enabled) return undefined;
    const names = eventKey ? eventKey.split('|') : [];
    const onEvent = () => run(true);
    const onVisible = () => run(false);
    const timer = window.setInterval(() => run(false), pollMs);
    names.forEach((name) => window.addEventListener(name, onEvent));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      names.forEach((name) => window.removeEventListener(name, onEvent));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, eventKey, pollMs, run]);
}
