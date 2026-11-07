'use client';

import * as React from 'react';
import { LockKey } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { UserPickerModal } from '@/components/ui/UserPickerModal';
import { extractUsername } from '@/lib/username';
import type { ViewAsCandidate } from '@/lib/view-as';

/** Reloads the current screen so every request is made as the new identity (a screen the user may not see is redirected by the proxy). */
function reloadAsNewIdentity(): void {
  window.location.reload();
}

/**
 * "Xem với User khác.." (SUPERADMIN): pick an active user, confirm the SUPERADMIN's own password, then the whole app runs
 * with that user's role / permissions / data scope — read-only (view-as.ts). Also used to switch to another user.
 */
export function ViewAsFlow({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [users, setUsers] = React.useState<ViewAsCandidate[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [target, setTarget] = React.useState<ViewAsCandidate | null>(null);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setIsLoading(true);
      fetch('/api/auth/view-as', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { users: [] }))
        .then((data: { users?: ViewAsCandidate[] }) => { if (!cancelled) setUsers(data.users ?? []); })
        .catch(() => undefined)
        .finally(() => { if (!cancelled) setIsLoading(false); });
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  const close = () => {
    setTarget(null);
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!target || !password) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id, password }),
      });
      if (response.ok) {
        reloadAsNewIdentity();
        return;
      }
      const result: { error?: string } = await response.json().catch(() => ({}));
      setError(result.error ?? 'Không thể bật chế độ View as.');
    } catch {
      setError('Không thể kết nối máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;
  if (!target) {
    return <UserPickerModal isOpen isLoading={isLoading} onClose={close} onSelect={setTarget} title="Chọn User để xem với tư cách (View as)" users={users} />;
  }
  return (
    <Modal
      isOpen
      onClose={close}
      title="Xác nhận mật khẩu để View as"
      icon={LockKey}
      maxWidth="sm"
      footer={(
        <>
          <Button variant="outline" onClick={() => { setTarget(null); setPassword(''); setError(null); }} disabled={isSubmitting}>Chọn user khác</Button>
          <Button variant="primary" onClick={() => void submit()} isLoading={isSubmitting} disabled={!password}>Bắt đầu View as</Button>
        </>
      )}
    >
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="text-fb-text-secondary">
          Bạn sắp xem ứng dụng với tư cách <strong>{extractUsername(target.email)}</strong> ({target.role}). Chế độ này <strong>chỉ xem</strong>, mọi thao tác thay đổi dữ liệu bị chặn. Nhập mật khẩu của chính bạn để tiếp tục.
        </p>
        <Input
          autoComplete="current-password"
          autoFocus
          error={error ?? undefined}
          label="Mật khẩu của bạn"
          onChange={(event) => { setPassword(event.target.value); setError(null); }}
          type="password"
          value={password}
        />
      </form>
    </Modal>
  );
}

/** Badge anchored bottom-right while View as is on: "View as {username}. Thoát". */
export function ViewAsBadge({ username }: { username: string }) {
  const [isLeaving, setIsLeaving] = React.useState(false);
  const leave = async () => {
    setIsLeaving(true);
    try {
      await fetch('/api/auth/view-as', { method: 'DELETE' });
    } finally {
      reloadAsNewIdentity();
    }
  };
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex items-center gap-1.5 rounded-full bg-status-danger px-4 py-2 text-xs font-bold text-white shadow-dialog" role="status">
      <span>View as {username}.</span>
      <button type="button" onClick={() => void leave()} disabled={isLeaving} className="cursor-pointer font-bold underline underline-offset-2 hover:opacity-80 disabled:opacity-60">Thoát</button>
    </div>
  );
}
