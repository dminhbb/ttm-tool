import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-lg bg-fb-border/70', className)} aria-hidden="true" {...props} />;
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid grid-cols-[1fr_2fr_1fr_5rem] gap-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ))}
    </div>
  );
}

