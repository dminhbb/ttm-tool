'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Tooltip } from '@/components/ui/Tooltip';
import type { FooterVisitSummary } from '@/lib/visit-counter-types';

type SystemStatus = {
  dbStatus: 'fail' | 'pass';
  dbTarget: 'aiven' | 'local' | 'supabase';
  version: string;
};

/**
 * Formats an ISO date string into `DD/MM/YYYY HH:mm:ss` in GMT+7 (Asia/Ho_Chi_Minh).
 */
function formatLoginDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(date).replace(',', '');
  } catch {
    try {
      const date = new Date(isoString);
      const pad = (n: number) => String(n).padStart(2, '0');
      const utc = date.getTime() + date.getTimezoneOffset() * 60000;
      const gmt7 = new Date(utc + 7 * 3600000);
      return `${pad(gmt7.getDate())}/${pad(gmt7.getMonth() + 1)}/${gmt7.getFullYear()} ${pad(gmt7.getHours())}:${pad(gmt7.getMinutes())}:${pad(gmt7.getSeconds())}`;
    } catch {
      return isoString;
    }
  }
}

/**
 * Centered application footer shown on all screens:
 * Line 1: TTM Tool | Version {version} | Total visit: {A}. Weekly: {B}. {This screen: {C}. }Last login users: {D}.
 * Line 2: (C) minhnd7. db: {dbTarget} - {dbStatus}
 */
export function SystemStatusFooter() {
  const pathname = usePathname();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [visitSummary, setVisitSummary] = useState<FooterVisitSummary | null>(null);

  // Fetch system status once on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/system/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: SystemStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch visit counter summary whenever pathname changes
  useEffect(() => {
    let cancelled = false;
    const pathParam = encodeURIComponent(pathname || '');
    fetch(`/api/visit-counter/footer?path=${pathParam}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: FooterVisitSummary) => {
        if (!cancelled) setVisitSummary(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!status) return null;

  const totalVisitsText = visitSummary ? visitSummary.totalVisits.toLocaleString('vi-VN') : '—';
  const weeklyVisitsText = visitSummary ? visitSummary.weeklyVisits.toLocaleString('vi-VN') : '—';
  const hasScreenVisits = Boolean(visitSummary && visitSummary.screenVisits !== null);
  const screenVisitsText = hasScreenVisits ? visitSummary!.screenVisits!.toLocaleString('vi-VN') : null;
  const recentUsers = visitSummary ? visitSummary.lastLoginUsers : null;

  return (
    <footer className="w-full shrink-0 px-3 py-2 flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
      {/* Line 1: General Stats, optional screen visits, and 5 recent login users */}
      <div className="flex flex-wrap items-center justify-center gap-y-0.5 text-center text-[11px] text-slate-500">
        <span>TTM Tool | Version {status.version} |</span>{' '}
        <span>Total visit: {totalVisitsText}.</span>{' '}
        <span>Weekly: {weeklyVisitsText}.</span>{' '}
        {hasScreenVisits && (
          <>
            <span>This screen: {screenVisitsText}.</span>{' '}
          </>
        )}
        <span>Last login users:</span>{' '}
        {recentUsers === null ? (
          <span>…</span>
        ) : recentUsers.length === 0 ? (
          <span>—.</span>
        ) : (
          <>
            {recentUsers.map((user, idx) => (
              <React.Fragment key={user.userId ? `user-${user.userId}` : `user-${user.username}-${idx}`}>
                {idx > 0 && <span>,&nbsp;</span>}
                <Tooltip
                  className="inline-flex w-auto"
                  side="top"
                  content={
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="font-semibold text-fb-text-primary">{user.fullName || user.username}</span>
                      <span className="text-[11px] font-normal text-fb-text-secondary">{formatLoginDateTime(user.lastLoginAt)}</span>
                    </div>
                  }
                >
                  <span className="cursor-pointer font-medium text-slate-600 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-slate-900 transition-colors">
                    {user.username}
                  </span>
                </Tooltip>
              </React.Fragment>
            ))}
            <span>.</span>
          </>
        )}
      </div>

      {/* Line 2: Copyright & DB Target/Status */}
      <p className="text-[10px] text-gray-400 opacity-80 text-center">
        (C) minhnd7. db: {status.dbTarget} - {status.dbStatus}
      </p>
    </footer>
  );
}
