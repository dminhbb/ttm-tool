/**
 * "Cần tạo lại cache" on the client. Since 2026-10-27 only a CSV import (manual or API) and the daily run rebuild the
 * derived caches by themselves; every other save that changes what they hold (users / PM-SM, projects, Domains, Epic
 * ngoại lệ, TTM scope, Rule Groups, a restored backup — and, through the Scoring Service fingerprint, Tiêu chí TTM,
 * Bộ ngân sách, Cảnh báo muộn %) only warns: a toast right after the save, and an unread dot on the "Nguồn dữ liệu"
 * menu item and on the "Theo dõi cache dữ liệu" tab, until a SUPERADMIN runs "Tạo lại cache". The state comes from
 * GET /api/admin/data-source/cache-rebuild-status (SUPERADMIN); the toast from the response header the saving route
 * adds (CACHE_STALE_HEADER, daily-cache-service.ts markCacheStale).
 */
export const CACHE_REBUILD_STATUS_EVENT = 'ttm-cache-rebuild-status-changed';

export const CACHE_REBUILD_STATUS_URL = '/api/admin/data-source/cache-rebuild-status';

/** Response header of a save that marked the caches stale; its value is the source (CACHE_STALE_SOURCE_LABELS). */
export const CACHE_STALE_HEADER = 'x-cache-stale';

/** Tab of Quản trị nguồn dữ liệu holding "Theo dõi cache dữ liệu" — the menu item opens it while a rebuild is pending. */
export const CACHE_TAB_HREF = '/?tab=cache';

/** Tail of the toast shown after a save that does not rebuild the caches. */
export const CACHE_REBUILD_SUGGESTION_TAIL = 'Số liệu trên các màn hình chưa đổi cho tới khi tạo lại cache — khi đã chỉnh xong, SUPERADMIN vào Quản trị nguồn dữ liệu → tab "Theo dõi cache dữ liệu" → Tạo lại cache.';

/** What marked the caches stale (markCacheStale sources), in words. */
export const CACHE_STALE_SOURCE_LABELS: Record<string, string> = {
  'black-listed-epic': 'Epic ngoại lệ',
  'black-listed-epics': 'Epic ngoại lệ',
  domains: 'Domain',
  projects: 'dự án',
  'rule-groups': 'nhóm rule (Rule Management)',
  'sql-import': 'dữ liệu khôi phục từ file backup',
  'ttm-scope-config': 'Phạm vi dữ liệu cho TTM',
  users: 'người dùng / PM-SM',
};

export function describeStaleSources(sources: readonly string[]): string {
  return [...new Set(sources.map((source) => CACHE_STALE_SOURCE_LABELS[source] ?? source))].join(', ');
}

/** The toast after a save whose route answered with CACHE_STALE_HEADER. */
export function cacheStaleToastText(source: string): string {
  return `Cảnh báo: ${describeStaleSources([source])} vừa thay đổi nhưng cache chưa được tạo lại. ${CACHE_REBUILD_SUGGESTION_TAIL}`;
}

export function notifyCacheRebuildStatusChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CACHE_REBUILD_STATUS_EVENT));
}

export interface CacheRebuildPendingState {
  pending: boolean;
  /** What marked the caches stale (empty when only the configuration fingerprint differs). */
  staleReasons: readonly string[];
}

const NOT_PENDING: CacheRebuildPendingState = { pending: false, staleReasons: [] };

export async function fetchCacheRebuildStatus(): Promise<CacheRebuildPendingState> {
  try {
    const response = await fetch(CACHE_REBUILD_STATUS_URL, { cache: 'no-store' });
    if (!response.ok) return NOT_PENDING;
    const body = (await response.json()) as { pending?: boolean; staleReasons?: string[] };
    return { pending: Boolean(body.pending), staleReasons: Array.isArray(body.staleReasons) ? body.staleReasons : [] };
  } catch {
    return NOT_PENDING;
  }
}

/** One poll for the whole page (the menu dot and the tab dot used to poll separately), every 3 minutes while visible. */
export const CACHE_REBUILD_POLL_MS = 180_000;

let state: CacheRebuildPendingState = NOT_PENDING;
let inFlight: Promise<void> | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function refresh(): Promise<void> {
  inFlight ??= fetchCacheRebuildStatus()
    .then((next) => {
      if (next.pending !== state.pending || next.staleReasons.join('|') !== state.staleReasons.join('|')) {
        state = next;
        listeners.forEach((listener) => listener());
      }
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

function onEvent(): void {
  void refresh();
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void refresh();
}

/** useSyncExternalStore subscription: the first subscriber starts the single poller, the last one stops it. */
export function subscribeCacheRebuildPending(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    void refresh();
    timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, CACHE_REBUILD_POLL_MS);
    window.addEventListener(CACHE_REBUILD_STATUS_EVENT, onEvent);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      window.removeEventListener(CACHE_REBUILD_STATUS_EVENT, onEvent);
      document.removeEventListener('visibilitychange', onVisible);
      state = NOT_PENDING;
    }
  };
}

export function getCacheRebuildPendingState(): CacheRebuildPendingState {
  return state;
}

let onStale: ((source: string) => void) | null = null;
let watcherInstalled = false;

/**
 * Wraps window.fetch once: a response carrying CACHE_STALE_HEADER (a save that marked the caches stale) calls `handler`
 * with the source — the app shows the warning toast — and refreshes the dots. Replaces the handler on later calls.
 */
export function installCacheStaleWatcher(handler: (source: string) => void): void {
  onStale = handler;
  if (watcherInstalled || typeof window === 'undefined') return;
  watcherInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    const source = response.ok ? response.headers.get(CACHE_STALE_HEADER) : null;
    if (source) {
      onStale?.(source);
      notifyCacheRebuildStatusChanged();
    }
    return response;
  };
}
