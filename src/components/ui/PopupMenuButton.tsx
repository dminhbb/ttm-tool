'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

/** One selectable entry of a PopupMenuButton popup. */
export interface PopupMenuItem {
  /** Menu-item label. */
  label: string;
  /** Optional Phosphor icon (render directly, e.g. `<FileXls size={16} />`). */
  icon?: React.ReactNode;
  /** Triggered when the item is clicked (the popup closes first). */
  onClick: () => void;
  /** Visual tone: 'default' (dark text) or 'danger' (red). */
  tone?: 'default' | 'danger';
}

export interface PopupMenuButtonProps {
  /** Trigger-button label (rendered as `<span>`; icon/text decided by the caller). */
  label?: React.ReactNode;
  /** `aria-label` of the trigger button. */
  ariaLabel: string;
  /** Menu entries shown when the popup is open. */
  menuItems: PopupMenuItem[];
  /** True disables the trigger (renders muted, no popup). */
  disabled?: boolean;
  /** When `disabled`, hover/`.disabled` shows this tooltip instead of opening. */
  disabledTooltip?: string;
  /** Extra classes for the trigger button. */
  className?: string;
}

/**
 * Reusable trigger button that opens a small popup menu right below it (used by "Xuất Dữ Liệu" on
 * Quản trị Epic, but meant to be shared by any toolbar).
 *
 * - The popup is rendered through `createPortal` to `document.body` with `position: fixed` so no
 *   ancestor's `overflow`/`z-index`/`transform` can clip it; the fixed layer carries a maximum
 *   z-index (`2147483647`) so nothing else on screen covers it.
 * - It self-positions just below the trigger and clamps itself fully inside the viewport (flipping
 *   above and/or shifting horizontally) so it never goes off the screen edges.
 * - Closes on: choosing an item, clicking outside (`mousedown`), or pressing Escape.
 * - When `disabled`, the trigger renders muted and non-interactive; if `disabledTooltip` is given it
 *   is shown on hover via the shared `Tooltip`.
 */
export function PopupMenuButton({
  ariaLabel,
  className,
  disabled = false,
  disabledTooltip,
  label,
  menuItems,
}: PopupMenuButtonProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
  // Tracks whether the popup has already been clamped inside the viewport, so the layout effect
  // runs the clamp exactly once per open (otherwise setPosition inside the effect re-triggers it
  // forever → "Maximum update depth exceeded").
  const clampedRef = React.useRef(false);

  // Open: measure the trigger once, place the popup just below it. The clamp-to-viewport pass runs
  // in a layout effect once the popup has actually mounted (it needs its real size).
  const open = () => {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    clampedRef.current = false;
    setPosition({ left: rect.left, top: rect.bottom + 4 });
  };
  const close = () => setPosition(null);

  // After the popup mounts, re-measure it once and clamp inside the viewport (flip above if it
  // would overflow the bottom, shift left if it would overflow the right).
  React.useLayoutEffect(() => {
    if (!position || clampedRef.current || !popupRef.current || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popupRect = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    let left = triggerRect.left;
    let top = triggerRect.bottom + 4;
    // Flip above when there is not enough room below.
    if (top + popupRect.height + margin > vh) top = Math.max(margin, triggerRect.top - popupRect.height - 4);
    // Shift horizontally to stay inside.
    left = Math.max(margin, Math.min(left, vw - popupRect.width - margin));
    top = Math.max(margin, top);
    clampedRef.current = true;
    setPosition({ left, top });
  }, [position]);

  // Close on outside click / Escape / scroll+resize.
  React.useEffect(() => {
    if (!position) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (popupRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const dismiss = () => close();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [position]);

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={Boolean(position)}
      disabled={disabled}
      onClick={open}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-fb-border bg-white text-xs font-semibold text-fb-text-secondary shadow-sm transition-colors cursor-pointer shrink-0',
        'hover:bg-fb-surface-muted hover:border-fb-border',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-white',
        className,
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      {disabled && disabledTooltip ? (
        <Tooltip content={disabledTooltip} side="top" className="inline-flex w-auto shrink-0">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      {position && createPortal(
        <div
          ref={popupRef}
          role="menu"
          aria-label={ariaLabel}
          className="fixed min-w-[150px] rounded-lg border border-fb-border bg-fb-surface p-1 shadow-dialog"
          style={{ left: position.left, top: position.top, zIndex: 2147483647 }}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cn(
                'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer',
                item.tone === 'danger'
                  ? 'text-status-danger hover:bg-fb-surface-muted'
                  : 'text-fb-text-primary hover:bg-fb-surface-muted',
              )}
              onClick={() => { close(); item.onClick(); }}
            >
              {item.icon && <span className="flex shrink-0 items-center">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
