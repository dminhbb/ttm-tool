'use client';

import { useEffect, useState } from 'react';
import { AdPopupCard } from '@/components/layout/AdPopupCard';
import type { AdPopupPublic } from '@/lib/ad-popup-types';

/**
 * Shows eligible "Popup quảng cáo" campaigns (configured under Quản lý chung → Popup quảng cáo)
 * one at a time after the user is on an authenticated screen. Mounted once in AppShell (after its
 * /login early-return, so it never renders on the login page itself); fetches the eligible list
 * exactly once per app load — a popup that reaches its own max-impressions cap during this session
 * simply won't be eligible again on the next full reload.
 */
export function AdPopupDisplay() {
  const [queue, setQueue] = useState<AdPopupPublic[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ad-popups/active', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdPopupPublic[]) => { if (!cancelled) setQueue(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const dismissCurrent = () => setQueue((prev) => prev.slice(1));

  // Fires once per popup actually shown: records the impression (see recordAdPopupImpression's
  // doc comment — counts at display time, not at dismiss time) and starts its own countdown timer,
  // using that campaign's own configured timeoutSeconds.
  useEffect(() => {
    if (!current) return undefined;
    fetch(`/api/ad-popups/${current.id}/impression`, { method: 'POST' }).catch(() => undefined);
    const timer = setTimeout(dismissCurrent, current.timeoutSeconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissCurrent is a stable setState updater, not a real dependency.
  }, [current?.id]);

  if (!current) return null;

  return (
    <AdPopupCard
      campaignName={current.campaignName}
      clickUrl={current.clickUrl}
      imageUrl={current.imageUrl}
      message={current.message}
      onDismiss={dismissCurrent}
      timeoutSeconds={current.timeoutSeconds}
    />
  );
}
