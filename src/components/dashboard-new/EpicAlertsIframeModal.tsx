'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowSquareOut, Browsers, CircleNotch, X } from '@phosphor-icons/react';

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape key handler & scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Frame */}
      <div className="relative z-10 flex h-[92vh] w-[96vw] max-w-[1750px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-[#f8fafc] shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-5 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0 mr-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1463f7]">
              <Browsers className="size-5" weight="bold" />
            </div>
            <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Open in new tab button */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-[#1463f7] hover:border-blue-200"
              title="Mở màn hình Quản trị Epic đầy đủ trong tab trình duyệt mới"
            >
              <ArrowSquareOut className="size-4" weight="bold" />
              <span className="hidden sm:inline">Mở tab mới</span>
            </a>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Đóng popup"
            >
              <X className="size-5" weight="bold" />
            </button>
          </div>
        </div>

        {/* Content Body (Iframe + Loading State) */}
        <div className="relative flex-1 min-h-0 w-full bg-slate-50">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50/90 backdrop-blur-2xs">
              <CircleNotch className="size-8 animate-spin text-[#1463f7]" weight="bold" />
              <p className="text-xs font-semibold text-slate-600">
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
