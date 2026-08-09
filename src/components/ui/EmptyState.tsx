import * as React from 'react';
import { Tray } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  description?: string;
  icon?: React.ReactNode;
  title: string;
}

export function EmptyState({ className, description, icon, title, ...props }: EmptyStateProps) {
  return (
    <div className={cn('ui-empty rounded-lg border border-dashed border-fb-border', className)} {...props}>
      <div className="mb-3 grid size-10 place-items-center rounded-md bg-fb-blue-soft text-fb-blue">
        {icon ?? <Tray className="size-5" weight="bold" aria-hidden="true" />}
      </div>
      <p className="text-sm font-bold text-fb-text-primary">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-5 text-fb-text-secondary">{description}</p>}
    </div>
  );
}
