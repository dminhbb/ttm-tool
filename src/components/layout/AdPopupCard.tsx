'use client';

import { X } from '@phosphor-icons/react';

export interface AdPopupCardProps {
  campaignName: string;
  clickUrl: string;
  imageUrl: string;
  message: string;
  onDismiss: () => void;
  timeoutSeconds: number;
}

/**
 * Presentational shell shared by the real display (AdPopupDisplay, driven by /api/ad-popups/active
 * + impression tracking) and the admin form's "Test Popup" preview (AdPopupsPanel, driven purely by
 * unsaved form state — no API calls, no impression recorded). Not a Modal (no footer buttons) —
 * just an optional image + message, an X button, and a countdown progress bar; the caller owns the
 * actual auto-dismiss timer (see each usage) since a preview shouldn't record anything a real popup
 * would.
 */
export function AdPopupCard({ campaignName, clickUrl, imageUrl, message, onDismiss, timeoutSeconds }: AdPopupCardProps) {
  const openClickUrl = () => {
    if (clickUrl) window.open(clickUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-xl border border-fb-border bg-fb-surface text-fb-text-primary shadow-dialog"
        role="dialog"
        aria-label={campaignName}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 z-20 grid size-8 place-items-center rounded-full bg-black/40 text-white outline-none transition-colors hover:bg-black/60"
          aria-label="Đóng"
        >
          <X className="size-4" weight="bold" />
        </button>

        <div className={clickUrl ? 'cursor-pointer' : undefined} onClick={clickUrl ? openClickUrl : undefined}>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied URL, not a build-time-known local asset.
            <img src={imageUrl} alt={campaignName} className="max-h-[240px] w-full object-cover" />
          )}
          <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-fb-text-primary">{message}</p>
        </div>

        <div className="h-1 w-full bg-fb-control">
          <div className="ad-popup-progress h-full bg-fb-blue" style={{ animationDuration: `${timeoutSeconds}s` }} />
        </div>
      </div>
    </div>
  );
}
