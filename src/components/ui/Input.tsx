import * as React from 'react';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/ui/FormField';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  labelAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, helperText, id, labelAdornment, required, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <FormField
        id={inputId}
        label={label}
        error={error}
        helperText={helperText}
        labelAdornment={labelAdornment}
        required={required}
      >
        <input
          type={type}
          ref={ref}
          className={cn(
            'ui-input form-control-compact placeholder:text-fb-text-placeholder',
            {
              'border-status-danger': error,
            },
            className
          )}
          required={required}
          {...props}
        />
      </FormField>
    );
  }
);

Input.displayName = 'Input';
