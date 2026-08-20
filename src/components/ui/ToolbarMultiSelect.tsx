'use client';

import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

/** Compact multi-choice dropdown for a filter toolbar — same trigger/height as a plain `.ttm-select`
 * native <select> next to it, but opens a checkbox popover instead. Shared by Epic 30/15/in-PO —
 * relies on the `.ttm-select`/`.ttm-multiselect*` classes each of those pages' own CSS defines. */
export function ToolbarMultiSelect({
  allLabel, ariaLabel, disabled = false, onChange, options, value,
}: {
  allLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (values: string[]) => void;
  options: string[];
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

  const summary = value.length === 0 ? allLabel : value.length <= 2 ? value.join(', ') : `${value.length} lựa chọn`;

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  };

  return (
    <div className="ttm-multiselect" ref={containerRef}>
      <button
        type="button"
        className={`ttm-select ttm-multiselect-trigger${isOpen ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="ttm-multiselect-summary">{summary}</span>
        <CaretDown size={14} weight="bold" className="ttm-multiselect-caret" aria-hidden="true" />
      </button>
      {isOpen && !disabled && (
        <div className="ttm-multiselect-popover" role="group" aria-label={ariaLabel}>
          {value.length > 0 && (
            <button type="button" className="ttm-multiselect-clear" onClick={() => onChange([])}>Bỏ chọn tất cả</button>
          )}
          <div className="ttm-multiselect-options">
            {options.length === 0 ? (
              <p className="ttm-multiselect-empty">Không có lựa chọn.</p>
            ) : options.map((option) => {
              const isSelected = value.includes(option);
              return (
                <label key={option} className={`ttm-multiselect-option${isSelected ? ' is-selected' : ''}`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(option)} />
                  <span>{option}</span>
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
