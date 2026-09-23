'use client';

import * as React from 'react';
import { X } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EpicBrowser } from '@/components/epic-browser/EpicBrowser';
import type { DataReviewIssue } from '@/lib/data-review-types';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';

export interface EpicBrowserModalProps {
  /** The Epic Key to browse, or null to keep the modal closed. */
  epicKey: string | null;
  onClose: () => void;
}

interface ApiErrorResponse {
  error?: string;
}

interface EpicBrowserApiResponse {
  root: DataReviewIssue;
  summary: EpicBrowserSummary | null;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function formatDataLayer(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

/** Same info fields as the left column of the "Epic History" popup (Quản trị Epic / Epic in PO) —
 * shown below the Jira issue tree so a Duyệt Epic viewer sees this context without opening a
 * separate popup. */
function EpicSummaryPanel({ summary }: { summary: EpicBrowserSummary }) {
  const fields: { label: string; value: string }[] = [
    { label: 'Summary', value: summary.epicName || '-' },
    { label: 'Tên dự án', value: summary.projectName || '-' },
    { label: 'Ngày duyệt ý tưởng (T0)', value: formatDate(summary.ideaApprovedDate) },
    { label: 'Start Date (T1)', value: formatDate(summary.startDate) },
    { label: 'Status', value: summary.status || '-' },
    { label: 'PM/SM', value: summary.ownerName || '-' },
    { label: 'Domain (của PM/SM)', value: summary.domainName || '-' },
    { label: 'Đơn vị yêu cầu', value: summary.requestingUnit || '-' },
    { label: 'Lớp dữ liệu đang sử dụng', value: formatDataLayer(summary.dataLayerDate) },
  ];
  return (
    <div className="mt-5 border-t border-fb-border pt-4">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-fb-text-secondary">Thông tin Epic</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-fb-text-secondary">{field.label}</dt>
            <dd className="mt-0.5 text-[12.5px] font-semibold text-fb-text-primary">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Large (80% viewport height, 95% viewport width — wide enough for the tree's Issue Type column
 * on top of its other columns) popup wrapping the shared EpicBrowser tree — used to drill into
 * one Epic's Story/Subtask hierarchy from a context that only knows the Epic Key (e.g. clicking
 * an Epic Key on "Quản trị Epic"), without navigating away to the batch-scoped review screen.
 */
export function EpicBrowserModal({ epicKey, onClose }: EpicBrowserModalProps) {
  const [root, setRoot] = React.useState<DataReviewIssue | null>(null);
  const [summary, setSummary] = React.useState<EpicBrowserSummary | null>(null);
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
      setSummary(null);
      setError(null);
      setIsLoading(true);
      try {
        const response = await fetch(`/api/epic-browser?epicKey=${encodeURIComponent(epicKey)}`, { signal: controller.signal });
        const data = await response.json() as EpicBrowserApiResponse & ApiErrorResponse;
        if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu Epic.');
        setRoot(data.root);
        setSummary(data.summary);
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
          {!error && !isLoading && root && (
            <>
              <EpicBrowser key={epicKey} epics={[root]} />
              {summary && <EpicSummaryPanel summary={summary} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
