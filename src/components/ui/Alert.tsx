import * as React from 'react';
import { CheckCircle, Info, Warning, XCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'success' | 'warning' | 'error' | 'info';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  variant?: AlertVariant;
}

const icons = {
  success: CheckCircle,
  warning: Warning,
  error: XCircle,
  info: Info,
};

export function Alert({ children, className, title, variant = 'info', ...props }: AlertProps) {
  const Icon = icons[variant];

  return (
    <div
      className={cn(
        'ui-alert items-start',
        {
          'border-status-success bg-status-success-soft text-status-success': variant === 'success',
          'border-status-warning bg-status-warning-soft text-status-warning': variant === 'warning',
          'border-status-danger bg-status-danger-soft text-status-danger': variant === 'error',
          'border-fb-blue bg-fb-blue-soft text-fb-blue': variant === 'info',
        },
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" weight="fill" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-0.5 text-sm font-medium leading-5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
