import * as React from 'react';
import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/* ── Edge-hover auto-scroll for wide tables ──────────────────────────────────
 * When the mouse enters the 10% zone on the left or right edge of the table's
 * visible area, the container auto-scrolls horizontally and the cursor changes
 * to an arrow indicating the scroll direction. Scrolling stops when the mouse
 * leaves the edge zone, leaves the container, or the scroll limit is reached.
 *
 * The EDGE_ZONE_RATIO (0.10 = 10%) and MAX_SPEED (px/frame) are tuneable
 * constants at the top of this block.
 * ──────────────────────────────────────────────────────────────────────────── */

const EDGE_ZONE_RATIO = 0.10;   // 10% of visible width on each side
const MAX_SCROLL_SPEED = 12;    // px per animation frame at the outermost edge

export function TableContainer({ className, style, onMouseMove: externalMouseMove, onMouseLeave: externalMouseLeave, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number | null>(null);
  // Mutable ref to avoid re-creating the rAF callback on every mouse-move.
  const scrollDirectionRef = React.useRef<'left' | 'right' | null>(null);
  const scrollSpeedRef = React.useRef(0);

  const stopScrolling = React.useCallback(() => {
    scrollDirectionRef.current = null;
    scrollSpeedRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Persistent rAF loop — reads direction & speed from refs so it never goes stale.
  const tick = React.useCallback(() => {
    const el = containerRef.current;
    if (!el || scrollDirectionRef.current === null) { rafRef.current = null; return; }
    const delta = scrollDirectionRef.current === 'left' ? -scrollSpeedRef.current : scrollSpeedRef.current;
    el.scrollLeft += delta;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startScrolling = React.useCallback(() => {
    if (rafRef.current !== null) return; // already running
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    externalMouseMove?.(e);
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const visibleWidth = rect.width;
    const edgeSize = visibleWidth * EDGE_ZONE_RATIO;
    const xInContainer = e.clientX - rect.left;

    // Can we actually scroll? If scrollWidth === clientWidth there's nothing to scroll.
    const canScrollLeft = el.scrollLeft > 0;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;

    if (xInContainer < edgeSize && canScrollLeft) {
      // Left edge zone — speed proportional to how deep into the zone the cursor is.
      const depth = 1 - xInContainer / edgeSize; // 0 at inner boundary → 1 at the very edge
      scrollDirectionRef.current = 'left';
      scrollSpeedRef.current = Math.max(1, Math.round(depth * MAX_SCROLL_SPEED));
      el.style.cursor = 'w-resize';
      startScrolling();
    } else if (xInContainer > visibleWidth - edgeSize && canScrollRight) {
      const depth = 1 - (visibleWidth - xInContainer) / edgeSize;
      scrollDirectionRef.current = 'right';
      scrollSpeedRef.current = Math.max(1, Math.round(depth * MAX_SCROLL_SPEED));
      el.style.cursor = 'e-resize';
      startScrolling();
    } else {
      el.style.cursor = '';
      stopScrolling();
    }
  }, [externalMouseMove, startScrolling, stopScrolling]);

  const handleMouseLeave = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    externalMouseLeave?.(e);
    const el = containerRef.current;
    if (el) el.style.cursor = '';
    stopScrolling();
  }, [externalMouseLeave, stopScrolling]);

  // Cleanup on unmount.
  React.useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={containerRef}
      className={cn('ui-table-wrap', className)}
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    />
  );
}
TableContainer.displayName = 'TableContainer';

export const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn('ui-table border-collapse text-left tabular-nums', className)} {...props} />
);
Table.displayName = 'Table';

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={className} {...props} />
);
THead.displayName = 'THead';

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={className} {...props} />
);
TBody.displayName = 'TBody';

export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('transition-colors duration-150', className)} {...props} />
);
TR.displayName = 'TR';

export interface THProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Omit for a plain (non-sortable) header. Pass `null` for a sortable column not currently
   * active, or 'asc'/'desc' for the column the table is currently sorted by. */
  sortDirection?: 'asc' | 'desc' | null;
}

export const TH = ({ children, className, scope = 'col', sortDirection, onClick, ...props }: THProps) => {
  const sortable = sortDirection !== undefined;
  const SortIcon = sortDirection === 'asc' ? CaretUp : sortDirection === 'desc' ? CaretDown : CaretUpDown;
  return (
    <th
      className={cn('align-middle select-none', sortable && 'cursor-pointer', className)}
      scope={scope}
      onClick={onClick}
      aria-sort={sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : sortable ? 'none' : undefined}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', sortable && 'hover:text-fb-text-primary')}>
        {children}
        {sortable && <SortIcon className={cn('size-3 shrink-0', !sortDirection && 'opacity-50')} weight="bold" aria-hidden="true" />}
      </span>
    </th>
  );
};
TH.displayName = 'TH';

export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('whitespace-nowrap', className)} {...props} />
);
TD.displayName = 'TD';
