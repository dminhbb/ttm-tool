'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';

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
const IDLE_POLL_INTERVAL_MS = 15000;
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
 */
export function DailyCacheWarmer({ enabled }: { enabled: boolean }) {
  const [askReload, setAskReload] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const isRebuildingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer: number | undefined;

    const checkCacheStatus = async () => {
      try {
        const res = await fetch('/api/system/daily-cache', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as DailyCacheApiResponse;
        if (cancelled) return;

        const currentlyRebuilding = Boolean(body.isRebuilding || body.state === 'RUNNING');
        const wasRebuilding = isRebuildingRef.current;

        if (currentlyRebuilding && !wasRebuilding) {
          isRebuildingRef.current = true;
          setIsRebuilding(true);
          showToast('Hệ thống đang tính toán lại cache', 5000);
        } else if (!currentlyRebuilding && wasRebuilding) {
          isRebuildingRef.current = false;
          setIsRebuilding(false);
          showToast('Tạo Cache hoàn thành', 5000);
          if (body.state === 'FRESH' && body.today) {
            writeFreshDay(body.today);
          }
        }

        if (currentlyRebuilding) {
          timer = window.setTimeout(checkCacheStatus, ACTIVE_POLL_INTERVAL_MS);
        } else {
          timer = window.setTimeout(checkCacheStatus, IDLE_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(checkCacheStatus, isRebuildingRef.current ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS);
        }
      }
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
            isRebuildingRef.current = true;
            setIsRebuilding(true);
            showToast('Hệ thống đang tính toán lại cache', 5000);
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

    const onTriggered = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void checkCacheStatus();
    };

    window.addEventListener(CACHE_REFRESH_TRIGGERED_EVENT, onTriggered);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(CACHE_REFRESH_TRIGGERED_EVENT, onTriggered);
    };
  }, [enabled]);

  return (
    <>
      {isRebuilding && (
        <div className="fixed top-3 right-5 z-[9999] pointer-events-none flex items-center gap-2 rounded-full border border-blue-300 bg-blue-50/95 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-lg backdrop-blur-xs transition-all dark:border-blue-700 dark:bg-blue-950/95 dark:text-blue-200">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-blue-600 dark:bg-blue-400" />
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
