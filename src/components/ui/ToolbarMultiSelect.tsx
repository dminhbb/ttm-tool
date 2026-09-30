'use client';

import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

/** An option whose stored value differs from what the user reads (e.g. "Nhận xét": FAIL → "Fail TTM-CNTT"). */
export interface ToolbarMultiSelectOption {
  label: string;
  value: string;
}

/** Compact multi-choice dropdown for a filter toolbar — same trigger/height as a plain `.ttm-select`
 * native <select> next to it, but opens a checkbox popover instead. Shared by Epic 30/15/in-PO —
 * relies on the `.ttm-select`/`.ttm-multiselect*` classes each of those pages' own CSS defines.
 * `options` may be plain strings (label = value) or {label, value} pairs. */
export function ToolbarMultiSelect({
  allLabel, ariaLabel, disabled = false, onChange, options, title, value,
}: {
  allLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  options: ReadonlyArray<string | ToolbarMultiSelectOption>;
  title?: string;
  value: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
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
  const allSelected = normalizedOptions.length > 0 && normalizedOptions.every((option) => value.includes(option.value));
  const toggleAll = () => onChange(allSelected ? [] : normalizedOptions.map((option) => option.value));

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
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="ttm-multiselect-summary">{summary}</span>
        <CaretDown size={14} weight="bold" className="ttm-multiselect-caret" aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <div className="ttm-multiselect-popover" role="group" aria-label={ariaLabel}>
          {normalizedOptions.length > 0 && (
            <button type="button" className="ttm-multiselect-clear" onClick={toggleAll}>
              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
          )}
          <div className="ttm-multiselect-options">
            {normalizedOptions.length === 0 ? (
              <p className="ttm-multiselect-empty">Không có lựa chọn.</p>
            ) : normalizedOptions.map((option) => {
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
