'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { X } from '@phosphor-icons/react';

export interface AdPopupCardProps {
  campaignName: string;
  clickUrl: string;
  /** "Bắt buộc xem": true = no auto-dismiss and the X stays hidden until this campaign's own
   * timeoutSeconds elapses (then the X appears so the user can close it manually). false (default):
   * X always visible, and the timeout auto-dismisses via `onDismiss` instead. */
  forceView: boolean;
  /** % of viewport height, or null for the default (content-sized) height. */
  heightPercent: number | null;
  imageUrl: string;
  message: string;
  onDismiss: () => void;
  /** Fired once, on mount — e.g. to record an impression. Not called again for the same popup;
   * callers cycling a queue rely on `key` (see below) remounting this component per popup. */
  onShown?: () => void;
  timeoutSeconds: number;
  /** % of viewport width, or null for the default (max 420px) width. */
  widthPercent: number | null;
}

/**
 * Presentational shell shared by the real display (AdPopupDisplay, driven by /api/ad-popups/active
 * + impression tracking) and the admin form's "Test Popup" preview (AdPopupsPanel, driven purely by
 * unsaved form state — no API calls, no impression recorded via `onShown`). Not a Modal (no footer
 * buttons) — just an optional image + message (centered both ways by default), an X button, and a
 * countdown progress bar.
 *
 * Owns its own auto-dismiss/"reveal X" timer, started fresh on mount. Callers showing a sequence of
 * different popups MUST pass a `key` that changes per popup (e.g. the popup's id, or an incrementing
 * counter for a repeatable preview) so React remounts this component — and its timer — instead of
 * reusing state across campaigns.
 */
export function AdPopupCard({
  campaignName, clickUrl, forceView, heightPercent, imageUrl, message, onDismiss, onShown, timeoutSeconds, widthPercent,
}: AdPopupCardProps) {
  const [canDismiss, setCanDismiss] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);

  useEffect(() => {
    onShown?.();
    const handleTimeout = forceView ? () => setCanDismiss(true) : onDismiss;
    const timer = setTimeout(handleTimeout, timeoutSeconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot: this effect must run exactly once per mount (the caller remounts via `key` for a different popup), not re-fire on every prop identity change.
  }, []);

  // Countdown number shown next to the X — a separate ticking clock from the dismiss/reveal timer
  // above (that one only needs to fire once, at the end; this one needs to fire every second).
  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, []);

  const openClickUrl = () => {
    if (clickUrl) window.open(clickUrl, '_blank', 'noopener,noreferrer');
  };
  const showCloseButton = !forceView || canDismiss;
  // min(): a requested % never overflows a small viewport — always leaves room for the p-4 outer padding.
  const cardStyle: CSSProperties = {
    width: widthPercent ? `min(${widthPercent}vw, calc(100vw - 32px))` : undefined,
    height: heightPercent ? `min(${heightPercent}vh, calc(100vh - 32px))` : undefined,
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      <div
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-xl border border-fb-border bg-fb-surface text-fb-text-primary shadow-dialog${widthPercent ? '' : ' max-w-[420px]'}`}
        style={cardStyle}
        role="dialog"
        aria-label={campaignName}
      >
        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
          {secondsLeft > 0 && (
            <span
              className="grid size-8 place-items-center rounded-full bg-black/40 text-xs font-semibold text-white"
              aria-label={`Còn ${secondsLeft} giây`}
            >
              {secondsLeft}
            </span>
          )}
          {showCloseButton && (
            <button
              type="button"
              onClick={onDismiss}
              className="grid size-8 place-items-center rounded-full bg-black/40 text-white outline-none transition-colors hover:bg-black/60"
              aria-label="Đóng"
            >
              <X className="size-4" weight="bold" />
            </button>
          )}
        </div>

        <div
          className={`flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center${clickUrl ? ' cursor-pointer' : ''}`}
          onClick={clickUrl ? openClickUrl : undefined}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied URL, not a build-time-known local asset.
            <img src={imageUrl} alt={campaignName} className="max-h-[240px] w-full shrink-0 object-cover" />
          )}
          <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-fb-text-primary">{message}</p>
        </div>

        <div className="h-1 w-full shrink-0 bg-fb-control">
          <div className="ad-popup-progress h-full bg-fb-blue" style={{ animationDuration: `${timeoutSeconds}s` }} />
        </div>
      </div>
    </div>
  );
}
