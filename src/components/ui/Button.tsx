import * as React from 'react';
import { cn } from '@/lib/utils';
import { CircleNotch } from '@phosphor-icons/react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'ui-button whitespace-nowrap outline-none select-none disabled:cursor-not-allowed disabled:opacity-55',
          {
            'ui-button-primary': variant === 'primary',
            'ui-button-secondary': variant === 'secondary' || variant === 'outline' || variant === 'glass',
            'ui-button-danger': variant === 'danger',
            'ui-button-ghost': variant === 'ghost',
          },
          {
            'ui-button-sm': size === 'sm',
            'ui-button-lg': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <CircleNotch className="w-4 h-4 animate-spin shrink-0" weight="bold" />
        ) : (
          icon && <span className="inline-flex shrink-0">{icon}</span>
        )}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
