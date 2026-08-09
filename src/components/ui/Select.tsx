import * as React from 'react';
import { cn } from '@/lib/utils';
import { CaretDown } from '@phosphor-icons/react';
import { FormField } from '@/components/ui/FormField';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;

    return (
      <FormField id={selectId} label={label} error={error} helperText={helperText} required={required}>
        <div className="relative w-full">
          <select
            ref={ref}
            className={cn(
              'ui-select form-control-compact appearance-none pr-9',
              {
                'border-status-danger': error,
              },
              className
            )}
            required={required}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-fb-text-secondary">
            <CaretDown className="size-4" weight="bold" aria-hidden="true" />
          </div>
        </div>
      </FormField>
    );
  }
);

Select.displayName = 'Select';
