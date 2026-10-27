'use client';

import * as React from 'react';
import { getCacheRebuildPendingState, subscribeCacheRebuildPending } from '@/lib/cache-rebuild-status-client';
import type { CacheRebuildPendingState } from '@/lib/cache-rebuild-status-client';

const NOT_PENDING: CacheRebuildPendingState = { pending: false, staleReasons: [] };
const noSubscription = () => () => undefined;

/** The shared "Cần tạo lại cache" state (one poller for every component using it). `enabled` = false (not a SUPERADMIN) never calls the API. */
export function useCacheRebuildState(enabled: boolean): CacheRebuildPendingState {
  const state = React.useSyncExternalStore(enabled ? subscribeCacheRebuildPending : noSubscription, getCacheRebuildPendingState, () => NOT_PENDING);
  return enabled ? state : NOT_PENDING;
}

export function useCacheRebuildPending(enabled: boolean): boolean {
  return useCacheRebuildState(enabled).pending;
}
