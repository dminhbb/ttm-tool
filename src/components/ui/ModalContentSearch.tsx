'use client';

import * as React from 'react';
import { CaretDown, CaretUp, ArrowCounterClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  buildSearchRegex,
  clearModalHighlights,
  highlightModalMatches,
} from '@/lib/modal-content-search';

export interface ModalContentSearchProps {
  /** Ref to the container DOM element whose text should be searched and highlighted */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether the parent modal is currently open */
  isOpen: boolean;
  className?: string;
  placeholder?: string;
}

export function ModalContentSearch({
  containerRef,
  isOpen,
  className,
  placeholder = 'Tìm trong nội dung...',
}: ModalContentSearchProps) {
  const [query, setQuery] = React.useState('');
  const [searchedQuery, setSearchedQuery] = React.useState('');
  const [matchCount, setMatchCount] = React.useState(0);
  const [currentIndex, setCurrentIndex] = React.useState(-1);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const matchesRef = React.useRef<HTMLElement[]>([]);

  // Activate specific match and scroll into view smoothly
  const activateMatch = (elements: HTMLElement[], index: number) => {
    elements.forEach((el, i) => {
      if (i === index) {
        el.classList.add('ttm-modal-search-active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else {
        el.classList.remove('ttm-modal-search-active');
      }
    });
  };

  const handleReset = React.useCallback(() => {
    const container = containerRef.current;
    if (container) {
      clearModalHighlights(container);
    }
    matchesRef.current = [];
    setQuery('');
    setSearchedQuery('');
    setMatchCount(0);
    setCurrentIndex(-1);
    inputRef.current?.focus();
  }, [containerRef]);

  // When the modal closes, reset the search state during render (React's "adjust state on a prop change" pattern —
  // no effect, so no cascading render) and clean the DOM highlights in an effect (that part is not state).
  const [wasOpen, setWasOpen] = React.useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setQuery('');
      setSearchedQuery('');
      setMatchCount(0);
      setCurrentIndex(-1);
    }
  }
  React.useEffect(() => {
    if (isOpen) return;
    const container = containerRef.current;
    if (container) {
      clearModalHighlights(container);
    }
    matchesRef.current = [];
  }, [isOpen, containerRef]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      const container = containerRef.current;
      if (container) {
        clearModalHighlights(container);
      }
    };
  }, [containerRef]);

  const executeSearch = React.useCallback(
    (targetIndex = 0) => {
      const container = containerRef.current;
      if (!container) return;

      const trimmed = query.trim();
      if (!trimmed) {
        handleReset();
        return;
      }

      const regex = buildSearchRegex(trimmed);
      if (!regex) {
        handleReset();
        return;
      }

      const elements = highlightModalMatches(container, regex);
      matchesRef.current = elements;
      setSearchedQuery(trimmed);
      setMatchCount(elements.length);

      if (elements.length > 0) {
        const idx = ((targetIndex % elements.length) + elements.length) % elements.length;
        setCurrentIndex(idx);
        activateMatch(elements, idx);
      } else {
        setCurrentIndex(-1);
      }
    },
    [containerRef, query, handleReset]
  );

  const handleNext = React.useCallback(() => {
    if (query.trim() !== searchedQuery) {
      executeSearch(0);
      return;
    }
    const elements = matchesRef.current;
    if (elements.length === 0) return;
    const nextIdx = (currentIndex + 1) % elements.length;
    setCurrentIndex(nextIdx);
    activateMatch(elements, nextIdx);
  }, [query, searchedQuery, currentIndex, executeSearch]);

  const handlePrev = React.useCallback(() => {
    if (query.trim() !== searchedQuery) {
      executeSearch(matchesRef.current.length > 0 ? matchesRef.current.length - 1 : 0);
      return;
    }
    const elements = matchesRef.current;
    if (elements.length === 0) return;
    const prevIdx = (currentIndex - 1 + elements.length) % elements.length;
    setCurrentIndex(prevIdx);
    activateMatch(elements, prevIdx);
  }, [query, searchedQuery, currentIndex, executeSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (e.key === 'Escape') {
      if (query || matchCount > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleReset();
      }
    }
  };

  const BUTTON_CLASS =
    'flex size-8 shrink-0 items-center justify-center rounded-lg text-fb-text-secondary outline-none transition-colors hover:bg-fb-control hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue disabled:opacity-30 disabled:pointer-events-none';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 w-40 sm:w-52 rounded-lg border border-fb-border bg-fb-control pl-2.5 pr-12 text-xs text-fb-text-primary placeholder:text-fb-text-placeholder focus:border-fb-blue focus:outline-none focus:ring-1 focus:ring-fb-blue"
          aria-label="Tìm kiếm nội dung popup"
        />
        {matchCount > 0 && (
          <span className="pointer-events-none absolute right-2 text-[11px] font-medium text-fb-text-placeholder tabular-nums">
            {currentIndex + 1}/{matchCount}
          </span>
        )}
        {searchedQuery && matchCount === 0 && (
          <span className="pointer-events-none absolute right-2 text-[11px] font-medium text-status-danger tabular-nums">
            0/0
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handlePrev}
        disabled={matchCount === 0 && !query.trim()}
        className={BUTTON_CLASS}
        aria-label="Kết quả trước"
        title="Kết quả trước (Shift+Enter)"
      >
        <CaretUp className="size-4" weight="bold" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={handleNext}
        disabled={matchCount === 0 && !query.trim()}
        className={BUTTON_CLASS}
        aria-label="Kết quả tiếp theo"
        title="Kết quả tiếp theo (Enter)"
      >
        <CaretDown className="size-4" weight="bold" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={handleReset}
        disabled={!query && matchCount === 0}
        className={BUTTON_CLASS}
        aria-label="Đặt lại tìm kiếm"
        title="Đặt lại tìm kiếm"
      >
        <ArrowCounterClockwise className="size-4" weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
