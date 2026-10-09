'use client';

import * as React from 'react';
import { Info, PencilSimpleLine, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * App-styled replacements for the browser's own confirm() / alert() / prompt(), which can't be
 * styled: `await confirmDialog(…)`, `await alertDialog(…)`, `await promptDialog(…)` show the shared
 * popup (Modal — same frame and blurred backdrop as every other popup) and resolve with the answer.
 * They work from anywhere on the client, like showToast: <DialogHost /> is mounted once in AppShell.
 * Requests asked while another one is open wait their turn.
 */
export interface ConfirmDialogOptions {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  title?: string;
  /** 'danger' (default) for deletions and other irreversible actions; 'primary' for a plain go-ahead. */
  tone?: 'danger' | 'primary';
}

export interface AlertDialogOptions {
  closeLabel?: string;
  description: string;
  title?: string;
}

export interface PromptDialogOptions {
  confirmLabel?: string;
  defaultValue?: string;
  inputType?: 'text' | 'url';
  label: string;
  placeholder?: string;
  title: string;
}

type DialogRequest =
  | ({ kind: 'confirm'; resolve: (confirmed: boolean) => void } & ConfirmDialogOptions)
  | ({ kind: 'alert'; resolve: () => void } & AlertDialogOptions)
  | ({ kind: 'prompt'; resolve: (value: string | null) => void } & PromptDialogOptions);

let enqueue: ((request: DialogRequest) => void) | null = null;

/** Resolves true when the user confirms, false on Hủy / Escape / click outside. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (enqueue) enqueue({ kind: 'confirm', resolve, ...options });
    else resolve(typeof window !== 'undefined' && window.confirm(options.description));
  });
}

/** Resolves once the user has closed the message. */
export function alertDialog(options: AlertDialogOptions): Promise<void> {
  return new Promise((resolve) => {
    if (enqueue) { enqueue({ kind: 'alert', resolve, ...options }); return; }
    if (typeof window !== 'undefined') window.alert(options.description);
    resolve();
  });
}

/** Resolves with the trimmed text, or null when cancelled. */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (enqueue) enqueue({ kind: 'prompt', resolve, ...options });
    else resolve(typeof window !== 'undefined' ? window.prompt(options.label, options.defaultValue ?? '') : null);
  });
}

function ActiveDialog({ onSettled, request }: { onSettled: () => void; request: DialogRequest }) {
  const [value, setValue] = React.useState(request.kind === 'prompt' ? request.defaultValue ?? '' : '');
  const formId = React.useId();
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Runs after Modal's own initial focus (the close button), so Enter answers the dialog like the
  // browser's own boxes did.
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => (inputRef.current ?? primaryRef.current)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const dismiss = () => {
    if (request.kind === 'confirm') request.resolve(false);
    else if (request.kind === 'alert') request.resolve();
    else request.resolve(null);
    onSettled();
  };
  const accept = () => {
    if (request.kind === 'confirm') request.resolve(true);
    else if (request.kind === 'alert') request.resolve();
    else request.resolve(value.trim() || null);
    onSettled();
  };

  if (request.kind === 'alert') {
    return (
      <Modal icon={Info} isOpen layer="top" onClose={dismiss} title={request.title ?? 'Thông báo'} footer={<Button ref={primaryRef} onClick={accept}>{request.closeLabel ?? 'Đã hiểu'}</Button>}>
        <p className="whitespace-pre-line text-fb-text-secondary">{request.description}</p>
      </Modal>
    );
  }

  if (request.kind === 'prompt') {
    return (
      <Modal
        icon={PencilSimpleLine}
        isOpen
        layer="top"
        onClose={dismiss}
        title={request.title}
        footer={<><Button onClick={dismiss} variant="outline">Hủy</Button><Button form={formId} type="submit">{request.confirmLabel ?? 'Xác nhận'}</Button></>}
      >
        <form id={formId} onSubmit={(event) => { event.preventDefault(); accept(); }}>
          <Input ref={inputRef} label={request.label} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} type={request.inputType ?? 'text'} value={value} />
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      icon={Warning}
      isOpen
      layer="top"
      onClose={dismiss}
      title={request.title ?? 'Xác nhận'}
      footer={<><Button onClick={dismiss} variant="outline">{request.cancelLabel ?? 'Hủy'}</Button><Button ref={primaryRef} onClick={accept} variant={request.tone === 'primary' ? 'primary' : 'danger'}>{request.confirmLabel ?? 'Xác nhận'}</Button></>}
    >
      <p className="whitespace-pre-line text-fb-text-secondary">{request.description}</p>
    </Modal>
  );
}

/** Renders the dialogs requested through confirmDialog / alertDialog / promptDialog, one at a time. */
export function DialogHost() {
  const [queue, setQueue] = React.useState<{ id: number; request: DialogRequest }[]>([]);
  const nextId = React.useRef(0);

  React.useEffect(() => {
    enqueue = (request) => setQueue((current) => [...current, { id: nextId.current++, request }]);
    return () => { enqueue = null; };
  }, []);

  const current = queue[0];
  if (!current) return null;
  return <ActiveDialog key={current.id} onSettled={() => setQueue((items) => items.slice(1))} request={current.request} />;
}
