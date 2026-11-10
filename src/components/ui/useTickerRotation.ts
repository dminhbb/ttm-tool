'use client';

import * as React from 'react';

/**
 * The rotation of a one-line ticker (TTM Dashboard 2 "So với <ngày>" — TrendTicker — and the pinned articles of "Bản tin"
 * — NewsLetterPinnedTicker): one item at a time, each growing up from below and shown for `intervalMs`; `playing` is the
 * play / pause switch. With "reduce motion" set in the OS the items still change, without the animation.
 *
 * `index` keeps counting up — read the item as `items[index % items.length]`; give the item element `key={index}` so it
 * re-mounts and grows in.
 */
export const TICKER_ITEM_MS = 3000;
const GROW_MS = 400;

export function useTickerRotation(count: number, intervalMs = TICKER_ITEM_MS): {
  index: number;
  itemStyle: React.CSSProperties;
  playing: boolean;
  togglePlaying: () => void;
} {
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  // false for one frame after the item changes, so it starts below and grows up into place.
  const [grown, setGrown] = React.useState(true);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (!playing || count < 2) return undefined;
    const timer = window.setInterval(() => {
      setGrown(false);
      setIndex((current) => current + 1);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, count, intervalMs]);

  React.useEffect(() => {
    if (grown) return undefined;
    const frame = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [grown, index]);

  const togglePlaying = React.useCallback(() => setPlaying((current) => !current), []);
  return {
    index,
    itemStyle: {
      opacity: grown ? 1 : 0,
      transform: grown ? 'translateY(0) scale(1)' : 'translateY(70%) scale(0.92)',
      transition: reducedMotion ? 'none' : `transform ${GROW_MS}ms ease-out, opacity ${GROW_MS}ms ease-out`,
    },
    playing,
    togglePlaying,
  };
}
