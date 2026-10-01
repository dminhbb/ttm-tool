'use client';

import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';

/** An option whose stored value differs from what the user reads (e.g. "Nhận xét": FAIL → "Fail TTM-CNTT"). */
export interface ToolbarMultiSelectOption {
  label: string;
  value: string;
}

/** Compact multi-choice dropdown for a filter toolbar — same trigger/height as a plain `.ttm-select`
 * native <select> next to it, but opens a checkbox popover instead. Shared by Epic 30/15/in-PO —
 * relies on the `.ttm-select`/`.ttm-multiselect*` classes each of those pages' own CSS defines.
 * `options` may be plain strings (label = value) or {label, value} pairs. `searchable` adds a
 * free-text box on top of the list (accent- and case-insensitive, matches label or value) for long
 * lists such as Projects; "Chọn tất cả"/"Bỏ chọn" then applies to the options currently shown. */

/** Lower-cased, Vietnamese accents stripped — so "du an" finds "Dự án". */
function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

export function ToolbarMultiSelect({
  allLabel, ariaLabel, disabled = false, onChange, options, searchable = false, title, value,
}: {
  allLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  options: ReadonlyArray<string | ToolbarMultiSelectOption>;
  searchable?: boolean;
  title?: string;
  value: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeWhenEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeWhenEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeWhenEscape);
    };
  }, [isOpen]);

  const normalizedOptions = options.map((option) => (typeof option === 'string' ? { label: option, value: option } : option));
  const labelOf = (optionValue: string) => normalizedOptions.find((option) => option.value === optionValue)?.label ?? optionValue;
  const summary = value.length === 0 ? allLabel : value.length <= 2 ? value.map(labelOf).join(', ') : `${value.length} lựa chọn`;

  const toggle = (optionValue: string) => {
    onChange(value.includes(optionValue) ? value.filter((item) => item !== optionValue) : [...value, optionValue]);
  };

  // Toggle link: every option explicitly checked → "Bỏ chọn" (clears to []); anything else
  // (none or only some checked) → "Chọn tất cả" (checks every option explicitly).
  const needle = searchable ? normalizeSearchText(query) : '';
  const visibleOptions = needle
    ? normalizedOptions.filter((option) => normalizeSearchText(option.label).includes(needle) || normalizeSearchText(option.value).includes(needle))
    : normalizedOptions;
  const allSelected = visibleOptions.length > 0 && visibleOptions.every((option) => value.includes(option.value));
  // While searching, the toggle only adds/removes the options currently shown — it must not wipe
  // selections hidden by the search.
  const toggleAll = () => {
    const visibleValues = visibleOptions.map((option) => option.value);
    if (!needle) { onChange(allSelected ? [] : visibleValues); return; }
    onChange(allSelected ? value.filter((item) => !visibleValues.includes(item)) : [...new Set([...value, ...visibleValues])]);
  };

  const hasFilter = value.length > 0;

  return (
    <div className="ttm-multiselect" ref={containerRef}>
      <button
        type="button"
        className={`ttm-select ttm-multiselect-trigger${isOpen ? ' is-open' : ''}${hasFilter ? ' has-filter' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        title={title ?? (hasFilter ? value.map(labelOf).join(', ') : undefined)}
        onClick={() => { setIsOpen((open) => !open); setQuery(''); }}
      >
        <span className="ttm-multiselect-summary">{summary}</span>
        <CaretDown size={14} weight="bold" className="ttm-multiselect-caret" aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <div className="ttm-multiselect-popover" role="group" aria-label={ariaLabel}>
          {searchable && normalizedOptions.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--ttm-border, #e2e8f0)' }}>
              <MagnifyingGlass size={14} weight="bold" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--ttm-muted, #64748b)' }} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Tìm ${ariaLabel.toLowerCase()}...`}
                aria-label={`Tìm ${ariaLabel}`}
                style={{ width: '100%', minWidth: 0, border: 'none', outline: 'none', boxShadow: 'none', background: 'transparent', padding: 0, fontSize: 'var(--ttm-font-size-sm, 13px)', color: 'inherit' }}
              />
            </label>
          )}
          {visibleOptions.length > 0 && (
            <button type="button" className="ttm-multiselect-clear" onClick={toggleAll}>
              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}{needle ? ` (${visibleOptions.length} kết quả)` : ''}
            </button>
          )}
          <div className="ttm-multiselect-options">
            {visibleOptions.length === 0 ? (
              <p className="ttm-multiselect-empty">{needle ? 'Không tìm thấy.' : 'Không có lựa chọn.'}</p>
            ) : visibleOptions.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <label key={option.value} className={`ttm-multiselect-option${isSelected ? ' is-selected' : ''}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(option.value)} />
                  <span>{option.label}</span>
                  {isSelected && <Check size={14} weight="bold" className="ttm-multiselect-check" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
