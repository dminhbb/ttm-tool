import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'danger' | 'warning' | 'pending' | 'info' | 'neutral' | 'todo';
}

export const Badge = ({ className, variant = 'neutral', ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        'ui-badge shrink-0 whitespace-nowrap select-none',
        {
          'bg-fb-blue-soft text-fb-blue': variant === 'info',
          'bg-status-success-soft text-status-success': variant === 'success' || variant === 'todo',
          'bg-status-danger-soft text-status-danger': variant === 'danger',
          'bg-status-warning-soft text-status-warning': variant === 'warning' || variant === 'pending',
          'border border-fb-border bg-fb-surface-muted text-fb-text-secondary': variant === 'neutral',
        },
        className
      )}
      {...props}
    />
  );
};

Badge.displayName = 'Badge';
