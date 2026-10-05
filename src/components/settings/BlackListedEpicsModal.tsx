'use client';

import * as React from 'react';
import { CheckCircle, FloppyDisk, ListChecks } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { BLACK_LIST_FORMAT_EXAMPLE, parseBlackListText } from '@/lib/black-listed-epics-format';
import type { BlackListFormatError } from '@/lib/black-listed-epics-format';

export interface BlackListedEpicsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BlackListResponse {
  added?: string[];
  canEdit: boolean;
  count: number;
  error?: string;
  formatErrors?: BlackListFormatError[];
  removed?: string[];
  text: string;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** What the last "Kiểm tra thông tin" / "Lưu thông tin" found. `checkedText` is the text it was
 * computed on — error positions only make sense against that exact text. */
interface CheckResult {
  checkedText: string;
  epicCount: number;
  errors: BlackListFormatError[];
  projectCount: number;
}

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function checkText(text: string): CheckResult {
  const { entries, errors } = parseBlackListText(text);
  return { checkedText: text, epicCount: entries.length, errors, projectCount: new Set(entries.map((entry) => entry.projectKey)).size };
}

/**
 * "Epic ngoại lệ" (black listed Epics) — one line per project, `KEY:EPIC-1,EPIC-2`. Epics declared
 * here leave every Time to Market calculation. The format is checked with the same parser the API
 * uses (black-listed-epics-format.ts), so "Kiểm tra thông tin" and "Lưu thông tin" never disagree.
 */
export function BlackListedEpicsModal({ isOpen, onClose }: BlackListedEpicsModalProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [text, setText] = React.useState('');
  const [savedText, setSavedText] = React.useState('');
  const [canEdit, setCanEdit] = React.useState(false);
  const [meta, setMeta] = React.useState<{ updatedAt: string | null; updatedByName: string | null }>({ updatedAt: null, updatedByName: null });
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CheckResult | null>(null);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const controller = new AbortController();
    const load = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setLoadError(null);
      setSaveError(null);
      setResult(null);
      try {
        const response = await fetch('/api/black-listed-epics', { cache: 'no-store', signal: controller.signal });
        const data = await response.json() as BlackListResponse;
        if (!response.ok) throw new Error(data.error ?? 'Không thể tải danh sách Epic ngoại lệ.');
        setText(data.text);
        setSavedText(data.text);
        setCanEdit(data.canEdit);
        setMeta({ updatedAt: data.updatedAt, updatedByName: data.updatedByName });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách Epic ngoại lệ.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [isOpen]);

  const validate = () => {
    setSaveError(null);
    setResult(checkText(text));
  };

  const save = async () => {
    setSaveError(null);
    const checked = checkText(text);
    setResult(checked);
    if (checked.errors.length > 0) return;
    setSaving(true);
    try {
      const response = await fetch('/api/black-listed-epics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const data = await response.json() as BlackListResponse;
      if (!response.ok) {
        if (data.formatErrors?.length) setResult({ ...checked, errors: data.formatErrors });
        throw new Error(data.error ?? 'Không thể lưu danh sách Epic ngoại lệ.');
      }
      setText(data.text);
      setSavedText(data.text);
      setMeta({ updatedAt: data.updatedAt, updatedByName: data.updatedByName });
      setResult(null);
      const added = data.added?.length ?? 0;
      const removed = data.removed?.length ?? 0;
      showToast(
        added + removed > 0
          ? `Đã lưu Epic ngoại lệ: thêm ${added}, bỏ ${removed} Epic. Số liệu TTM đang được tính lại, vui lòng tải lại màn hình sau ít phút.`
          : 'Đã lưu Epic ngoại lệ — danh sách không thay đổi.',
        7000,
      );
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Không thể lưu danh sách Epic ngoại lệ.');
    } finally {
      setSaving(false);
    }
  };

  /** Selects the characters at fault in the textarea, so the user sees exactly where to fix. */
  const selectError = (error: BlackListFormatError) => {
    const textarea = textareaRef.current;
    if (!textarea || !result || result.checkedText !== text) return;
    const lineStart = text.split('\n').slice(0, error.line - 1).reduce((offset, line) => offset + line.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(lineStart + error.columnStart - 1, lineStart + Math.max(error.columnEnd, error.columnStart));
  };

  const dirty = text !== savedText;
  const stale = result !== null && result.checkedText !== text;
  const checkedLines = result?.checkedText.split(/\r?\n/) ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Epic ngoại lệ (Black listed epics)" maxWidth="xl">
      <div className="flex flex-col gap-3">
        <p className="text-fb-text-secondary">
          Các Epic khai báo tại đây được đánh dấu <strong>TTM Black listed = true</strong> và bị loại khỏi phạm vi tính toán Time to Market
          (phễu TTM Dashboard 2 từ L02, TTM-CNTT (QLDA/QA), TTM-E2E). Xoá một Epic khỏi danh sách rồi lưu để đưa Epic đó trở lại.
        </p>

        {loadError && <Alert title="Không thể tải dữ liệu" variant="error">{loadError}</Alert>}

        <textarea
          ref={textareaRef}
          aria-label="Danh sách Epic ngoại lệ"
          className="ui-textarea form-control-compact min-h-[240px] font-mono"
          disabled={loading || Boolean(loadError)}
          onChange={(event) => setText(event.target.value)}
          placeholder={BLACK_LIST_FORMAT_EXAMPLE}
          readOnly={!canEdit}
          spellCheck={false}
          value={loading ? 'Đang tải…' : text}
          wrap="off"
        />

        {saveError && <Alert title="Chưa lưu" variant="error">{saveError}</Alert>}

        {result && result.errors.length === 0 && (
          <Alert title="Định dạng hợp lệ" variant="success">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="size-4 shrink-0" weight="fill" aria-hidden="true" />
              {result.epicCount} Epic thuộc {result.projectCount} project.{stale ? ' (Nội dung đã thay đổi sau lần kiểm tra này.)' : ''}
            </span>
          </Alert>
        )}

        {result && result.errors.length > 0 && (
          <Alert title={`Phát hiện ${result.errors.length} lỗi định dạng`} variant="error">
            {stale && <p className="mb-2 font-semibold">Nội dung đã thay đổi sau lần kiểm tra này — bấm “Kiểm tra thông tin” để kiểm tra lại.</p>}
            <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
              {result.errors.map((error) => {
                const line = checkedLines[error.line - 1] ?? '';
                return (
                  <li key={`${error.line}:${error.columnStart}:${error.message}`}>
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-md px-1.5 py-1 text-left outline-none hover:bg-black/5 disabled:cursor-default disabled:hover:bg-transparent"
                      disabled={stale}
                      onClick={() => selectError(error)}
                      title={stale ? undefined : 'Bấm để bôi đen đúng các ký tự lỗi trong ô nhập'}
                    >
                      <span className="font-semibold">
                        Dòng {error.line}, ký tự {error.columnStart === error.columnEnd ? error.columnStart : `${error.columnStart}–${error.columnEnd}`}:
                      </span>{' '}
                      {error.message}
                      <code className="mt-1 block overflow-x-auto whitespace-pre rounded bg-fb-surface px-2 py-1 font-mono text-xs text-fb-text-primary">
                        {line.slice(0, error.columnStart - 1)}
                        <mark className="rounded-sm bg-status-danger px-0.5 text-white">{error.excerpt || '␣'}</mark>
                        {line.slice(error.columnEnd)}
                      </code>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {!canEdit && !loading && !loadError && <span className="mr-auto text-xs font-semibold text-fb-text-secondary">Bạn chỉ có quyền xem danh sách này.</span>}
          <Button icon={<ListChecks className="size-4" weight="bold" />} disabled={loading || Boolean(loadError)} onClick={validate} variant="outline">Kiểm tra thông tin</Button>
          <Button icon={<FloppyDisk className="size-4" weight="bold" />} disabled={!canEdit || loading || Boolean(loadError) || !dirty} isLoading={saving} onClick={() => void save()}>Lưu thông tin</Button>
        </div>

        <div className="text-xs leading-relaxed text-fb-text-secondary">
          <p>
            <strong>Hướng dẫn:</strong> mỗi project khai báo trên 1 dòng — <strong>Project Key</strong> ở đầu dòng (chỉ gồm chữ và số, không có ký tự “-”),
            tiếp theo là dấu “:”, sau đó là danh sách Epic key của project đó, cách nhau bởi dấu “,”. Epic key có dạng <code>PROJECT-số</code>.
            Thông tin chỉ được lưu khi toàn bộ nội dung đúng định dạng.
          </p>
          <p className="mt-1 font-semibold">Ví dụ:</p>
          <pre className="mt-1 rounded-md border border-fb-border bg-fb-surface-muted px-3 py-2 font-mono text-fb-text-primary">{BLACK_LIST_FORMAT_EXAMPLE}</pre>
          {meta.updatedAt && (
            <p className="mt-2">Cập nhật gần nhất: {formatDateTime(meta.updatedAt)}{meta.updatedByName ? ` — ${meta.updatedByName}` : ''}.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
