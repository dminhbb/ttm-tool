'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A dropdown panel rendered into document.body at a fixed position under (or, without room, above) its anchor — so a
 * popup's scrolling body can never clip it (owner 2026-11-01: the Dự án list of "Chỉnh sửa user" was cut off). It
 * follows the anchor on scroll / resize. Used by MultiSelect and ChipAutocompleteInput.
 */

const GAP = 4;
const VIEWPORT_MARGIN = 8;

export interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Panel width: the anchor's ('anchor') or the anchor's capped at this many pixels. */
  maxWidth?: number;
}

export const FloatingPanel = React.forwardRef<HTMLDivElement, FloatingPanelProps>(function FloatingPanel(
  { anchorRef, children, className, maxWidth, style, ...props },
  forwardedRef,
) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number; width: number } | null>(null);

  const setRefs = (node: HTMLDivElement | null) => {
    panelRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const place = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(rect.width, maxWidth ?? rect.width);
    const height = panelRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openAbove = height > spaceBelow && spaceAbove > spaceBelow;
    const top = openAbove ? Math.max(VIEWPORT_MARGIN, rect.top - GAP - height) : rect.bottom + GAP;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN));
    setPosition((previous) => (previous && previous.left === left && previous.top === top && previous.width === width ? previous : { left, top, width }));
  }, [anchorRef, maxWidth]);

  // Measure once mounted (the height decides above/below), then keep following the anchor.
  React.useLayoutEffect(() => {
    place();
  });
  React.useEffect(() => {
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      {...props}
      className={cn(className)}
      ref={setRefs}
      // All inline, so a class that styles the panel itself can't override it: globals.css is not in a cascade layer,
      // so e.g. `.ui-multi-select__popover { position: absolute; z-index: 30 }` beats any Tailwind utility — z-30 left
      // the list behind the popup (z-60) and the Dự án dropdown looked dead (2026-11-01). z-125 = above every popup,
      // including the 'top' layer (z-120) used for confirmations.
      style={{ ...style, left: position?.left ?? -9999, margin: 0, position: 'fixed', top: position?.top ?? -9999, visibility: position ? 'visible' : 'hidden', width: position?.width, zIndex: 125 }}
    >
      {children}
    </div>,
    document.body,
  );
});
