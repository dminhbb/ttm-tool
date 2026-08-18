'use client';

import * as React from 'react';
import { X } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EpicBrowser } from '@/components/epic-browser/EpicBrowser';
import type { DataReviewIssue } from '@/lib/data-review-types';

export interface EpicBrowserModalProps {
  /** The Epic Key to browse, or null to keep the modal closed. */
  epicKey: string | null;
  onClose: () => void;
}

interface ApiErrorResponse {
  error?: string;
}

/**
 * Large (80% viewport height, 95% viewport width — wide enough for the tree's Issue Type column
 * on top of its other columns) popup wrapping the shared EpicBrowser tree — used to drill into
 * one Epic's Story/Subtask hierarchy from a context that only knows the Epic Key (e.g. clicking
 * an Epic Key on "Quản trị Epic"), without navigating away to the batch-scoped review screen.
 */
export function EpicBrowserModal({ epicKey, onClose }: EpicBrowserModalProps) {
  const [root, setRoot] = React.useState<DataReviewIssue | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const onCloseRef = React.useRef(onClose);
  const titleId = React.useId();

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isOpen = !!epicKey;

  React.useEffect(() => {
    if (!epicKey) return undefined;
    const controller = new AbortController();

    const fetchRoot = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setRoot(null);
      setError(null);
      setIsLoading(true);
      try {
        const response = await fetch(`/api/epic-browser?epicKey=${encodeURIComponent(epicKey)}`, { signal: controller.signal });
        const data = await response.json() as DataReviewIssue & ApiErrorResponse;
        if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu Epic.');
        setRoot(data);
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối API.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void fetchRoot();
    return () => controller.abort();
  }, [epicKey]);

  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        className="relative z-10 flex h-[80vh] w-[95vw] flex-col overflow-hidden rounded-xl border border-fb-border bg-fb-surface text-fb-text-primary shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between border-b border-fb-border px-5 py-4 select-none">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-fb-text-primary">Duyệt Epic — {epicKey}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md text-fb-text-secondary outline-none transition-colors hover:bg-fb-control hover:text-fb-text-primary"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-4 h-4" weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <Alert variant="error" title="Không thể tải dữ liệu">{error}</Alert>}
          {!error && isLoading && <TableSkeleton rows={8} />}
          {!error && !isLoading && root && <EpicBrowser key={epicKey} epics={[root]} />}
        </div>
      </div>
    </div>
  );
}
