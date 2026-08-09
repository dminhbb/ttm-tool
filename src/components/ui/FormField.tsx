import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  children: React.ReactNode;
  className?: string;
  error?: string;
  helperText?: string;
  id: string;
  label?: string;
  labelAdornment?: React.ReactNode;
  required?: boolean;
}

export function FormField({
  children,
  className,
  error,
  helperText,
  id,
  label,
  labelAdornment,
  required,
}: FormFieldProps) {
  const descriptionId = error || helperText ? `${id}-description` : undefined;

  return (
    <div className={cn('ui-field', className)}>
      {(label || labelAdornment) && (
        <div className="flex min-h-5 items-center justify-between gap-3">
          {label ? (
            <label htmlFor={id} className="ui-label">
              {label}
              {required && <span className="ml-1 text-status-danger" aria-hidden="true">*</span>}
            </label>
          ) : <span />}
          {labelAdornment}
        </div>
      )}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            'aria-describedby': descriptionId,
            'aria-invalid': Boolean(error),
            id,
          })
        : children}
      {(error || helperText) && (
        <p
          id={descriptionId}
          className={cn(error ? 'ui-error' : 'ui-helper')}
          role={error ? 'alert' : undefined}
        >
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
