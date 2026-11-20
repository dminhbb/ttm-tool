'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChatCircleText } from '@phosphor-icons/react';
import {
  dismissActiveFloatMessage,
  enqueueFloatMessage,
  FLOAT_MESSAGE_PRIORITY,
  getFloatQueueSnapshot,
  removeFloatMessageById,
  setFloatKindRanks,
  subscribeFloatQueue,
  type FloatQueueSnapshot,
  type QueuedFloatMessage,
} from '@/lib/bottom-right-slot';
import {
  FLOAT_MESSAGE_CHANGED_EVENT,
  isInternalFloatMessageUrl,
  type FloatMessagePriorities,
  type FloatMessagePosition,
  type PublicFloatMessage,
} from '@/lib/float-message';
import { cn } from '@/lib/utils';

/**
 * "Float message" (owner 2026-11-17 / 2026-11-18, spec docs/superpowers/specs/2026-11-17-float-message-design.md):
 * - Hộp thông báo nổi bo tròn mạnh (icon message + nội dung chữ), nền độ trong suốt 70% (`bg-fb-surface/70`) kèm làm mờ phía sau.
 * - Animation khi hiển thị: trượt ra từ phía lề phải của màn hình với tốc độ 0.7x (`duration-[430ms] ease-out`).
 * - Đồng bộ dùng chung cho:
 *     #1 Thông báo Tạo cache (timeout = 10s, có nút 'x')
 *     #2 Thông báo My assigned tasks (timeout = 10s, có nút 'x')
 *     #3 Nội dung cấu hình tại Quản trị hệ thống của SUPERADMIN (luôn xếp cuối hàng đợi)
 * - Các message trong hàng đợi hiển thị lần lượt cách nhau 2 giây (sau khi message trước hết timeout hoặc bị tắt).
 */

/** Viền nổi bật — màu chủ đạo (accent) của theme, dùng chung cho My assigned tasks (REQ-20261118-04). */
export const FLOAT_MESSAGE_HIGHLIGHT_BORDER = 'border-2 border-fb-blue';

export function FloatMessageBox({
  borderClassName,
  clickable,
  dismissible,
  onClick,
  onClose,
  text,
}: {
  borderClassName?: string;
  /** Bấm được (có URL / hành động): hiện chữ "CLICK HERE!" nhấp nháy ngay dưới góc phải hộp. */
  clickable?: boolean;
  dismissible: boolean;
  onClick?: () => void;
  onClose?: () => void;
  text: string;
}) {
  return (
    <div
      className={cn(
        'relative flex w-max max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-[1.4rem] bg-fb-surface/70 py-2.5 pr-5 pl-3 text-fb-text-primary shadow-[0_14px_32px_-10px_rgba(15,23,42,0.35)] backdrop-blur-md',
        borderClassName ?? 'border border-fb-border',
        onClick && 'cursor-pointer hover:bg-fb-surface/85',
      )}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fb-blue/10 text-fb-blue">
        <ChatCircleText className="size-[19px]" weight="fill" aria-hidden="true" />
      </span>
      {/* ~50 characters per line at most (50ch of this font); longer text wraps onto more lines. */}
      <p className="min-w-0 max-w-[50ch] whitespace-pre-line break-words text-[12px] font-bold leading-snug">{text}</p>
      {(clickable || onClick) && (
        <span aria-hidden="true" className="float-message-blink pointer-events-none absolute top-full right-3 mt-1 text-[11px] font-extrabold tracking-wide text-fb-blue">
          CLICK HERE!
        </span>
      )}
      {dismissible && (
        <button
          aria-label="Đóng thông báo"
          className="absolute -top-1.5 -right-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-fb-border bg-fb-surface text-fb-text-secondary shadow-sm outline-none hover:text-fb-text-primary focus-visible:ring-2 focus-visible:ring-fb-blue"
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          type="button"
        >
          <span aria-hidden="true" className="text-[11px] font-bold leading-none">x</span>
        </button>
      )}
    </div>
  );
}

/**
 * Cố định ở góc phải màn hình; trượt từ lề phải màn hình vào với tốc độ 0.7x (~430ms = 300ms / 0.7).
 * `layerClassName` đặt lớp hiển thị (z-index).
 */
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
        'fixed right-4 transition-all duration-[430ms] ease-out',
        layerClassName,
        // Top-right sits under the 64 px header so it never covers the header's own buttons.
        isTop ? 'top-20' : 'bottom-7',
        visible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0',
      )}
      role="status"
    >
      {children}
    </div>
  );
}

/**
 * Mở URL của float message: tab hiện tại (mặc định) hoặc tab mới; đường dẫn nội bộ đi qua router khi mở tab hiện tại.
 */
function openFloatMessageUrl(url: string, openInNewTab: boolean, router: ReturnType<typeof useRouter>): void {
  if (openInNewTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else if (isInternalFloatMessageUrl(url)) {
    router.push(url);
  } else {
    window.location.assign(url);
  }
}

const SERVER_QUEUE_SNAPSHOT: FloatQueueSnapshot = { active: null, coolingDown: false, queuedCount: 0 };

function useFloatQueueSnapshot(): FloatQueueSnapshot {
  return React.useSyncExternalStore(subscribeFloatQueue, getFloatQueueSnapshot, () => SERVER_QUEUE_SNAPSHOT);
}

/**
 * Hiển thị lần lượt các Float message trong hàng đợi ưu tiên:
 *   #1 Tạo cache → #2 My assigned tasks → #3 Nội dung cấu hình Quản trị hệ thống của SUPERADMIN.
 * Mỗi message cách nhau 2 giây sau khi message trước hết timeout hoặc bị đóng bằng nút 'x'.
 * Với message #3 của SUPERADMIN: nút 'x' hoặc tự tắt chỉ ẩn ở màn hình đang xem; tải lại trang hoặc chuyển sang
 * màn hình khác (`pathname` đổi) sẽ đưa lại #3 vào cuối hàng đợi.
 */
export function FloatMessageDisplay() {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useFloatQueueSnapshot();
  const [systemMessage, setSystemMessage] = React.useState<PublicFloatMessage | null>(null);
  const [enteredSeq, setEnteredSeq] = React.useState<number | null>(null);
  const [lastActive, setLastActive] = React.useState<QueuedFloatMessage | null>(null);

  const loadSystemMessage = React.useCallback((signal?: AbortSignal) => {
    fetch('/api/float-message', { cache: 'no-store', signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { message?: PublicFloatMessage | null; priorities?: FloatMessagePriorities } | null) => {
        if (data?.priorities) setFloatKindRanks({ assignedTasks: data.priorities['FM-002'], cache: data.priorities['FM-001'] });
        const next = data?.message ?? null;
        setSystemMessage(next);
        if (!next) removeFloatMessageById('system-config');
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    loadSystemMessage(controller.signal);
    const onChanged = () => loadSystemMessage();
    window.addEventListener(FLOAT_MESSAGE_CHANGED_EVENT, onChanged);
    return () => {
      controller.abort();
      window.removeEventListener(FLOAT_MESSAGE_CHANGED_EVENT, onChanged);
    };
  }, [loadSystemMessage]);

  // Đưa nội dung cấu hình của SUPERADMIN vào cuối hàng đợi (#3) khi tải xong và mỗi khi người dùng chuyển màn hình.
  React.useEffect(() => {
    if (!systemMessage) return;
    enqueueFloatMessage({
      autoHideSeconds: systemMessage.autoHideSeconds,
      dismissible: systemMessage.dismissible,
      highlightBorder: systemMessage.highlightBorder,
      id: 'system-config',
      onClick: systemMessage.url ? () => openFloatMessageUrl(systemMessage.url as string, systemMessage.openInNewTab, router) : undefined,
      position: systemMessage.position,
      priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG,
      text: systemMessage.text,
    });
  }, [pathname, router, systemMessage]);

  if (active && active !== lastActive) {
    setLastActive(active);
  }

  const activeSeq = active?.seq ?? null;
  React.useEffect(() => {
    if (activeSeq === null) return undefined;
    const frame = window.requestAnimationFrame(() => setEnteredSeq(activeSeq));
    return () => window.cancelAnimationFrame(frame);
  }, [activeSeq]);

  const rendered = active ?? lastActive;
  if (!rendered) return null;

  const visible = Boolean(active && enteredSeq === active.seq);
  const position: FloatMessagePosition = rendered.position ?? systemMessage?.position ?? 'BOTTOM_RIGHT';

  const handleClose = () => {
    dismissActiveFloatMessage(rendered.id);
  };

  const handleClick = rendered.onClick
    ? () => {
        const action = rendered.onClick;
        dismissActiveFloatMessage(rendered.id);
        action?.();
      }
    : undefined;

  return (
    <FloatMessageFrame position={position} visible={visible}>
      <FloatMessageBox
        borderClassName={rendered.highlightBorder ? FLOAT_MESSAGE_HIGHLIGHT_BORDER : undefined}
        clickable={Boolean(rendered.onClick)}
        dismissible={rendered.dismissible}
        onClick={handleClick}
        onClose={handleClose}
        text={rendered.text}
      />
    </FloatMessageFrame>
  );
}

/** Admin preview: the box in its real corner, above the open Quản trị hệ thống dialog. */
export function FloatMessagePreview({ autoHideSeconds, clickable = false, dismissible, highlightBorder = false, onDone, position, text }: {
  autoHideSeconds: number | null;
  clickable?: boolean;
  dismissible: boolean;
  highlightBorder?: boolean;
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
    window.setTimeout(onDone, 430);
  }, [onDone]);

  React.useEffect(() => {
    if (!autoHideSeconds) return;
    const timer = window.setTimeout(finish, autoHideSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [autoHideSeconds, finish]);

  return createPortal(
    <FloatMessageFrame layerClassName="z-[130]" position={position} visible={visible}>
      <FloatMessageBox borderClassName={highlightBorder ? FLOAT_MESSAGE_HIGHLIGHT_BORDER : undefined} clickable={clickable} dismissible={dismissible} onClose={finish} text={text || 'Nội dung Float message'} />
    </FloatMessageFrame>,
    document.body,
  );
}
