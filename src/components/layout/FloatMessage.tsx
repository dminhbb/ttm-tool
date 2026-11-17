'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { ChatCircleText, X } from '@phosphor-icons/react';
import { isBottomRightSlotBusy, subscribeBottomRightSlot } from '@/lib/bottom-right-slot';
import type { FloatMessagePosition, PublicFloatMessage } from '@/lib/float-message';
import { cn } from '@/lib/utils';

/**
 * "Float message" (owner 2026-11-17, spec docs/superpowers/specs/2026-11-17-float-message-design.md): a strongly rounded
 * floating box — message icon + custom text, like a "PopupKit" badge — at the top-right (under the header) or
 * bottom-right corner. FloatMessageBox is the box alone (also used by the admin preview); FloatMessageDisplay loads the
 * message of the day for the signed-in user and decides when it shows.
 *
 * Owner 2026-11-17 (second pass): background 80 % opaque (blurred behind), box and text 20 % smaller than the first
 * version, at most about 50 characters per line (longer text wraps), and closing it (X or auto-hide) only lasts for the
 * screen being viewed — the message is important, so it shows again on every page load, refresh or screen change.
 */

export function FloatMessageBox({ dismissible, onClose, text }: { dismissible: boolean; onClose?: () => void; text: string }) {
  return (
    <div className="relative flex w-max max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-[1.4rem] border border-fb-border bg-fb-surface/80 py-2.5 pr-5 pl-3 text-fb-text-primary shadow-[0_14px_32px_-10px_rgba(15,23,42,0.35)] backdrop-blur-md">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fb-blue/10 text-fb-blue">
        <ChatCircleText className="size-[19px]" weight="fill" aria-hidden="true" />
      </span>
      {/* ~50 characters per line at most (50ch of this font); longer text wraps onto more lines. */}
      <p className="min-w-0 max-w-[50ch] whitespace-pre-line break-words text-[12px] font-bold leading-snug">{text}</p>
      {dismissible && (
        <button
          aria-label="Đóng thông báo"
          className="absolute -top-1.5 -right-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-fb-border bg-fb-surface text-fb-text-secondary shadow-sm outline-none hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue"
          onClick={onClose}
          type="button"
        >
          <X className="size-3" weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Fixed in its corner; slides / fades in and out. `layerClassName` sets the stacking layer (z-index). */
export function FloatMessageFrame({ children, layerClassName = 'z-[50]', position, visible }: {
  children: React.ReactNode;
  layerClassName?: string;
  position: FloatMessagePosition;
  visible: boolean;
}) {
  const isTop = position === 'TOP_RIGHT';
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'fixed right-4 transition-all duration-300',
        layerClassName,
        // Top-right sits under the 64 px header so it never covers the header's own buttons.
        isTop ? 'top-20' : 'bottom-4',
        visible ? 'translate-y-0 opacity-100' : cn('pointer-events-none opacity-0', isTop ? '-translate-y-3' : 'translate-y-3'),
      )}
      role="status"
    >
      {children}
    </div>
  );
}

function useBottomRightSlotBusy(): boolean {
  return React.useSyncExternalStore(subscribeBottomRightSlot, isBottomRightSlotBusy, () => false);
}

/**
 * Loads GET /api/float-message once per page load. Bottom-right: waits while another notice holds that corner
 * (bottom-right-slot.ts — "epic được giao task") and steps aside if one arrives while it is shown; the auto-hide count
 * starts each time the box actually shows. Closed (X) or timed out: hidden on this screen only — a refresh, another
 * page load or another screen (pathname) shows it again.
 */
export function FloatMessageDisplay() {
  const pathname = usePathname();
  const [message, setMessage] = React.useState<PublicFloatMessage | null>(null);
  const [closedOnPath, setClosedOnPath] = React.useState<string | null>(null);
  const closed = closedOnPath === pathname;
  const slotBusy = useBottomRightSlotBusy();

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/float-message', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { message?: PublicFloatMessage | null } | null) => {
        setMessage(data?.message ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const close = React.useCallback(() => setClosedOnPath(pathname), [pathname]);

  const showing = Boolean(message) && !closed && !(message?.position === 'BOTTOM_RIGHT' && slotBusy);

  React.useEffect(() => {
    if (!showing || !message?.autoHideSeconds) return;
    const timer = window.setTimeout(close, message.autoHideSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [close, message, showing]);

  if (!message) return null;
  return (
    <FloatMessageFrame position={message.position} visible={showing}>
      <FloatMessageBox dismissible={message.dismissible} onClose={close} text={message.text} />
    </FloatMessageFrame>
  );
}

/** Admin preview: the box in its real corner, above the open Quản trị hệ thống dialog. */
export function FloatMessagePreview({ autoHideSeconds, dismissible, onDone, position, text }: {
  autoHideSeconds: number | null;
  dismissible: boolean;
  onDone: () => void;
  position: FloatMessagePosition;
  text: string;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const finish = React.useCallback(() => {
    setVisible(false);
    window.setTimeout(onDone, 300);
  }, [onDone]);

  React.useEffect(() => {
    if (!autoHideSeconds) return;
    const timer = window.setTimeout(finish, autoHideSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [autoHideSeconds, finish]);

  return createPortal(
    <FloatMessageFrame layerClassName="z-[130]" position={position} visible={visible}>
      <FloatMessageBox dismissible={dismissible} onClose={finish} text={text || 'Nội dung Float message'} />
    </FloatMessageFrame>,
    document.body,
  );
}
