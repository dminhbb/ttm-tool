'use client';

import * as React from 'react';
import { CaretDoubleLeft, CaretDoubleRight } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export interface RightPanelItem {
  icon: Icon;
  label: string;
}

export interface RightPanelProps {
  children: React.ReactNode;
  className?: string;
  expanded: boolean;
  items: RightPanelItem[];
  onToggle: () => void;
}

export function RightPanel({ children, className, expanded, items, onToggle }: RightPanelProps) {
  return (
    <aside
      className={cn(
        'right-panel-surface flex min-w-0 shrink-0 flex-col rounded-lg border border-fb-border xl:sticky xl:top-20',
        expanded ? 'w-full xl:w-[360px]' : 'w-full xl:min-h-[360px] xl:w-14',
        className,
      )}
      aria-label="Bảng công cụ phụ trợ"
    >
      <div className="flex justify-center border-b border-fb-border p-2">
        <Tooltip content={expanded ? 'Thu gọn' : 'Mở rộng'} side="left" className="w-auto">
          <button
            type="button"
            onClick={onToggle}
            className="grid size-9 place-items-center rounded-md text-fb-text-secondary transition-[background-color,color] duration-200 hover:bg-fb-control hover:text-fb-blue focus-visible:outline-none"
            aria-label={expanded ? 'Thu gọn bảng công cụ phụ trợ' : 'Mở rộng bảng công cụ phụ trợ'}
            aria-expanded={expanded}
          >
            {expanded
              ? <CaretDoubleRight className="size-5" weight="bold" aria-hidden="true" />
              : <CaretDoubleLeft className="size-5" weight="bold" aria-hidden="true" />}
          </button>
        </Tooltip>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-6 p-3">{children}</div>
      ) : (
        <nav className="flex flex-1 items-center justify-around gap-4 p-2 xl:flex-col xl:justify-center" aria-label="Mở bảng công cụ phụ trợ">
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <Tooltip key={item.label} content={item.label} side="left">
                <button
                  type="button"
                  onClick={onToggle}
                  className="grid size-9 place-items-center rounded-md text-fb-text-secondary transition-[background-color,color] duration-200 hover:bg-fb-control hover:text-fb-blue focus-visible:outline-none"
                  aria-label={`Mở ${item.label}`}
                >
                  <ItemIcon className="size-5" weight="bold" aria-hidden="true" />
                </button>
              </Tooltip>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
