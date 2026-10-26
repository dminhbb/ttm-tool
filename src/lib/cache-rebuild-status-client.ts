/**
 * "Cần tạo lại cache" on the client (2026-10-26): the screens that save a setting which deliberately does not
 * rebuild the caches (Tiêu chí TTM, Bộ ngân sách, Cảnh báo muộn %) — and the rebuild itself — dispatch this event so
 * the unread dot of the "Theo dõi cache dữ liệu" tab and of the "Nguồn dữ liệu" menu item refresh at once instead
 * of at the next poll. The state itself comes from GET /api/admin/data-source/cache-rebuild-status.
 */
export const CACHE_REBUILD_STATUS_EVENT = 'ttm-cache-rebuild-status-changed';

export const CACHE_REBUILD_STATUS_URL = '/api/admin/data-source/cache-rebuild-status';

/** Tab of Quản trị nguồn dữ liệu holding "Theo dõi cache dữ liệu" — the menu item opens it while a rebuild is pending. */
export const CACHE_TAB_HREF = '/?tab=cache';

/** Tail of the toast shown after saving a setting that deliberately does not rebuild the caches. */
export const CACHE_REBUILD_SUGGESTION_TAIL = 'Số liệu trên các màn hình chưa đổi cho tới khi tạo lại cache — khi đã chỉnh xong, vào Quản trị nguồn dữ liệu → tab "Theo dõi cache dữ liệu" → Tạo lại cache.';

export function notifyCacheRebuildStatusChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CACHE_REBUILD_STATUS_EVENT));
}

export async function fetchCacheRebuildPending(): Promise<boolean> {
  try {
    const response = await fetch(CACHE_REBUILD_STATUS_URL, { cache: 'no-store' });
    if (!response.ok) return false;
    return Boolean(((await response.json()) as { pending?: boolean }).pending);
  } catch {
    return false;
  }
}
