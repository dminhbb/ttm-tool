import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('ui-card flex flex-col', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-card-header flex items-center justify-between gap-4', className)} {...props} />
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('ui-card-title', className)} {...props} />
);
CardTitle.displayName = 'CardTitle';

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-card-body flex flex-col gap-4', className)} {...props} />
);
CardBody.displayName = 'CardBody';

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-card-footer flex flex-wrap items-center justify-end gap-3', className)} {...props} />
);
CardFooter.displayName = 'CardFooter';
