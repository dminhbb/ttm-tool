import * as React from 'react';
import { cn } from '@/lib/utils';

export const TableContainer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ui-table-wrap', className)} {...props} />
);
TableContainer.displayName = 'TableContainer';

export const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn('ui-table border-collapse text-left tabular-nums', className)} {...props} />
);
Table.displayName = 'Table';

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={className} {...props} />
);
THead.displayName = 'THead';

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody
    className={cn(
      'divide-y divide-fb-border',
      className,
    )}
    {...props}
  />
);
TBody.displayName = 'TBody';

export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('transition-colors duration-150', className)} {...props} />
);
TR.displayName = 'TR';

export const TH = ({ children, className, scope = 'col', ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn('align-middle select-none', className)}
    scope={scope}
    {...props}
  >
    <span className="block whitespace-nowrap">{children}</span>
  </th>
);
TH.displayName = 'TH';

export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('whitespace-nowrap', className)} {...props} />
);
TD.displayName = 'TD';
