'use client';

import { useEffect, useState } from 'react';

type SystemStatus = { dbStatus: 'fail' | 'pass'; dbTarget: 'aiven' | 'local'; version: string };

/** Bottom-right build/DB-status readout — shown on the login screen and every authenticated screen. */
export function SystemStatusFooter() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/system/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: SystemStatus) => { if (!cancelled) setStatus(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!status) return null;

  return (
    <footer className="w-full shrink-0 px-3 py-2 text-right text-xs leading-tight" style={{ color: 'grey' }}>
      <p>TTM tool - version {status.version}. (C) minhnd7</p>
      <p>db: {status.dbTarget} - {status.dbStatus}</p>
    </footer>
  );
}
