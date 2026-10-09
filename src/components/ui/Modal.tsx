import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/**
 * One popup style for the whole app (2026-10-09) — information popups, confirmations and form
 * popups alike — modelled on the "Quản trị Epic" popup of TTM Dashboard 2 (EpicAlertsIframeModal):
 * the page behind is dimmed AND blurred, the frame has 2xl corners and a deep shadow, the header is
 * a 56px bar with an optional icon chip, a bold title and a square close button.
 *
 * `Modal` is the standard shell. A popup that needs its own layout (side navigation, iframe, ad
 * card) builds on the same pieces instead — MODAL_BACKDROP_CLASS, MODAL_FRAME_CLASS, ModalHeader and
 * useModalBehavior — so it can't drift from the shared look.
 */
export const MODAL_BACKDROP_CLASS = 'absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200';
export const MODAL_FRAME_CLASS = 'relative z-10 flex flex-col rounded-2xl border border-fb-border bg-fb-surface text-fb-text-primary shadow-2xl';

/** Open popups, bottom → top. Only the top one answers Escape, and the page scrolls again only once
 * the last one has closed — a confirmation opened over a form popup must not close or unlock both. */
const openModals: symbol[] = [];

/** Escape-to-close, page scroll lock and initial focus for a popup. */
export function useModalBehavior(isOpen: boolean, onClose: () => void, initialFocusRef?: React.RefObject<HTMLElement | null>): void {
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const token = Symbol('modal');
    openModals.push(token);
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals[openModals.length - 1] === token) onCloseRef.current();
    };
    window.addEventListener('keydown', handleEscape);
    const focusFrame = window.requestAnimationFrame(() => initialFocusRef?.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleEscape);
      openModals.splice(openModals.indexOf(token), 1);
      if (openModals.length === 0) document.body.style.overflow = '';
    };
  }, [isOpen, initialFocusRef]);
}

export interface ModalHeaderProps {
  /** Extra controls shown left of the close button (e.g. "Mở tab mới"). */
  actions?: React.ReactNode;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
  icon?: Icon;
  /** Omit to render a header without a close button. */
  onClose?: () => void;
  title: React.ReactNode;
  titleId?: string;
}

export function ModalHeader({ actions, closeButtonRef, icon: HeaderIcon, onClose, title, titleId }: ModalHeaderProps) {
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 rounded-t-2xl border-b border-fb-border px-5 py-2 select-none">
      <div className="flex min-w-0 items-center gap-2.5">
        {HeaderIcon && (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fb-blue-soft text-fb-blue">
            <HeaderIcon className="size-5" weight="bold" aria-hidden="true" />
          </div>
        )}
        <h2 id={titleId} className="min-w-0 truncate text-base font-bold text-fb-text-primary">{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {onClose && (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-fb-text-secondary outline-none transition-colors hover:bg-fb-control hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue"
            aria-label="Đóng hộp thoại"
          >
            <X className="size-5" weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** '3xl' is the extra-wide size for reference popups with wide tables ("Logic cảnh báo"). */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** Icon chip shown before the title. */
  icon?: Icon;
  /** 'top' lifts the popup above every other one — for confirmations asked from inside a popup. */
  layer?: 'default' | 'top';
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  icon,
  layer = 'default',
}: ModalProps) => {
  const titleId = React.useId();
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  useModalBehavior(isOpen, onClose, closeButtonRef);

  if (!isOpen) return null;

  return (
    <div className={cn('fixed inset-0 flex items-center justify-center p-4', layer === 'top' ? 'z-[120]' : 'z-[60]')} role="presentation">
      <div className={MODAL_BACKDROP_CLASS} onClick={onClose} aria-hidden="true" />

      <div
        className={cn(
          MODAL_FRAME_CLASS,
          'w-full',
          maxWidth === '3xl' ? 'max-h-[92dvh]' : 'max-h-[85dvh]',
          {
            'max-w-sm': maxWidth === 'sm',
            'max-w-md': maxWidth === 'md',
            'max-w-lg': maxWidth === 'lg',
            'max-w-3xl': maxWidth === 'xl',
            'max-w-6xl': maxWidth === '2xl',
            'max-w-[1600px]': maxWidth === '3xl',
          }
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <ModalHeader closeButtonRef={closeButtonRef} icon={icon} onClose={onClose} title={title} titleId={titleId} />

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-3 rounded-b-2xl border-t border-fb-border bg-fb-surface-muted px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

Modal.displayName = 'Modal';
