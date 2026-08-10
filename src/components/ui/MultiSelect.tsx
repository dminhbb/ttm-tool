'use client';

import * as React from 'react';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { fuzzyIncludes } from '@/lib/fuzzy-search';

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  className?: string;
  helperText?: string;
  label: string;
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  required?: boolean;
  value: string[];
}

export function MultiSelect({ className, helperText, label, onChange, options, placeholder = 'Chọn giá trị', required = false, value }: MultiSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [optionSearchTerm, setOptionSearchTerm] = React.useState('');
  const controlId = React.useId();
  const helpId = `${controlId}-help`;
  const popoverId = `${controlId}-options`;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selectedOptions = options.filter((option) => value.includes(option.value));
  const visibleOptions = options.filter((option) => fuzzyIncludes(optionSearchTerm, [option.label]));
  const summary = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(', ')
      : `${selectedOptions.length} lựa chọn đã chọn`;

  React.useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) { setIsOpen(false); setOptionSearchTerm(''); }
    };
    const closeWhenEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); setOptionSearchTerm(''); }
    };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeWhenEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeWhenEscape);
    };
  }, []);

  const toggleOption = (optionValue: string, checked: boolean) => {
    const nextValue = checked ? [...value, optionValue] : value.filter((selectedValue) => selectedValue !== optionValue);
    onChange(nextValue);
  };

  return <div className={cn('ui-field relative', className)} ref={containerRef}>
    <label className="ui-label" id={`${controlId}-label`}>
      {label}{required && <span className="ml-1 text-status-danger" aria-hidden="true">*</span>}
    </label>
    <button aria-controls={popoverId} aria-describedby={helperText ? helpId : undefined} aria-expanded={isOpen} aria-labelledby={`${controlId}-label`} className={cn('ui-multi-select__trigger', { 'is-open': isOpen })} onClick={() => setIsOpen((open) => { if (open) setOptionSearchTerm(''); return !open; })} type="button">
      <span className={cn('ui-multi-select__summary', { 'is-placeholder': selectedOptions.length === 0 })}>{summary}</span>
      <CaretDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform', { 'rotate-180': isOpen })} weight="bold" />
    </button>
    {isOpen && <div aria-labelledby={`${controlId}-label`} className="ui-multi-select__popover" id={popoverId} role="group">
      <p className="ui-multi-select__heading">Chọn một hoặc nhiều giá trị</p>
      <label className="ui-multi-select__search" htmlFor={`${controlId}-search`}><MagnifyingGlass aria-hidden="true" className="size-4 shrink-0 text-fb-text-secondary" weight="bold" /><span className="sr-only">Tìm lựa chọn</span><input id={`${controlId}-search`} onChange={(event) => setOptionSearchTerm(event.target.value)} placeholder="Tìm lựa chọn" type="search" value={optionSearchTerm} /></label>
      <div className="ui-multi-select__options">{visibleOptions.length === 0 ? <p className="ui-multi-select__empty">Không có lựa chọn phù hợp.</p> : visibleOptions.map((option) => {
        const isSelected = value.includes(option.value);
        return <label className={cn('ui-multi-select__option', { 'is-selected': isSelected })} key={option.value}>
          <input checked={isSelected} onChange={(event) => toggleOption(option.value, event.target.checked)} type="checkbox" />
          <span>{option.label}</span>
          {isSelected && <Check aria-hidden="true" className="ml-auto size-4 text-fb-primary" weight="bold" />}
        </label>;
      })}</div>
    </div>}
    {helperText && <p className="ui-helper" id={helpId}>{helperText}</p>}
  </div>;
}
