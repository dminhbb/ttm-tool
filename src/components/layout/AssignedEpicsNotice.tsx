'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserFocus, X } from '@phosphor-icons/react';

/**
 * Login notice at the bottom-right of the page (owner 2026-10-28), like a new-mail toast: "My assigned epics —
 * Bạn có {n} epic được giao task!", n = the user's assigned Epics whose "Giao việc" is not Done. Shown once per
 * login (the API's `loginKey` changes with every login; the last one shown is remembered in localStorage), gone
 * after 15 seconds, and a click opens Quản trị Epic with the "My assigned epics" quick filter already on.
 * Nothing is shown when the count is 0.
 */

export const ASSIGNED_NOTICE_SECONDS = 15;
const SHOWN_LOGIN_KEY = 'ttm-assigned-epics-notice-login';

function readShownLogin(): string | null {
  try {
    return window.localStorage.getItem(SHOWN_LOGIN_KEY);
  } catch {
    return null;
  }
}

function rememberShownLogin(loginKey: string): void {
  try {
    window.localStorage.setItem(SHOWN_LOGIN_KEY, loginKey);
  } catch {
    // Storage blocked: the notice may show again on the next page load — acceptable.
  }
}

export function AssignedEpicsNotice() {
  const router = useRouter();
  const [count, setCount] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    let hideTimer: number | undefined;
    let showFrame: number | undefined;
    void (async () => {
      try {
        const response = await fetch('/api/epic-marks/assigned-notice', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number; loginKey?: string };
        const loginKey = data.loginKey ?? '';
        if (controller.signal.aborted || !loginKey || readShownLogin() === loginKey) return;
        rememberShownLogin(loginKey);
        if (!data.count || data.count < 1) return;
        setCount(data.count);
        showFrame = window.requestAnimationFrame(() => setVisible(true));
        hideTimer = window.setTimeout(() => setVisible(false), ASSIGNED_NOTICE_SECONDS * 1000);
      } catch {
        // A notice is optional: stay silent when it cannot be loaded.
      }
    })();
    return () => {
      controller.abort();
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      if (showFrame !== undefined) window.cancelAnimationFrame(showFrame);
    };
  }, []);

  if (count < 1) return null;
  return (
    <div
      aria-hidden={!visible}
      className={`fixed right-4 bottom-4 z-[110] w-[min(460px,calc(100vw-2rem))] transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
      role="status"
    >
      <div
        className="relative flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-status-danger bg-status-danger-soft p-5 pr-11 text-fb-text-primary shadow-2xl"
        onClick={() => { setVisible(false); router.push('/epic-alerts-15?markFilter=MINE'); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { setVisible(false); router.push('/epic-alerts-15?markFilter=MINE'); } }}
        role="link"
        tabIndex={visible ? 0 : -1}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-status-danger text-white">
          <UserFocus className="size-7" weight="fill" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-bold">My assigned epics</span>
          <span className="mt-1 block text-base font-medium">Bạn có {count} epic được giao task!</span>
        </span>
        <button
          aria-label="Đóng thông báo"
          className="absolute top-3 right-3 flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fb-text-secondary outline-none hover:bg-fb-control hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue"
          onClick={(event) => { event.stopPropagation(); setVisible(false); }}
          type="button"
        >
          <X className="size-4" weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
