import * as React from 'react';
import { ArrowCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react';

export interface DataTableToolbarProps {
  onReset: () => void;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  searchValue: string;
}

export function DataTableToolbar({ onReset, onSearchChange, placeholder = 'Tìm kiếm gần đúng', searchValue }: DataTableToolbarProps) {
  const inputId = React.useId();
  return <div className="ui-table-toolbar flex items-center">
    <label className="ui-search" htmlFor={inputId}>
      <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0 text-fb-text-secondary" weight="bold" />
      <span className="sr-only">Tìm kiếm gần đúng</span>
      <input id={inputId} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} type="search" value={searchValue} />
    </label>
    <button aria-label="Đặt lại tìm kiếm" className="ui-icon-button" onClick={onReset} title="Đặt lại tìm kiếm" type="button">
      <ArrowCounterClockwise aria-hidden="true" className="size-4" weight="bold" />
    </button>
  </div>;
}
