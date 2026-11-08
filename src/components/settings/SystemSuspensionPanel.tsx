'use client';

import * as React from 'react';
import { Eye, FloppyDisk, LockKey, Prohibit } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { TiptapEditor } from '@/components/ui/TiptapEditor';
import { SystemSuspendedView } from '@/components/system/SystemSuspendedView';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SUSPENSION_MESSAGE_HTML,
  SYSTEM_SUSPENSION_CHANGED_EVENT,
  type SystemSuspensionState,
} from '@/lib/system-suspension';

interface SuspensionForm {
  allowMcp: boolean;
  allowNewsLetter: boolean;
  isSuspended: boolean;
  messageHtml: string;
}

function formOf(state: SystemSuspensionState): SuspensionForm {
  return {
    allowMcp: state.allowMcp,
    allowNewsLetter: state.allowNewsLetter,
    isSuspended: state.isSuspended,
    messageHtml: state.messageHtml || DEFAULT_SUSPENSION_MESSAGE_HTML,
  };
}

function sameForm(a: SuspensionForm, b: SuspensionForm): boolean {
  return a.allowMcp === b.allowMcp && a.allowNewsLetter === b.allowNewsLetter && a.isSuspended === b.isSuspended && a.messageHtml === b.messageHtml;
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

/**
 * Quản trị hệ thống → "Tạm dừng hệ thống" (owner 2026-11-08): switch, message of the full-screen page (the app's WYSIWYG
 * editor — links http / https / mailto, sanitized by the server), exceptions "Bản tin" and "MCP Server". Saving asks for
 * the SUPERADMIN's own password again. Rules: lib/system-suspension.ts.
 */
export function SystemSuspensionPanel() {
  const [saved, setSaved] = React.useState<SystemSuspensionState | null>(null);
  const [form, setForm] = React.useState<SuspensionForm | null>(null);
  const [mcpEnabled, setMcpEnabled] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/system-suspension', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const state = (await response.json()) as SystemSuspensionState;
        if (cancelled) return;
        setSaved(state);
        setForm(formOf(state));
      })
      .catch(() => { if (!cancelled) setLoadError('Không thể tải cấu hình Tạm dừng hệ thống.'); });
    fetch('/api/admin/mcp-settings', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { isEnabled?: boolean } | null) => { if (!cancelled) setMcpEnabled(Boolean(data?.isEnabled)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<SuspensionForm>) => setForm((current) => (current ? { ...current, ...patch } : current));
  const isDirty = Boolean(saved && form && !sameForm(formOf(saved), form));

  const closeConfirm = () => {
    setIsConfirmOpen(false);
    setPassword('');
    setSaveError(null);
  };

  const save = async () => {
    if (!form || !password) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/admin/system-suspension', {
        body: JSON.stringify({ ...form, password }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      const result: { error?: string; signedOutSessions?: number; state?: SystemSuspensionState } = await response.json().catch(() => ({}));
      if (!response.ok || !result.state) {
        setSaveError(result.error ?? 'Không thể lưu cấu hình.');
        return;
      }
      setSaved(result.state);
      setForm(formOf(result.state));
      closeConfirm();
      window.dispatchEvent(new Event(SYSTEM_SUSPENSION_CHANGED_EVENT));
      const signedOut = result.signedOutSessions ?? 0;
      const wasSuspended = saved?.isSuspended ?? false;
      showToast(
        result.state.isSuspended
          ? `${wasSuspended ? 'Đã cập nhật cấu hình Tạm dừng hệ thống.' : 'Đã TẠM DỪNG hệ thống.'}${signedOut > 0 ? ` Đã đăng xuất ${signedOut} phiên đăng nhập của user dưới SUPERADMIN.` : ''}`
          : wasSuspended ? 'Hệ thống đã hoạt động trở lại.' : 'Đã lưu cấu hình Tạm dừng hệ thống.',
        6000,
      );
    } catch {
      setSaveError('Không thể kết nối máy chủ.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) return <Alert variant="error" title="Lỗi">{loadError}</Alert>;
  if (!form || !saved) return <p className="text-sm text-fb-text-secondary">Đang tải...</p>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Prohibit className="h-5 w-5 text-status-danger" weight="bold" />
            <span>Tạm dừng hệ thống</span>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <p className="text-sm text-fb-text-secondary">
            Khi bật, mọi user có role dưới SUPERADMIN bị ngắt truy cập toàn bộ chức năng và chỉ thấy trang thông báo toàn màn hình,
            trừ các ngoại lệ chọn bên dưới. SUPERADMIN vẫn đăng nhập và dùng bình thường. Lúc bắt đầu tạm dừng, mọi phiên đăng nhập
            của user dưới SUPERADMIN bị đăng xuất.
          </p>

          <div className="flex items-center justify-between rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-fb-text-primary">Tạm dừng hệ thống: {form.isSuspended ? 'ON' : 'OFF'}</p>
              <p className="text-xs text-fb-text-secondary">
                {saved.isSuspended
                  ? `Đang tạm dừng${saved.suspendedAt ? ` từ ${formatDateTime(saved.suspendedAt)}` : ''}.`
                  : 'Hệ thống đang hoạt động bình thường.'}
                {isDirty && ' — có thay đổi chưa lưu.'}
              </p>
            </div>
            <button
              aria-checked={form.isSuspended}
              aria-label="Tạm dừng hệ thống"
              className={cn(
                'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none transition-colors',
                form.isSuspended ? 'bg-status-danger' : 'bg-fb-border',
              )}
              onClick={() => update({ isSuspended: !form.isSuspended })}
              role="switch"
              type="button"
            >
              <span className={cn('inline-block size-5 transform rounded-full bg-white shadow transition-transform', form.isSuspended ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </div>

          <TiptapEditor
            id="system-suspension-message"
            label="Nội dung trang thông báo"
            helperText="Gõ hoặc dán địa chỉ web / email để tạo link (http, https, mailto); link mở ở cửa sổ mới. Trang này ai cũng xem được, kể cả khi chưa đăng nhập — không ghi thông tin nội bộ nhạy cảm."
            placeholder="Nhập nội dung thông báo…"
            value={form.messageHtml}
            onChange={(html) => update({ messageHtml: html })}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-fb-text-primary">Ngoại lệ vẫn truy cập được</legend>
            <label className="ui-check">
              <input checked={form.allowNewsLetter} onChange={(event) => update({ allowNewsLetter: event.target.checked })} type="checkbox" />
              Vẫn cho phép truy cập mục Bản tin (user đăng nhập chỉ thấy Bản tin và menu avatar)
            </label>
            <label className="ui-check">
              <input checked={form.allowMcp} onChange={(event) => update({ allowMcp: event.target.checked })} type="checkbox" />
              Cho phép tính năng MCP Server (AI chatbot) — công tắc MCP Server hiện đang {mcpEnabled ? 'ON' : 'OFF'}
            </label>
            <p className="text-xs text-fb-text-secondary">
              Không chọn Bản tin: user dưới SUPERADMIN không đăng nhập được (thông báo &quot;Hệ thống đang tạm dừng!&quot;). Không chọn MCP: chỉ token của SUPERADMIN gọi được MCP Server.
            </p>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" icon={<Eye className="size-4" weight="bold" />} onClick={() => setIsPreviewOpen(true)} type="button">Xem trước</Button>
            <Button variant={form.isSuspended && !saved.isSuspended ? 'danger' : 'primary'} disabled={!isDirty} icon={<FloppyDisk className="size-4" weight="bold" />} onClick={() => setIsConfirmOpen(true)} type="button">
              Lưu
            </Button>
          </div>
        </CardBody>
      </Card>

      <Modal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title="Xem trước trang Tạm dừng hệ thống" icon={Eye} maxWidth="3xl">
        <div className="h-[60dvh] overflow-y-auto rounded-lg border border-fb-border">
          {/* The editor's own output (TipTap schema) in the SUPERADMIN's own browser; the server sanitizes it on save. */}
          <SystemSuspendedView
            allowMcp={form.allowMcp}
            allowNewsLetter={form.allowNewsLetter}
            mcpEnabled={mcpEnabled}
            messageHtml={form.messageHtml || DEFAULT_SUSPENSION_MESSAGE_HTML}
            preview
          />
        </div>
      </Modal>

      <Modal
        isOpen={isConfirmOpen}
        onClose={closeConfirm}
        title="Xác nhận mật khẩu để lưu"
        icon={LockKey}
        maxWidth="sm"
        footer={(
          <>
            <Button variant="outline" onClick={closeConfirm} disabled={isSaving}>Hủy</Button>
            <Button variant="primary" onClick={() => void save()} isLoading={isSaving} disabled={!password}>Xác nhận lưu</Button>
          </>
        )}
      >
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <p className="text-fb-text-secondary">
            {form.isSuspended && !saved.isSuspended
              ? <>Bạn sắp <strong>tạm dừng hệ thống</strong>: mọi user dưới SUPERADMIN bị đăng xuất và ngắt truy cập.</>
              : !form.isSuspended && saved.isSuspended
                ? <>Bạn sắp <strong>mở lại hệ thống</strong> cho mọi user.</>
                : <>Bạn sắp lưu cấu hình Tạm dừng hệ thống.</>}
            {' '}Nhập mật khẩu của chính bạn để tiếp tục.
          </p>
          <Input
            autoComplete="current-password"
            autoFocus
            error={saveError ?? undefined}
            label="Mật khẩu của bạn"
            onChange={(event) => { setPassword(event.target.value); setSaveError(null); }}
            type="password"
            value={password}
          />
        </form>
      </Modal>
    </div>
  );
}
