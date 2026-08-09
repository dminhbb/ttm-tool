import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  variant?: 'danger' | 'info' | 'neutral' | 'warning';
}

export const TableAction = React.forwardRef<HTMLButtonElement, TableActionProps>(
  ({ children, className, icon, type, variant = 'neutral', ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'ui-button ui-button-sm shrink-0 whitespace-nowrap outline-none select-none disabled:cursor-not-allowed disabled:opacity-55',
        {
          'ui-button-secondary': variant === 'neutral',
          'border-fb-blue bg-fb-blue-soft text-fb-blue': variant === 'info',
          'border-status-warning bg-status-warning-soft text-status-warning': variant === 'warning',
          'border-status-danger bg-status-danger-soft text-status-danger': variant === 'danger',
        },
        className,
      )}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  ),
);

TableAction.displayName = 'TableAction';
