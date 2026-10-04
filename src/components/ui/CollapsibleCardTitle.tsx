'use client';

import { CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

/**
 * A Card title that shows/hides its section — click the title (or its caret) to toggle. The owner
 * keeps the `expanded` state (and decides what to render while collapsed) so it can, e.g., defer
 * loading the section's data until it's first opened.
 */
export function CollapsibleCardTitle({ children, controlsId, expanded, onToggle }: {
  children: React.ReactNode;
  /** id of the element shown/hidden — for aria-controls. */
  controlsId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      title={expanded ? 'Bấm để thu gọn' : 'Bấm để mở rộng'}
      className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-fb-blue"
    >
      <CaretRight
        className={cn('size-4 shrink-0 text-fb-text-secondary transition-transform duration-200', expanded && 'rotate-90')}
        weight="bold"
        aria-hidden="true"
      />
      <h3 className="ui-card-title">{children}</h3>
    </button>
  );
}
