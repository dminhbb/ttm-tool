'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface TooltipPosition {
  left: number;
  top: number;
}

export interface TooltipProps {
  children: React.ReactNode;
  className?: string;
  content: string;
  disabled?: boolean;
  /** Render `content` with its line breaks preserved and a capped width (for a multi-line list). */
  multiline?: boolean;
  side?: 'left' | 'right';
}

/** Minimum gap kept between the tooltip and every viewport edge, so it never touches the browser
 * chrome even when clamped. */
const VIEWPORT_MARGIN = 8;
const SIDE_GAP = 10;

export function Tooltip({ children, className, content, disabled = false, multiline = false, side = 'right' }: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
  const [position, setPosition] = React.useState<TooltipPosition | null>(null);
  // `position` right after showTooltip() is only a rough guess (the trigger's own rect — the
  // tooltip's real size isn't known until it has actually rendered). `settled` marks once the
  // layout effect below has re-measured the mounted tooltip and clamped it to the viewport; the
  // tooltip stays invisible until then so the one-frame "jump" from guess to final spot is never
  // painted (a layout effect's own state updates flush before the browser paints).
  const [settled, setSettled] = React.useState(false);

  const showTooltip = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setSettled(false);
    setPosition({
      left: side === 'left' ? rect.left - SIDE_GAP : rect.right + SIDE_GAP,
      top: rect.top,
    });
  };

  const hideTooltip = () => {
    setPosition(null);
    setSettled(false);
  };

  // Re-measures the tooltip against its actual rendered size and clamps it fully inside the
  // viewport — flips to the opposite side first if the preferred one doesn't fit, then clamps
  // whichever side was chosen so a long/tall tooltip (e.g. a multi-line one opened from a badge near
  // a screen edge) can never render partly off-screen top/bottom/left/right.
  React.useLayoutEffect(() => {
    if (!position || settled || !triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const fitsRight = triggerRect.right + SIDE_GAP + tooltipRect.width <= viewportWidth - VIEWPORT_MARGIN;
    const fitsLeft = triggerRect.left - SIDE_GAP - tooltipRect.width >= VIEWPORT_MARGIN;
    const preferRight = side === 'right';
    const useRight = preferRight ? (fitsRight || !fitsLeft) : (!fitsLeft && fitsRight);
    let left = useRight ? triggerRect.right + SIDE_GAP : triggerRect.left - SIDE_GAP - tooltipRect.width;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, viewportWidth - tooltipRect.width - VIEWPORT_MARGIN));

    // Prefer vertically centered on the trigger, then clamp — this is what keeps a tall tooltip
    // opened from a badge near the top/bottom edge (e.g. the sticky header) fully on screen.
    let top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, viewportHeight - tooltipRect.height - VIEWPORT_MARGIN));

    setPosition({ left, top });
    setSettled(true);
  }, [position, settled, side]);

  React.useEffect(() => {
    if (!position) return undefined;
    const dismissTooltip = () => {
      setPosition(null);
      setSettled(false);
    };
    window.addEventListener('scroll', dismissTooltip, true);
    window.addEventListener('resize', dismissTooltip);
    return () => {
      window.removeEventListener('scroll', dismissTooltip, true);
      window.removeEventListener('resize', dismissTooltip);
    };
  }, [position]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('flex w-full', className)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocusCapture={showTooltip}
        onBlurCapture={hideTooltip}
      >
        {children}
      </span>
      {position && createPortal(
        <span
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            'pointer-events-none fixed z-[70] rounded-lg border border-fb-border-strong bg-fb-surface px-2.5 py-1.5 text-xs font-semibold text-fb-text-primary shadow-dialog',
            multiline ? 'max-w-[300px] whitespace-pre-line text-left leading-snug' : 'whitespace-nowrap',
          )}
          style={{ left: position.left, top: position.top, visibility: settled ? 'visible' : 'hidden' }}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
