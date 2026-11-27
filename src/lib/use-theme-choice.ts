'use client';

import * as React from 'react';
import { DEFAULT_THEME_BRAND, readAppliedThemeChoice, type ThemeChoice } from '@/lib/theme-brand';

function subscribeToThemeAttributes(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-brand', 'data-skin'] });
  return () => observer.disconnect();
}

/**
 * The theme applied to the page. Reads the attributes the blocking init script already set, via useSyncExternalStore so
 * the server snapshot is always the default (no hydration mismatch) and no effect-driven setState is needed.
 */
export function useThemeChoice(): ThemeChoice {
  return React.useSyncExternalStore<ThemeChoice>(subscribeToThemeAttributes, readAppliedThemeChoice, () => DEFAULT_THEME_BRAND);
}
