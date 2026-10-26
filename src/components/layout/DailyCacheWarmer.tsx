'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { notifyCacheRebuildStatusChanged } from '@/lib/cache-rebuild-status-client';

export const CACHE_REFRESH_TRIGGERED_EVENT = 'ttm-cache-refresh-triggered';

/** Dispatches a global event so the cache watcher immediately checks status across all tabs. */
export function notifyCacheRefreshTriggered(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CACHE_REFRESH_TRIGGERED_EVENT));
  }
}

type DailyCacheState = 'FAILED' | 'FRESH' | 'RUNNING' | 'STALE';

interface DailyCacheApiResponse {
  isRebuilding?: boolean;
  state?: DailyCacheState;
  today?: string;
}

const FRESH_FOR_DAY_KEY = 'ttm-daily-cache-fresh-for';
/** While no rebuild is known to be running: a slow heartbeat, only in a visible tab — each check costs
 * a session lookup plus three queries on a connection pool that is capped low (see db.ts). */
const IDLE_POLL_INTERVAL_MS = 60000;
const ACTIVE_POLL_INTERVAL_MS = 2500;

function vietnamToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function readFreshDay(): string | null {
  try { return window.sessionStorage.getItem(FRESH_FOR_DAY_KEY); } catch { return null; }
}

function writeFreshDay(day: string) {
  try { window.sessionStorage.setItem(FRESH_FOR_DAY_KEY, day); } catch { /* storage unavailable */ }
}

/**
 * Kicks off "Caching dữ liệu trong ngày" on the first signed-in page load of the day,
 * and monitors ongoing cache rebuild processes globally across all screens.
 * Displays 'Hệ thống đang tính toán lại cache' and 'Tạo Cache hoàn thành' toasts with a progress indicator.
 * When the rebuild this tab followed from that first load ends well, it offers a reload so the current
 * screen re-reads the fresh cache.
 */
export function DailyCacheWarmer({ enabled }: { enabled: boolean }) {
  const [askReload, setAskReload] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const isRebuildingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    // Bumped by every check, so a slower earlier one can't schedule a second polling chain.
    let latestCheck = 0;
    // True while the rebuild in progress is the day's first one, seen starting from this tab.
    let followingDailyRun = false;

    const markRebuilding = () => {
      if (isRebuildingRef.current) return;
      isRebuildingRef.current = true;
      setIsRebuilding(true);
      showToast('Hệ thống đang tính toán lại cache', 5000);
    };

    const checkCacheStatus = async () => {
      const check = ++latestCheck;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      try {
        const res = await fetch('/api/system/daily-cache', { cache: 'no-store' });
        // A failed check (e.g. the pool is busy mid-rebuild) keeps what is known and tries again.
        const body = res.ok ? ((await res.json()) as DailyCacheApiResponse) : null;
        if (cancelled || check !== latestCheck) return;
        if (body) {
          const currentlyRebuilding = Boolean(body.isRebuilding || body.state === 'RUNNING');
          if (currentlyRebuilding) {
            markRebuilding();
          } else if (isRebuildingRef.current) {
            isRebuildingRef.current = false;
            setIsRebuilding(false);
            // The unread "cần tạo lại cache" dots re-check now that a rebuild has ended (2026-10-26).
            notifyCacheRebuildStatusChanged();
            if (body.state === 'FAILED') {
              showToast('Tạo Cache không thành công — số liệu đang hiển thị có thể chưa được cập nhật', 8000);
            } else {
              showToast('Tạo Cache hoàn thành', 5000);
              if (body.state === 'FRESH' && body.today) writeFreshDay(body.today);
              if (followingDailyRun) setAskReload(true);
            }
            followingDailyRun = false;
          }
        }
      } catch {
        if (cancelled || check !== latestCheck) return;
      }
      if (isRebuildingRef.current) timer = window.setTimeout(checkCacheStatus, ACTIVE_POLL_INTERVAL_MS);
      else if (!document.hidden) timer = window.setTimeout(checkCacheStatus, IDLE_POLL_INTERVAL_MS);
      // Hidden and idle: nothing is scheduled — onVisibilityChange checks again when the tab is back.
    };

    // First load of the day check
    const today = vietnamToday();
    if (readFreshDay() !== today) {
      void (async () => {
        try {
          const res = await fetch('/api/system/daily-cache', { method: 'POST' });
          if (!res.ok || cancelled) return;
          const body = (await res.json()) as DailyCacheApiResponse;
          if (cancelled) return;
          if (body.state === 'FRESH') writeFreshDay(body.today ?? today);
          else if (body.isRebuilding || body.state === 'RUNNING') {
            followingDailyRun = true;
            markRebuilding();
          }
        } catch {
          // ignore
        } finally {
          if (!cancelled) void checkCacheStatus();
        }
      })();
    } else {
      void checkCacheStatus();
    }

    const onTriggered = () => { void checkCacheStatus(); };
    const onVisibilityChange = () => {
      if (!document.hidden) void checkCacheStatus();
    };

    window.addEventListener(CACHE_REFRESH_TRIGGERED_EVENT, onTriggered);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(CACHE_REFRESH_TRIGGERED_EVENT, onTriggered);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  return (
    <>
      {isRebuilding && (
        <div className="fixed top-3 right-5 z-[9999] pointer-events-none flex items-center gap-2 rounded-full border border-fb-blue bg-fb-blue-soft/95 px-3 py-1.5 text-xs font-semibold text-fb-blue shadow-lg backdrop-blur-xs transition-all">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fb-blue opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-fb-blue" />
          </span>
          <span>Hệ thống đang tính toán lại cache...</span>
        </div>
      )}

      <Modal
        isOpen={askReload}
        onClose={() => setAskReload(false)}
        title="Dữ liệu trong ngày đã sẵn sàng"
        footer={(
          <>
            <Button variant="outline" onClick={() => setAskReload(false)}>Để sau</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>Tải lại trang</Button>
          </>
        )}
      >
        <p className="text-fb-text-secondary">
          Cache dữ liệu trong ngày vừa được tạo xong. Bạn có muốn tải lại trang hiện tại để xem số liệu mới nhất không?
        </p>
      </Modal>
    </>
  );
}
