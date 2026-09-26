import { ScreenKey } from '@/lib/visit-counter-types';

const DEBOUNCE_MS = 30_000;
const STORAGE_PREFIX = 'ttm_last_screen_track_';

/**
 * Resolves a URL pathname to one of the 4 tracked ScreenKeys, or null if untracked.
 */
export function resolveScreenKeyFromPathname(pathname: string): ScreenKey | null {
  if (!pathname) return null;
  const normalized = pathname.split('?')[0].replace(/\/+$/, '') || '/';

  if (normalized === '/dashboard-new' || normalized === '/dashboard') {
    return 'dashboard';
  }
  if (normalized === '/epic-alerts-15' || normalized === '/epic-alerts') {
    return 'epic_alerts';
  }
  if (normalized === '/reports') {
    return 'epic_reports';
  }
  if (normalized === '/epic-in-po') {
    return 'epic_in_po';
  }

  return null;
}

/**
 * Records a screen visit asynchronously with client-side 30s debouncing per screen.
 * Debounce state is maintained in sessionStorage so repeated renders or rapid tab re-entries
 * do not trigger duplicate database counter increments.
 */
export function trackScreenVisit(screenKey: ScreenKey): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const storageKey = `${STORAGE_PREFIX}${screenKey}`;

  try {
    const lastTrackedStr = window.sessionStorage.getItem(storageKey);
    if (lastTrackedStr) {
      const lastTracked = parseInt(lastTrackedStr, 10);
      if (!Number.isNaN(lastTracked) && now - lastTracked < DEBOUNCE_MS) {
        return;
      }
    }
    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    // sessionStorage access could fail in some privacy/sandbox modes; proceed anyway
  }

  fetch('/api/visit-counter/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenKey }),
  }).catch(() => undefined);
}
