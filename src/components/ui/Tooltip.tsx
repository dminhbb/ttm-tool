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
  side?: 'left' | 'right';
}

export function Tooltip({ children, className, content, disabled = false, side = 'right' }: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [position, setPosition] = React.useState<TooltipPosition | null>(null);

  const showTooltip = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      left: side === 'left' ? rect.left - 10 : rect.right + 10,
      top: rect.top + rect.height / 2,
    });
  };

  const hideTooltip = () => setPosition(null);

  React.useEffect(() => {
    if (!position) return undefined;
    const dismissTooltip = () => setPosition(null);
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
          role="tooltip"
          className={cn(
            'pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg border border-fb-border-strong bg-fb-surface px-2.5 py-1.5 text-app font-semibold text-fb-text-primary shadow-dialog',
            side === 'left' && '-translate-x-full',
          )}
          style={{ left: position.left, top: position.top }}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
