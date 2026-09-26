'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';

type DailyCacheState = 'FAILED' | 'FRESH' | 'RUNNING' | 'STALE';

const FRESH_FOR_DAY_KEY = 'ttm-daily-cache-fresh-for';
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function vietnamToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function readFreshDay(): string | null {
  try { return window.sessionStorage.getItem(FRESH_FOR_DAY_KEY); } catch { return null; }
}

function writeFreshDay(day: string) {
  try { window.sessionStorage.setItem(FRESH_FOR_DAY_KEY, day); } catch { /* storage unavailable — just re-check next load */ }
}

/**
 * Kicks off "Caching dữ liệu trong ngày" (see daily-cache-service.ts) on the first signed-in page
 * load of the day — the server guarantees only one caller actually rebuilds. If this page saw the
 * rebuild in progress (it started it, or someone else's run was still going), it follows it to the
 * end, then offers a reload so the current screen re-reads the fresh cache. Once today is known to
 * be fresh, this tab stops asking until the next day.
 */
export function DailyCacheWarmer({ enabled }: { enabled: boolean }) {
  const [askReload, setAskReload] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const today = vietnamToday();
    if (readFreshDay() === today) return undefined;

    let cancelled = false;
    let timer: number | undefined;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      try {
        const res = await fetch('/api/system/daily-cache', { cache: 'no-store' });
        const body = (await res.json()) as { state?: DailyCacheState; today?: string };
        if (cancelled) return;
        if (body.state === 'FRESH') {
          writeFreshDay(body.today ?? today);
          showToast('Caching dữ liệu trong ngày hoàn thành', 5000);
          setAskReload(true);
          return;
        }
        if (body.state === 'RUNNING' && Date.now() < deadline) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled && Date.now() < deadline) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void (async () => {
      try {
        const res = await fetch('/api/system/daily-cache', { method: 'POST' });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { state?: DailyCacheState; today?: string };
        if (cancelled) return;
        if (body.state === 'FRESH') writeFreshDay(body.today ?? today);
        else if (body.state === 'RUNNING') timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        // FAILED (cooling down before a retry) / STALE: nothing to follow — the next page load retries.
      } catch {
        // Network hiccup: harmless, the next page load tries again.
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
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
