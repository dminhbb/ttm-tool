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

  if (!current) return null;

  const dismissCurrent = () => setQueue((prev) => prev.slice(1));
  // "Số lần hiện tối đa" counts at display time, not at dismiss time — see recordAdPopupImpression.
  const recordImpression = () => { fetch(`/api/ad-popups/${current.id}/impression`, { method: 'POST' }).catch(() => undefined); };

  return (
    <AdPopupCard
      key={current.id}
      campaignName={current.campaignName}
      clickUrl={current.clickUrl}
      forceView={current.forceView}
      heightPercent={current.heightPercent}
      imageUrl={current.imageUrl}
      message={current.message}
      onDismiss={dismissCurrent}
      onShown={recordImpression}
      timeoutSeconds={current.timeoutSeconds}
      widthPercent={current.widthPercent}
    />
  );
}
