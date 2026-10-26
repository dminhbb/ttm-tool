'use client';

import * as React from 'react';
import { CACHE_REBUILD_STATUS_EVENT, fetchCacheRebuildPending } from '@/lib/cache-rebuild-status-client';

/**
 * "Cần tạo lại cache" for the unread dots (2026-10-26) — polled once a minute while the tab is visible, and
 * refreshed at once when a screen saves a manual-rebuild setting or a rebuild finishes
 * (notifyCacheRebuildStatusChanged). `enabled` = false (not a SUPERADMIN) never calls the API.
 */
export function useCacheRebuildPending(enabled: boolean): boolean {
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () => {
      void fetchCacheRebuildPending().then((value) => { if (!cancelled) setPending(value); });
    };
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const intervalId = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    window.addEventListener(CACHE_REBUILD_STATUS_EVENT, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(CACHE_REBUILD_STATUS_EVENT, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
  return enabled && pending;
}
