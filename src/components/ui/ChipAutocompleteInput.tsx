'use client';

import * as React from 'react';
import { XCircle } from '@phosphor-icons/react';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { cn } from '@/lib/utils';

/**
 * Outlined field holding the chosen values as chips (ⓧ removes one) with a text input at the end; typing asks
 * `fetchSuggestions` and shows the matches in a floating list (owner 2026-11-01, "Quyền xem Epic"). Enter or a click
 * picks the highlighted suggestion; Backspace in an empty input removes the last chip.
 */

export interface ChipItem {
  value: string;
  /** Shown on the chip; defaults to the value. */
  label?: string;
  /** Tooltip of the chip (e.g. the Epic name). */
  title?: string;
}

export interface ChipSuggestion {
  value: string;
  label: string;
  /** Second line, muted (e.g. the Epic name). */
  description?: string;
}

export interface ChipAutocompleteInputProps {
  disabled?: boolean;
  fetchSuggestions: (query: string, signal: AbortSignal) => Promise<ChipSuggestion[]>;
  helperText?: string;
  label: string;
  maxSuggestions?: number;
  onAdd: (suggestion: ChipSuggestion) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
  value: readonly ChipItem[];
}

export function ChipAutocompleteInput({
  disabled = false, fetchSuggestions, helperText, label, maxSuggestions = 3, onAdd, onRemove, placeholder = 'Nhập để tìm…', value,
}: ChipAutocompleteInputProps) {
  const id = React.useId();
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState('');
  // The answer to one query; while it is not the current text's, the list shows "Đang tìm…".
  const [result, setResult] = React.useState<{ items: ChipSuggestion[]; query: string } | null>(null);
  const [highlight, setHighlight] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const chosen = React.useMemo(() => new Set(value.map((item) => item.value)), [value]);
  const query = text.trim();
  const loading = query !== '' && result?.query !== query;
  // Already chosen values are dropped, then the closest `maxSuggestions` remain.
  const suggestions = React.useMemo(
    () => (result && result.query === query ? result.items.filter((item) => !chosen.has(item.value)).slice(0, maxSuggestions) : []),
    [chosen, maxSuggestions, query, result],
  );

  // Debounced lookup of the current text.
  React.useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSuggestions(query, controller.signal)
        .then((items) => { if (!controller.signal.aborted) { setResult({ items, query }); setHighlight(0); } })
        .catch(() => { if (!controller.signal.aborted) setResult({ items: [], query }); });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchSuggestions, query]);

  React.useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!fieldRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeWhenOutside);
    return () => document.removeEventListener('mousedown', closeWhenOutside);
  }, []);

  const pick = (suggestion: ChipSuggestion) => {
    onAdd(suggestion);
    setText('');
    inputRef.current?.focus();
  };

  const showPanel = open && text.trim() !== '';

  return (
    <div className="ui-field">
      <div
        className={cn(
          'relative flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-fb-border bg-fb-surface px-2.5 pt-3 pb-2 transition-colors focus-within:border-fb-blue focus-within:ring-2 focus-within:ring-fb-blue/20',
          disabled && 'opacity-60',
        )}
        onClick={() => inputRef.current?.focus()}
        ref={fieldRef}
      >
        <label className="absolute -top-2 left-2 bg-fb-surface px-1 text-[11px] font-semibold text-fb-text-secondary" htmlFor={id}>{label}</label>
        {value.map((item) => (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-fb-surface-muted py-1 pr-1 pl-2.5 text-xs font-semibold text-fb-text-primary" key={item.value} title={item.title}>
            <span className="truncate">{item.label ?? item.value}</span>
            <button
              aria-label={`Bỏ ${item.label ?? item.value}`}
              className="inline-flex cursor-pointer rounded-full border-0 bg-transparent p-0 text-fb-text-secondary hover:text-status-danger disabled:cursor-not-allowed"
              disabled={disabled}
              onClick={(event) => { event.stopPropagation(); onRemove(item.value); }}
              type="button"
            >
              <XCircle className="size-4" weight="fill" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-expanded={showPanel}
          className="min-w-[140px] flex-1 border-0 bg-transparent py-1 text-sm text-fb-text-primary outline-none placeholder:text-fb-text-placeholder"
          disabled={disabled}
          id={id}
          onChange={(event) => { setText(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((index) => Math.min(index + 1, Math.max(0, suggestions.length - 1))); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((index) => Math.max(index - 1, 0)); }
            else if (event.key === 'Enter') {
              event.preventDefault();
              if (suggestions[highlight]) pick(suggestions[highlight]);
            } else if (event.key === 'Escape' && showPanel) {
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
              onRemove(value[value.length - 1].value);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          ref={inputRef}
          role="combobox"
          value={text}
        />
      </div>
      {helperText && <p className="ui-helper">{helperText}</p>}
      {showPanel && (
        <FloatingPanel anchorRef={fieldRef} className="overflow-hidden rounded-lg border border-fb-border bg-fb-surface shadow-dialog" ref={panelRef}>
          <ul className="m-0 list-none p-1" id={`${id}-list`} role="listbox">
            {loading && suggestions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-fb-text-secondary">Đang tìm…</li>
            ) : suggestions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-fb-text-secondary">Không tìm thấy kết quả phù hợp.</li>
            ) : suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === highlight}
                className={cn('cursor-pointer rounded-md px-3 py-2', index === highlight ? 'bg-fb-blue-soft' : 'hover:bg-fb-surface-muted')}
                key={suggestion.value}
                onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
                onMouseEnter={() => setHighlight(index)}
                role="option"
              >
                <div className="text-sm font-semibold text-fb-text-primary">{suggestion.label}</div>
                {suggestion.description && <div className="truncate text-xs text-fb-text-secondary">{suggestion.description}</div>}
              </li>
            ))}
          </ul>
        </FloatingPanel>
      )}
    </div>
  );
}
