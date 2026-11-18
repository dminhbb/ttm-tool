'use client';

import * as React from 'react';
import { ChatCircleText, Eye, FloppyDisk, ListNumbers } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { FloatMessagePreview } from '@/components/layout/FloatMessage';
import { cn } from '@/lib/utils';
import {
  buildFloatMessageList,
  DEFAULT_FLOAT_MESSAGE_PRIORITIES,
  FLOAT_MESSAGE_MAX_EDITABLE_RANK,
  FLOAT_MESSAGE_MAX_LENGTH,
  FLOAT_MESSAGE_MAX_URL_LENGTH,
  FLOAT_MESSAGE_MIN_RANK,
  FLOAT_MESSAGE_SYSTEM_CONFIG_RANK,
  normalizeFloatMessageUrl,
  type EditableFloatMessageCode,
  type FloatMessagePriorities,
  FLOAT_MESSAGE_MAX_SECONDS,
  FLOAT_MESSAGE_POSITION_LABELS,
  FLOAT_MESSAGE_POSITIONS,
  notifyFloatMessageChanged,
  type FloatMessagePosition,
  type FloatMessageSettings,
} from '@/lib/float-message';

interface FloatMessageForm {
  alwaysShown: boolean;
  dismissible: boolean;
  endDate: string;
  highlightBorder: boolean;
  isActive: boolean;
  messageText: string;
  openInNewTab: boolean;
  position: FloatMessagePosition;
  /** Kept as typed (string) so the field can be cleared while editing; checked on save. */
  seconds: string;
  startDate: string;
  url: string;
}

/** The admin GET / PUT answer: the settings plus the priorities of the system messages. */
type FloatMessageResponse = FloatMessageSettings & { priorities?: FloatMessagePriorities };

const DEFAULT_SECONDS = '10';

function formOf(settings: FloatMessageSettings): FloatMessageForm {
  return {
    alwaysShown: settings.autoHideSeconds === null,
    dismissible: settings.dismissible,
    endDate: settings.endDate ?? '',
    highlightBorder: settings.highlightBorder,
    isActive: settings.isActive,
    messageText: settings.messageText,
    openInNewTab: settings.openInNewTab,
    position: settings.position,
    seconds: settings.autoHideSeconds === null ? DEFAULT_SECONDS : String(settings.autoHideSeconds),
    startDate: settings.startDate ?? '',
    url: settings.url ?? '',
  };
}

/** The PUT body; the server validates it again (lib/float-message.ts validateFloatMessageInput). */
function payloadOf(form: FloatMessageForm) {
  return {
    autoHideSeconds: form.alwaysShown ? null : Number(form.seconds),
    dismissible: form.dismissible,
    endDate: form.endDate || null,
    highlightBorder: form.highlightBorder,
    isActive: form.isActive,
    messageText: form.messageText,
    openInNewTab: form.url.trim() ? form.openInNewTab : false,
    position: form.position,
    startDate: form.startDate || null,
    url: form.url.trim() || null,
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

/** Client-side check of the URL field (same rule as the server: lib/float-message.ts normalizeFloatMessageUrl). */
function urlError(form: FloatMessageForm): string | null {
  if (!form.url.trim()) return null;
  return normalizeFloatMessageUrl(form.url) ? null : 'Nhập URL hợp lệ: http(s)://... hoặc đường dẫn nội bộ bắt đầu bằng "/".';
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
  const [priorities, setPriorities] = React.useState<FloatMessagePriorities>(DEFAULT_FLOAT_MESSAGE_PRIORITIES);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/float-message', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Không thể tải cấu hình Float message.');
        if (cancelled) return;
        setSaved(data as FloatMessageSettings);
        setForm(formOf(data as FloatMessageSettings));
        if ((data as FloatMessageResponse).priorities) setPriorities((data as FloatMessageResponse).priorities as FloatMessagePriorities);
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
      if ((result as FloatMessageResponse).priorities) setPriorities((result as FloatMessageResponse).priorities as FloatMessagePriorities);
      notifyFloatMessageChanged();
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
  const linkError = urlError(form);
  const canSave = isDirty && !timerError && !dateError && !textError && !linkError;

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

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-fb-text-primary">Liên kết khi bấm vào message</legend>
            <div className="flex flex-col gap-2.5 rounded-lg border border-fb-border px-4 py-3">
              <Input
                error={linkError ?? undefined}
                helperText={linkError ? undefined : 'Tuỳ chọn. Khi có URL, user bấm vào message để mở trang đó.'}
                label="URL"
                maxLength={FLOAT_MESSAGE_MAX_URL_LENGTH}
                onChange={(event) => update({ url: event.target.value })}
                placeholder="https://example.com hoặc /epic-alerts-15"
                value={form.url}
              />
              <label className="ui-check">
                <input checked={form.openInNewTab && Boolean(form.url.trim())} disabled={!form.url.trim()} onChange={(event) => update({ openInNewTab: event.target.checked })} type="checkbox" />
                Mở trong tab mới (bỏ chọn = mở ở tab hiện tại)
              </label>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-fb-text-primary">Khoảng ngày hiển thị</legend>
            <div className="flex flex-col gap-2.5 rounded-lg border border-fb-border px-4 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Hiển thị từ ngày" onChange={(event) => update({ startDate: event.target.value })} type="date" value={form.startDate} />
                <Input error={dateError ?? undefined} label="Đến ngày" onChange={(event) => update({ endDate: event.target.value })} type="date" value={form.endDate} />
              </div>
              <p className="text-xs text-fb-text-secondary">Để trống ngày = không giới hạn phía đó; tính cả ngày bắt đầu và ngày kết thúc (giờ Việt Nam).</p>
            </div>
          </fieldset>

          <div className="sm:max-w-xs">
            <Select
              label="Vị trí"
              onChange={(event) => update({ position: event.target.value as FloatMessagePosition })}
              options={FLOAT_MESSAGE_POSITIONS.map((position) => ({ label: FLOAT_MESSAGE_POSITION_LABELS[position], value: position }))}
              value={form.position}
            />
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
              <label className="ui-check">
                <input checked={form.highlightBorder} onChange={(event) => update({ highlightBorder: event.target.checked })} type="checkbox" />
                Viền nổi bật (màu chủ đạo của theme)
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

      <FloatMessageListCard messageText={saved.messageText} onSaved={setPriorities} priorities={priorities} />

      {previewKey !== null && (
        <FloatMessagePreview
          autoHideSeconds={form.alwaysShown ? null : Number(form.seconds)}
          clickable={Boolean(form.url.trim())}
          // Exactly as users will see it; "Tắt xem trước" closes it when it has no X and never hides by itself.
          dismissible={form.dismissible}
          highlightBorder={form.highlightBorder}
          key={previewKey}
          onDone={() => setPreviewKey(null)}
          position={form.position}
          text={form.messageText.trim()}
        />
      )}
    </div>
  );
}

/**
 * Danh sách các float message đang cấu hình (REQ-20261118-04): thứ tự ưu tiên (1 chữ số, 1 = ưu tiên nhất, sửa được cho
 * FM-001 / FM-002; FM-003 là nội dung cấu hình ở form trên, luôn cuối = 9), mã tự sinh, nội dung. Cùng thứ tự → mã A-Z.
 */
function FloatMessageListCard({ messageText, onSaved, priorities }: {
  messageText: string;
  onSaved: (priorities: FloatMessagePriorities) => void;
  priorities: FloatMessagePriorities;
}) {
  const [drafts, setDrafts] = React.useState<Partial<Record<EditableFloatMessageCode, string>>>({});
  const [savingCode, setSavingCode] = React.useState<EditableFloatMessageCode | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const rows = buildFloatMessageList(messageText, priorities);

  const commit = async (code: EditableFloatMessageCode) => {
    const draft = drafts[code];
    if (draft === undefined) return;
    const rank = Number(draft);
    const clear = () => setDrafts((current) => { const next = { ...current }; delete next[code]; return next; });
    if (draft === String(priorities[code])) { clear(); return; }
    if (!/^\d$/.test(draft) || rank < FLOAT_MESSAGE_MIN_RANK || rank > FLOAT_MESSAGE_MAX_EDITABLE_RANK) {
      setError(`Thứ tự ưu tiên của ${code} phải là một chữ số từ ${FLOAT_MESSAGE_MIN_RANK} đến ${FLOAT_MESSAGE_MAX_EDITABLE_RANK}.`);
      return;
    }
    setSavingCode(code);
    setError(null);
    try {
      const response = await fetch('/api/admin/float-message', {
        body: JSON.stringify({ priorities: { ...priorities, [code]: rank } }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      const result = await response.json().catch(() => ({})) as { error?: string; priorities?: FloatMessagePriorities };
      if (!response.ok || !result.priorities) {
        setError(result.error ?? 'Không thể lưu thứ tự ưu tiên.');
        return;
      }
      onSaved(result.priorities);
      clear();
      notifyFloatMessageChanged();
      showToast(`Đã lưu thứ tự ưu tiên của ${code}.`, 4000);
    } catch {
      setError('Không thể kết nối máy chủ.');
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListNumbers className="h-5 w-5 text-fb-blue" weight="bold" />
          <span>Danh sách float message</span>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-sm text-fb-text-secondary">
          Thứ tự hiển thị trong hàng đợi: 1 là ưu tiên nhất; thứ tự bằng nhau thì xếp theo mã A-Z. Message cấu hình ở form trên (FM-003)
          luôn ở cuối (mức {FLOAT_MESSAGE_SYSTEM_CONFIG_RANK}) và không sửa được.
        </p>
        {error && <Alert variant="error" title="Không lưu được">{error}</Alert>}
        <div className="overflow-x-auto rounded-lg border border-fb-border bg-fb-surface-muted">
          <table className="w-full text-left text-sm">
            <thead className="bg-fb-blue/15 text-xs uppercase text-fb-text-primary">
              <tr>
                <th className="w-32 px-3 py-2 font-semibold">Thứ tự ưu tiên</th>
                <th className="w-32 px-3 py-2 font-semibold">CODE</th>
                <th className="px-3 py-2 font-semibold">Nội dung message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-fb-border odd:bg-fb-surface-muted even:bg-fb-border/30" key={row.code}>
                  <td className="px-3 py-2">
                    {row.editable ? (
                      <input
                        aria-label={`Thứ tự ưu tiên của ${row.code}`}
                        className="ui-input form-control-compact text-center"
                        disabled={savingCode === row.code}
                        inputMode="numeric"
                        maxLength={1}
                        onBlur={() => void commit(row.code as EditableFloatMessageCode)}
                        onChange={(event) => { setError(null); setDrafts((current) => ({ ...current, [row.code]: event.target.value })); }}
                        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                        style={{ width: '3.5rem' }}
                        value={drafts[row.code as EditableFloatMessageCode] ?? String(row.priority)}
                      />
                    ) : (
                      <span className="inline-block w-14 text-center font-semibold text-fb-text-secondary" title="Luôn ở mức cuối">{row.priority}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-fb-text-primary">{row.code}</td>
                  <td className="px-3 py-2 text-fb-text-primary">{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
