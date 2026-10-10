'use client';

import React, { useEffect, useState } from 'react';
import { ArrowSquareOut, Browsers, CircleNotch, X } from '@phosphor-icons/react';
import { MODAL_BACKDROP_CLASS, useModalBehavior } from '@/components/ui/Modal';

export interface EpicAlertsIframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url: string | null;
}

export function EpicAlertsIframeModal({
  isOpen,
  onClose,
  title,
  url,
}: EpicAlertsIframeModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Escape key handler & scroll lock — shared with every other popup (ui/Modal.tsx).
  useModalBehavior(isOpen && Boolean(url), onClose);

  // Reset loading whenever URL changes
  useEffect(() => {
    if (isOpen && url) {
      setIsLoading(true);
    }
  }, [isOpen, url]);

  if (!isOpen || !url) return null;

  // Add embedded=true query parameter to URL for iframe
  const embeddedUrl = url.includes('?') ? `${url}&embedded=true` : `${url}?embedded=true`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop — this popup is the reference for the app-wide popup style (ui/Modal.tsx). */}
      <div className={MODAL_BACKDROP_CLASS} onClick={onClose} aria-hidden="true" />

      {/* Dialog Frame */}
      {/* 96% × 92% of the viewport with no pixel cap, so the embedded Quản trị Epic table (1694px wide)
          gets the full width on large screens while the dashboard stays visible round the edges. */}
      <div className="relative z-10 flex h-[92vh] w-[96vw] flex-col overflow-hidden rounded-2xl border border-fb-border/90 bg-[var(--color-bg-page)] shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-fb-border/80 bg-white px-5 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0 mr-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fb-blue-soft text-[var(--color-text-brand)]">
              <Browsers className="size-5" weight="bold" />
            </div>
            <h2 className="truncate text-sm font-bold text-fb-text-primary sm:text-base">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Open in new tab button */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-fb-border bg-white px-3 text-xs font-semibold text-fb-text-secondary shadow-2xs transition-colors hover:bg-fb-surface-muted hover:text-[var(--color-text-brand)] hover:border-fb-blue"
              title="Mở màn hình Quản trị Epic đầy đủ trong tab trình duyệt mới"
            >
              <ArrowSquareOut className="size-4" weight="bold" />
              <span className="hidden sm:inline">Mở tab mới</span>
            </a>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-fb-text-placeholder hover:bg-fb-surface-muted hover:text-fb-text-secondary transition-colors"
              aria-label="Đóng popup"
            >
              <X className="size-5" weight="bold" />
            </button>
          </div>
        </div>

        {/* Content Body (Iframe + Loading State) */}
        <div className="relative flex-1 min-h-0 w-full bg-fb-surface-muted">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-fb-surface-muted/90 backdrop-blur-2xs">
              <CircleNotch className="size-8 animate-spin text-[var(--color-text-brand)]" weight="bold" />
              <p className="text-xs font-semibold text-fb-text-secondary">
                Đang tải dữ liệu Quản trị Epic…
              </p>
            </div>
          )}

          <iframe
            src={embeddedUrl}
            title={title}
            onLoad={() => setIsLoading(false)}
            className="size-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
