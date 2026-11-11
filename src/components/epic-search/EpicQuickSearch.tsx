'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { EpicMarkModal } from '@/components/epic-mark/EpicMarkModal';
import { MODAL_BACKDROP_CLASS } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import {
  EPIC_SEARCH_IDLE_MS,
  EPIC_SEARCH_MAX_LENGTH,
  isValidEpicSearchKeyword,
  sanitizeEpicSearchInput,
  type EpicSearchHit,
} from '@/lib/epic-quick-search';

/**
 * "Tìm nhanh Epic" (owner 2026-11-11) — mounted once in AppShell, on every page of the app:
 *   - key F (no modifier, not while typing in a field, not over an open popup) opens a large floating box;
 *   - only A–Z, a–z, 0–9 and "-" can be typed or pasted (sanitizeEpicSearchInput — the API checks again);
 *   - the suggestions (≤ 5) appear on Enter, or after 3 s without typing; none found → "Không tìm thấy Epic key phù hợp
 *     với {keyword}" in italics;
 *   - ↑ / ← previous, ↓ / → next, Enter opens the selected Epic's Review Notes; Esc (or a click outside) closes.
 * The input area and the suggestion panel have different backgrounds; the page behind is blurred like every popup
 * (MODAL_BACKDROP_CLASS). Suggestions: Epics of layer L02, newest created first (API /api/epic-search).
 */

function viDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; keyword: string }
  | { status: 'done'; keyword: string; hits: EpicSearchHit[] }
  | { status: 'error'; message: string };

/** F opens the box unless the user is typing somewhere or a popup is open. */
function shouldOpenOn(event: KeyboardEvent): boolean {
  if (event.key !== 'f' && event.key !== 'F') return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false;
  return !document.querySelector('[role="dialog"][aria-modal="true"]');
}

export function EpicQuickSearch() {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [state, setState] = React.useState<SearchState>({ status: 'idle' });
  const [selected, setSelected] = React.useState(0);
  const [reviewEpicKey, setReviewEpicKey] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const idleTimer = React.useRef<number | null>(null);
  const requestId = React.useRef(0);

  const clearIdleTimer = () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
  };

  const close = React.useCallback(() => {
    clearIdleTimer();
    requestId.current += 1;
    setOpen(false);
    setValue('');
    setState({ status: 'idle' });
    setSelected(0);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (open || reviewEpicKey || !shouldOpenOn(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, reviewEpicKey]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => () => clearIdleTimer(), []);

  const search = React.useCallback(async (raw: string) => {
    clearIdleTimer();
    const keyword = sanitizeEpicSearchInput(raw).trim();
    if (!isValidEpicSearchKeyword(keyword)) return;
    const id = ++requestId.current;
    setState({ status: 'loading', keyword });
    try {
      const response = await fetch(`/api/epic-search?q=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as { error?: string; hits?: EpicSearchHit[] };
      if (id !== requestId.current) return;
      if (!response.ok) {
        setState({ status: 'error', message: data.error ?? 'Không thể tìm Epic.' });
        return;
      }
      setState({ status: 'done', keyword, hits: data.hits ?? [] });
      setSelected(0);
    } catch {
      if (id === requestId.current) setState({ status: 'error', message: 'Không thể kết nối máy chủ.' });
    }
  }, []);

  const onChange = (raw: string) => {
    const next = sanitizeEpicSearchInput(raw);
    setValue(next);
    // Typing again hides the old suggestions until the next search (Enter or a 3 s pause).
    requestId.current += 1;
    setState({ status: 'idle' });
    clearIdleTimer();
    if (isValidEpicSearchKeyword(next.trim())) idleTimer.current = window.setTimeout(() => void search(next), EPIC_SEARCH_IDLE_MS);
  };

  const hits = state.status === 'done' ? state.hits : [];
  const openReview = (epicKey: string) => {
    close();
    setReviewEpicKey(epicKey);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.nativeEvent.isComposing) return;
    if (hits.length > 0 && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      setSelected((current) => (current + step + hits.length) % hits.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // Suggestions of this very keyword on screen → open the selected one; otherwise search now.
      if (state.status === 'done' && state.keyword === value.trim() && hits[selected]) openReview(hits[selected].epicKey);
      else void search(value);
    }
  };

  return (
    <>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[14vh]" onMouseDown={close} role="presentation">
          {/* The same blurred backdrop as the other popups. */}
          <div aria-hidden="true" className={MODAL_BACKDROP_CLASS} />
          <div
            aria-label="Tìm nhanh Epic"
            aria-modal="true"
            className="relative w-full max-w-[760px] overflow-hidden rounded-xl border border-fb-border shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            {/* Input area: its own (lighter) background, distinct from the suggestion panel below. */}
            <div className="flex items-center gap-3 bg-fb-surface px-6 py-5">
              <input
                aria-autocomplete="list"
                aria-controls="epic-quick-search-list"
                aria-label="Epic key — chữ cái, chữ số và dấu -"
                autoCapitalize="characters"
                autoComplete="off"
                // ~150% of the first version (24px → 36px), the keyword in bold (owner 2026-11-11). No placeholder and no
                // border / focus ring at all — the inline style beats the app-wide input styles of the brand.
                className="min-w-0 flex-1 appearance-none border-0 bg-transparent text-[36px] font-bold leading-tight tracking-wide text-fb-text-primary shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
                maxLength={EPIC_SEARCH_MAX_LENGTH}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                ref={inputRef}
                spellCheck={false}
                style={{ border: 'none', boxShadow: 'none', outline: 'none', padding: 0 }}
                value={value}
              />
              <MagnifyingGlass aria-hidden="true" className="size-9 shrink-0 text-fb-text-placeholder" weight="bold" />
              {/* Close (owner 2026-11-11) — same as Esc. */}
              <button
                aria-label="Đóng tìm nhanh Epic"
                className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-fb-text-secondary transition-colors hover:bg-fb-control hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue"
                onClick={close}
                title="Đóng (Esc)"
                type="button"
              >
                <X aria-hidden="true" className="size-7" weight="bold" />
              </button>
            </div>
            <div className="border-t border-fb-border bg-fb-surface-muted" id="epic-quick-search-list">
              {state.status === 'idle' && (
                <p className="m-0 px-6 py-4 text-base text-fb-text-secondary">
                  {value.trim() ? 'Nhấn Enter để tìm ngay, hoặc chờ 3 giây.' : 'Gõ keyword (vd. MO-) và/hoặc key của Epic. Phím Esc để đóng.'}
                </p>
              )}
              {state.status === 'loading' && <p className="m-0 px-6 py-4 text-lg text-fb-text-secondary">Đang tìm…</p>}
              {state.status === 'error' && <p className="m-0 px-6 py-4 text-lg text-status-danger">{state.message}</p>}
              {state.status === 'done' && hits.length === 0 && (
                <p className="m-0 px-6 py-4 text-lg italic text-fb-text-secondary">Không tìm thấy Epic key phù hợp với {state.keyword}</p>
              )}
              {hits.length > 0 && (
                <ul className="m-0 list-none p-1" role="listbox" aria-label="Epic gợi ý">
                  {hits.map((hit, index) => (
                    <li aria-selected={index === selected} key={hit.epicKey} role="option">
                      <button
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-5 py-3 text-left transition-colors',
                          index === selected ? 'bg-fb-blue-soft' : 'bg-transparent hover:bg-fb-control',
                        )}
                        onClick={() => openReview(hit.epicKey)}
                        onMouseEnter={() => setSelected(index)}
                        type="button"
                      >
                        {/* ~150%: key 14px → 20px, name 12px → 16px, status / date 11px → 14px. */}
                        <span className="min-w-0 flex-1">
                          <span className="block text-xl font-bold text-[var(--color-text-brand)]">{hit.epicKey}</span>
                          <span className="block truncate text-base text-fb-text-secondary" title={hit.epicName}>{hit.epicName || '—'}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {hit.status && <span className="rounded-full border border-fb-border bg-fb-surface px-2.5 py-0.5 text-sm font-semibold text-fb-text-primary">{hit.status}</span>}
                          {hit.createdDate && <span className="text-sm text-fb-text-secondary" title="Created date">Tạo {viDate(hit.createdDate)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {reviewEpicKey && <EpicMarkModal epicKey={reviewEpicKey} key={reviewEpicKey} onClose={() => setReviewEpicKey(null)} />}
    </>
  );
}
