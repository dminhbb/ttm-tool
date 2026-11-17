'use client';

import * as React from 'react';
import { ChatCircleText, Eye, FloppyDisk } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { FloatMessagePreview } from '@/components/layout/FloatMessage';
import { cn } from '@/lib/utils';
import {
  FLOAT_MESSAGE_MAX_LENGTH,
  FLOAT_MESSAGE_MAX_SECONDS,
  FLOAT_MESSAGE_POSITION_LABELS,
  FLOAT_MESSAGE_POSITIONS,
  type FloatMessagePosition,
  type FloatMessageSettings,
} from '@/lib/float-message';

interface FloatMessageForm {
  alwaysShown: boolean;
  dismissible: boolean;
  endDate: string;
  isActive: boolean;
  messageText: string;
  position: FloatMessagePosition;
  /** Kept as typed (string) so the field can be cleared while editing; checked on save. */
  seconds: string;
  startDate: string;
}

const DEFAULT_SECONDS = '10';

function formOf(settings: FloatMessageSettings): FloatMessageForm {
  return {
    alwaysShown: settings.autoHideSeconds === null,
    dismissible: settings.dismissible,
    endDate: settings.endDate ?? '',
    isActive: settings.isActive,
    messageText: settings.messageText,
    position: settings.position,
    seconds: settings.autoHideSeconds === null ? DEFAULT_SECONDS : String(settings.autoHideSeconds),
    startDate: settings.startDate ?? '',
  };
}

/** The PUT body; the server validates it again (lib/float-message.ts validateFloatMessageInput). */
function payloadOf(form: FloatMessageForm) {
  return {
    autoHideSeconds: form.alwaysShown ? null : Number(form.seconds),
    dismissible: form.dismissible,
    endDate: form.endDate || null,
    isActive: form.isActive,
    messageText: form.messageText,
    position: form.position,
    startDate: form.startDate || null,
  };
}

function sameForm(a: FloatMessageForm, b: FloatMessageForm): boolean {
  return JSON.stringify(payloadOf(a)) === JSON.stringify(payloadOf(b));
}

/** Client-side check of the seconds field, so the preview never runs with a nonsense timer. */
function secondsError(form: FloatMessageForm): string | null {
  if (form.alwaysShown) return null;
  const seconds = Number(form.seconds);
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= FLOAT_MESSAGE_MAX_SECONDS
    ? null
    : `Nhập số nguyên từ 1 đến ${FLOAT_MESSAGE_MAX_SECONDS}.`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

/**
 * Quản trị hệ thống → "Float message" (SUPERADMIN, owner 2026-11-17): text, ON / OFF, display dates, auto-hide seconds
 * or "always shown", close button, corner — with a preview of the unsaved form. Spec:
 * docs/superpowers/specs/2026-11-17-float-message-design.md.
 */
export function FloatMessagePanel() {
  const [saved, setSaved] = React.useState<FloatMessageSettings | null>(null);
  const [form, setForm] = React.useState<FloatMessageForm | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [previewKey, setPreviewKey] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/float-message', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Không thể tải cấu hình Float message.');
        if (cancelled) return;
        setSaved(data as FloatMessageSettings);
        setForm(formOf(data as FloatMessageSettings));
      })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Không thể tải cấu hình Float message.'); });
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<FloatMessageForm>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setSaveError(null);
  };

  const save = async () => {
    if (!form) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/admin/float-message', {
        body: JSON.stringify(payloadOf(form)),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError((result as { error?: string }).error ?? 'Không thể lưu cấu hình Float message.');
        return;
      }
      setSaved(result as FloatMessageSettings);
      setForm(formOf(result as FloatMessageSettings));
      showToast('Đã lưu Float message. User thấy thay đổi ở lần tải trang kế tiếp.', 5000);
    } catch {
      setSaveError('Không thể kết nối máy chủ.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError) return <Alert variant="error" title="Lỗi">{loadError}</Alert>;
  if (!form || !saved) return <p className="text-sm text-fb-text-secondary">Đang tải...</p>;

  const isDirty = !sameForm(formOf(saved), form);
  const timerError = secondsError(form);
  const dateError = form.startDate && form.endDate && form.startDate > form.endDate ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : null;
  const textError = form.isActive && !form.messageText.trim() ? 'Nhập nội dung trước khi bật Float message.' : null;
  const canSave = isDirty && !timerError && !dateError && !textError;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChatCircleText className="h-5 w-5 text-fb-blue" weight="bold" />
            <span>Float message</span>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-fb-text-secondary">
            Hộp thông báo nổi (bo tròn, có icon message) hiện cho mọi user đã đăng nhập, trên mọi màn hình. Ở góc phải phía dưới,
            message hiện sau khi popup thông báo (ví dụ &quot;Bạn có n epic được giao task!&quot;) đã tắt. Nút X chỉ đóng message ở lần xem đó:
            message hiện lại khi user tải lại trang hoặc chuyển sang màn hình khác.
          </p>

          <div className="flex items-center justify-between rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-fb-text-primary">Float message: {form.isActive ? 'ACTIVE' : 'INACTIVE'}</p>
              <p className="text-xs text-fb-text-secondary">
                {/* The migration creates the row (with its own updated_at): only a save by someone counts as configured. */}
                {saved.updatedAt && saved.updatedByName ? `Lưu lần cuối ${formatDateTime(saved.updatedAt)} bởi ${saved.updatedByName}.` : 'Chưa cấu hình.'}
                {isDirty && ' — có thay đổi chưa lưu.'}
              </p>
            </div>
            <button
              aria-checked={form.isActive}
              aria-label="Bật / tắt Float message"
              className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none transition-colors', form.isActive ? 'bg-fb-blue' : 'bg-fb-border')}
              onClick={() => update({ isActive: !form.isActive })}
              role="switch"
              type="button"
            >
              <span className={cn('inline-block size-5 transform rounded-full bg-white shadow transition-transform', form.isActive ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </div>

          <Input
            error={textError ?? undefined}
            helperText={textError ? undefined : `${form.messageText.length}/${FLOAT_MESSAGE_MAX_LENGTH} ký tự.`}
            label="Nội dung"
            maxLength={FLOAT_MESSAGE_MAX_LENGTH}
            onChange={(event) => update({ messageText: event.target.value })}
            placeholder="Ví dụ: Hệ thống bảo trì từ 20:00 tối nay."
            value={form.messageText}
          />

          <div className="flex flex-col gap-1.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Hiển thị từ ngày" onChange={(event) => update({ startDate: event.target.value })} type="date" value={form.startDate} />
              <Input error={dateError ?? undefined} label="Đến ngày" onChange={(event) => update({ endDate: event.target.value })} type="date" value={form.endDate} />
              <Select
                label="Vị trí"
                onChange={(event) => update({ position: event.target.value as FloatMessagePosition })}
                options={FLOAT_MESSAGE_POSITIONS.map((position) => ({ label: FLOAT_MESSAGE_POSITION_LABELS[position], value: position }))}
                value={form.position}
              />
            </div>
            <p className="text-xs text-fb-text-secondary">Để trống ngày = không giới hạn phía đó; tính cả ngày bắt đầu và ngày kết thúc (giờ Việt Nam).</p>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-fb-text-primary">Hiển thị</legend>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-fb-border px-4 py-2.5">
              <label className="ui-check">
                <input checked={form.alwaysShown} name="float-message-timer" onChange={() => update({ alwaysShown: true })} type="radio" />
                Luôn hiển thị
              </label>
              <div className="flex items-center gap-2">
                <label className="ui-check shrink-0">
                  <input checked={!form.alwaysShown} name="float-message-timer" onChange={() => update({ alwaysShown: false })} type="radio" />
                  Tự tắt sau
                </label>
                <input
                  aria-label="Số giây tự tắt"
                  className={cn('ui-input form-control-compact', timerError ? 'border-status-danger' : '')}
                  // .ui-input is width: 100% in globals.css — a fixed width keeps "Tự tắt sau [N] giây" on one line.
                  style={{ width: '5rem' }}
                  disabled={form.alwaysShown}
                  max={FLOAT_MESSAGE_MAX_SECONDS}
                  min={1}
                  onChange={(event) => update({ seconds: event.target.value })}
                  type="number"
                  value={form.seconds}
                />
                <span className="text-sm text-fb-text-secondary">giây</span>
              </div>
              <span className="hidden h-5 w-px bg-fb-border sm:block" aria-hidden="true" />
              <label className="ui-check">
                <input checked={form.dismissible} onChange={(event) => update({ dismissible: event.target.checked })} type="checkbox" />
                Có nút X để tắt
              </label>
            </div>
            {timerError && <p className="text-xs text-status-danger">{timerError}</p>}
          </fieldset>

          {saveError && <Alert variant="error" title="Không lưu được">{saveError}</Alert>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={previewKey === null && Boolean(timerError)}
              icon={<Eye className="size-4" weight="bold" />}
              onClick={() => setPreviewKey((current) => (current === null ? Date.now() : null))}
              type="button"
            >
              {previewKey === null ? 'Xem trước' : 'Tắt xem trước'}
            </Button>
            <Button variant="primary" disabled={!canSave} icon={<FloppyDisk className="size-4" weight="bold" />} isLoading={isSaving} onClick={() => void save()} type="button">
              Lưu
            </Button>
          </div>
        </CardBody>
      </Card>

      {previewKey !== null && (
        <FloatMessagePreview
          autoHideSeconds={form.alwaysShown ? null : Number(form.seconds)}
          // Exactly as users will see it; "Tắt xem trước" closes it when it has no X and never hides by itself.
          dismissible={form.dismissible}
          key={previewKey}
          onDone={() => setPreviewKey(null)}
          position={form.position}
          text={form.messageText.trim()}
        />
      )}
    </div>
  );
}
