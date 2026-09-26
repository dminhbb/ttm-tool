'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface TooltipPosition {
  left: number;
  top: number;
}

export type TooltipSide = 'auto' | 'bottom' | 'left' | 'right' | 'top';
export type TooltipAlign = 'center' | 'end' | 'start';

export interface TooltipProps {
  align?: TooltipAlign;
  children: React.ReactNode;
  className?: string;
  content: React.ReactNode;
  disabled?: boolean;
  /** Render `content` with its line breaks preserved and a capped width (for a multi-line list). */
  multiline?: boolean;
  side?: TooltipSide;
  /** Custom gap between tooltip and trigger element in pixels. Defaults to 8px. */
  sideOffset?: number;
}

/** Minimum gap kept between the tooltip and every viewport edge, so it never touches the browser
 * chrome even when clamped. */
const VIEWPORT_MARGIN = 8;
const DEFAULT_SIDE_GAP = 8;

export function Tooltip({
  align = 'center',
  children,
  className,
  content,
  disabled = false,
  multiline = false,
  side = 'right',
  sideOffset = DEFAULT_SIDE_GAP,
}: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
  const [position, setPosition] = React.useState<TooltipPosition | null>(null);
  // `position` right after showTooltip() is only a rough guess. `settled` marks once the
  // layout effect below has measured the mounted tooltip and positioned it cleanly.
  const [settled, setSettled] = React.useState(false);

  const showTooltip = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setSettled(false);
    setPosition({
      left: rect.left,
      top: rect.bottom + sideOffset,
    });
  };

  const hideTooltip = () => {
    setPosition(null);
    setSettled(false);
  };

  // Re-measures the tooltip against its actual rendered size and clamps it fully inside the
  // viewport — dynamically evaluates 4 directions (bottom, top, right, left) to ensure it never
  // renders off-screen and never overlaps the hovered trigger element.
  React.useLayoutEffect(() => {
    if (!position || settled || !triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Available spaces around trigger
    const spaceBelow = vh - triggerRect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN;
    const spaceRight = vw - triggerRect.right - VIEWPORT_MARGIN;
    const spaceLeft = triggerRect.left - VIEWPORT_MARGIN;

    const fitsBelow = spaceBelow >= tooltipRect.height + sideOffset;
    const fitsAbove = spaceAbove >= tooltipRect.height + sideOffset;
    const fitsRight = spaceRight >= tooltipRect.width + sideOffset;
    const fitsLeft = spaceLeft >= tooltipRect.width + sideOffset;

    // Determine target side with automatic fallback
    let resolvedSide: 'bottom' | 'left' | 'right' | 'top';

    if (side === 'auto') {
      if (fitsBelow && spaceBelow >= spaceAbove) resolvedSide = 'bottom';
      else if (fitsAbove) resolvedSide = 'top';
      else if (fitsRight && spaceRight >= spaceLeft) resolvedSide = 'right';
      else if (fitsLeft) resolvedSide = 'left';
      else resolvedSide = spaceBelow >= spaceAbove ? 'bottom' : 'top';
    } else if (side === 'bottom') {
      if (fitsBelow) resolvedSide = 'bottom';
      else if (fitsAbove) resolvedSide = 'top';
      else if (fitsRight) resolvedSide = 'right';
      else if (fitsLeft) resolvedSide = 'left';
      else resolvedSide = spaceBelow >= spaceAbove ? 'bottom' : 'top';
    } else if (side === 'top') {
      if (fitsAbove) resolvedSide = 'top';
      else if (fitsBelow) resolvedSide = 'bottom';
      else if (fitsRight) resolvedSide = 'right';
      else if (fitsLeft) resolvedSide = 'left';
      else resolvedSide = spaceAbove >= spaceBelow ? 'top' : 'bottom';
    } else if (side === 'left') {
      if (fitsLeft) resolvedSide = 'left';
      else if (fitsRight) resolvedSide = 'right';
      else if (fitsBelow) resolvedSide = 'bottom';
      else if (fitsAbove) resolvedSide = 'top';
      else resolvedSide = spaceLeft >= spaceRight ? 'left' : 'right';
    } else {
      // side === 'right'
      if (fitsRight) resolvedSide = 'right';
      else if (fitsLeft) resolvedSide = 'left';
      else if (fitsBelow) resolvedSide = 'bottom';
      else if (fitsAbove) resolvedSide = 'top';
      else resolvedSide = spaceRight >= spaceLeft ? 'right' : 'left';
    }

    let left = 0;
    let top = 0;

    if (resolvedSide === 'bottom' || resolvedSide === 'top') {
      top = resolvedSide === 'bottom'
        ? triggerRect.bottom + sideOffset
        : triggerRect.top - tooltipRect.height - sideOffset;

      // Horizontal alignment
      if (align === 'start') {
        left = triggerRect.left;
      } else if (align === 'end') {
        left = triggerRect.right - tooltipRect.width;
      } else {
        // center
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      }

      // Clamp horizontally within viewport
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - tooltipRect.width - VIEWPORT_MARGIN));

      // Clamp vertically if needed without overlapping trigger
      if (resolvedSide === 'bottom') {
        top = Math.min(top, vh - tooltipRect.height - VIEWPORT_MARGIN);
        if (top < triggerRect.bottom) {
          top = Math.max(VIEWPORT_MARGIN, triggerRect.bottom + 2);
        }
      } else {
        top = Math.max(VIEWPORT_MARGIN, top);
        if (top + tooltipRect.height > triggerRect.top) {
          top = Math.max(VIEWPORT_MARGIN, triggerRect.top - tooltipRect.height - 2);
        }
      }
    } else {
      // resolvedSide === 'left' || resolvedSide === 'right'
      left = resolvedSide === 'right'
        ? triggerRect.right + sideOffset
        : triggerRect.left - tooltipRect.width - sideOffset;

      // Vertical alignment
      if (align === 'start') {
        top = triggerRect.top;
      } else if (align === 'end') {
        top = triggerRect.bottom - tooltipRect.height;
      } else {
        // center
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      }

      // Clamp vertically within viewport
      top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - tooltipRect.height - VIEWPORT_MARGIN));

      // Clamp horizontally if needed without overlapping trigger
      if (resolvedSide === 'right') {
        left = Math.min(left, vw - tooltipRect.width - VIEWPORT_MARGIN);
        if (left < triggerRect.right) {
          left = Math.max(VIEWPORT_MARGIN, triggerRect.right + 2);
        }
      } else {
        left = Math.max(VIEWPORT_MARGIN, left);
        if (left + tooltipRect.width > triggerRect.left) {
          left = Math.max(VIEWPORT_MARGIN, triggerRect.left - tooltipRect.width - 2);
        }
      }
    }

    setPosition({ left, top });
    setSettled(true);
  }, [align, position, settled, side, sideOffset]);

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
            'pointer-events-none fixed z-[70] rounded-lg border border-fb-border-strong bg-fb-surface px-2.5 py-1.5 text-xs font-semibold text-fb-text-primary shadow-dialog transition-opacity duration-75',
            multiline ? 'max-w-[320px] whitespace-pre-line text-left leading-snug' : 'whitespace-nowrap',
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

