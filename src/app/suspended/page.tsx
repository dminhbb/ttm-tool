'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SystemSuspendedView } from '@/components/system/SystemSuspendedView';
import type { PublicSystemSuspension } from '@/lib/system-suspension';

/** "Tạm dừng hệ thống" — where the proxy sends everyone below SUPERADMIN while the pause is ON. Back to the app once it is OFF. */
export default function SuspendedPage() {
  const router = useRouter();
  const [state, setState] = useState<PublicSystemSuspension | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/system/suspension', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Partial<PublicSystemSuspension> | null) => {
        if (cancelled || !data) return;
        if (!data.isSuspended) {
          router.replace('/');
          return;
        }
        setState(data as PublicSystemSuspension);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    document.title = 'Hệ thống đang tạm dừng — TTM Monitor';
  }, []);

  if (!state) return <main className="min-h-[100dvh] bg-fb-bg" aria-busy="true" />;
  return (
    <SystemSuspendedView
      allowMcp={state.allowMcp}
      allowNewsLetter={state.allowNewsLetter}
      mcpEnabled={state.mcpEnabled}
      messageHtml={state.messageHtml}
    />
  );
}
