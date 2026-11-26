'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  claimBottomRightSlot,
  enqueueCacheFloatMessage,
  FLOAT_MESSAGE_PRIORITY,
} from '@/lib/bottom-right-slot';
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
 * Displays 'Hệ thống đang tính toán lại cache' and 'Tạo Cache hoàn thành' via the unified Float message
 * queue with Priority #1 (timeout = 10s, dismissible with 'x').
 * When the rebuild this tab followed from that first load ends well, it offers a reload so the current
 * screen re-reads the fresh cache.
 */
/** Longest wait for one cache-status check (the queue's initial hold is released when it ends, answer or not). */
const CACHE_CHECK_TIMEOUT_MS = 15_000;

export function DailyCacheWarmer({ enabled }: { enabled: boolean }) {
  const [askReload, setAskReload] = useState(false);
  const isRebuildingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    // Bumped by every check, so a slower earlier one can't schedule a second polling chain.
    let latestCheck = 0;
    // True while the rebuild in progress is the day's first one, seen starting from this tab.
    let followingDailyRun = false;
    const releaseInitialCheck = claimBottomRightSlot('cache-warmer-init', FLOAT_MESSAGE_PRIORITY.CACHE);

    const markRebuilding = () => {
      if (isRebuildingRef.current) return;
      isRebuildingRef.current = true;
      enqueueCacheFloatMessage('Hệ thống đang tính toán lại cache', 'cache-rebuilding');
    };

    const checkCacheStatus = async () => {
      const check = ++latestCheck;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      try {
        // Bounded (REQ-20261126-02): a request that never answers must not hold the Float message queue forever.
        const res = await fetch('/api/system/daily-cache', { cache: 'no-store', signal: AbortSignal.timeout(CACHE_CHECK_TIMEOUT_MS) });
        // A failed check (e.g. the pool is busy mid-rebuild) keeps what is known and tries again.
        const body = res.ok ? ((await res.json()) as DailyCacheApiResponse) : null;
        if (cancelled || check !== latestCheck) return;
        if (body) {
          const currentlyRebuilding = Boolean(body.isRebuilding || body.state === 'RUNNING');
          if (currentlyRebuilding) {
            markRebuilding();
          } else if (isRebuildingRef.current) {
            isRebuildingRef.current = false;
            // The unread "cần tạo lại cache" dots re-check now that a rebuild has ended (2026-10-26).
            notifyCacheRebuildStatusChanged();
            if (body.state === 'FAILED') {
              enqueueCacheFloatMessage('Tạo Cache không thành công — số liệu đang hiển thị có thể chưa được cập nhật', 'cache-rebuild-result');
            } else {
              enqueueCacheFloatMessage('Tạo Cache hoàn thành', 'cache-rebuild-result');
              if (body.state === 'FRESH' && body.today) writeFreshDay(body.today);
              if (followingDailyRun) setAskReload(true);
            }
            followingDailyRun = false;
          }
        }
      } catch {
        if (cancelled || check !== latestCheck) return;
      } finally {
        releaseInitialCheck();
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
          else releaseInitialCheck();
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
      releaseInitialCheck();
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(CACHE_REFRESH_TRIGGERED_EVENT, onTriggered);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  return (
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
  );
}
