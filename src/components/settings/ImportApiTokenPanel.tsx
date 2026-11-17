'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Check, Copy, Eye, EyeSlash, FloppyDisk, Key, Trash, UploadSimple } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/dialogs';
import { showToast } from '@/components/ui/Toast';

/**
 * Quản trị hệ thống → "Token import tự động": the Bearer token the Jira crawl tool sends to
 * POST /api/data-source/import/auto. Stored in the database (import_api_settings) instead of the IMPORT_API_TOKEN
 * environment variable (2026-11-13).
 */

interface ImportApiTokenSettings {
  token: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

const MIN_LENGTH = 16;

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function maskToken(token: string): string {
  return token.length > 12 ? `${token.slice(0, 8)}••••••••${token.slice(-4)}` : '••••••••••••••••';
}

export function ImportApiTokenPanel() {
  const [settings, setSettings] = useState<ImportApiTokenSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const [isDraftVisible, setIsDraftVisible] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/import-api-token', { cache: 'no-store' });
      const result = await res.json();
      if (res.ok) {
        setSettings(result);
        setError(null);
      } else {
        setError(result.error || 'Không thể tải token import tự động.');
      }
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchSettings);
  }, []);

  const save = async (body: { generate: true } | { token: string | null }, successText: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/import-api-token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Không thể lưu token import tự động.');
        return;
      }
      setSettings(result);
      setDraft('');
      setIsTokenVisible('generate' in body);
      showToast(successText, 5000);
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasToken = !!settings?.token;
  const replaceWarning = 'Công cụ crawl đang dùng token cũ sẽ bị từ chối (401) cho tới khi được cập nhật token mới.';

  const handleSaveDraft = async () => {
    if (hasToken && !(await confirmDialog({ title: 'Thay token import', description: `Lưu token vừa nhập thay cho token hiện tại? ${replaceWarning}`, confirmLabel: 'Lưu token' }))) return;
    await save({ token: draft }, 'Đã lưu token import tự động.');
  };

  const handleGenerate = async () => {
    if (hasToken && !(await confirmDialog({ title: 'Tạo token mới', description: `Tạo token ngẫu nhiên mới thay cho token hiện tại? ${replaceWarning}`, confirmLabel: 'Tạo token mới' }))) return;
    await save({ generate: true }, 'Đã tạo token mới — sao chép và cấu hình vào công cụ crawl.');
  };

  const handleClear = async () => {
    if (!(await confirmDialog({ title: 'Xoá token import', description: 'Xoá token? API import tự động sẽ ngừng nhận dữ liệu (503) cho tới khi có token mới.', confirmLabel: 'Xoá token' }))) return;
    await save({ token: null }, 'Đã xoá token import tự động.');
  };

  const handleCopy = async () => {
    if (!settings?.token) return;
    try {
      await navigator.clipboard.writeText(settings.token);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (http on an internal host) — the token can still be shown and selected by hand.
      setIsTokenVisible(true);
      showToast('Trình duyệt không cho sao chép tự động — hãy bôi đen token để sao chép.', 5000);
    }
  };

  const draftTrimmed = draft.trim();

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="error" title="Lỗi">
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadSimple className="w-5 h-5 text-fb-blue" weight="bold" />
            <span>Token import tự động</span>
          </CardTitle>
          {settings && (
            <Badge variant={hasToken ? 'success' : 'neutral'}>{hasToken ? 'Đã cấu hình' : 'Chưa cấu hình'}</Badge>
          )}
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Công cụ crawl Jira gửi file CSV tới <code>POST /api/data-source/import/auto</code> kèm header{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>. Ứng dụng chỉ nhận file khi token trùng với token cấu hình ở đây
            (lưu trong CSDL, thay cho biến môi trường <code>IMPORT_API_TOKEN</code> trước đây). Chưa có token thì API trả lỗi 503.
          </p>

          {isLoading && !settings ? (
            <p className="text-sm text-fb-text-secondary">Đang tải...</p>
          ) : settings ? (
            <div className="flex flex-col gap-5">
              <div className="rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-fb-text-primary">Token hiện tại</p>
                {hasToken && settings.token ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all rounded border border-fb-border bg-fb-surface px-2 py-1 font-mono text-xs font-medium text-fb-text-primary">
                      {isTokenVisible ? settings.token : maskToken(settings.token)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTokenVisible((prev) => !prev)}
                      className="rounded p-1 text-fb-text-secondary hover:bg-fb-control hover:text-fb-text-primary"
                      title={isTokenVisible ? 'Ẩn token' : 'Hiển thị token'}
                      aria-label={isTokenVisible ? 'Ẩn token' : 'Hiển thị token'}
                    >
                      {isTokenVisible ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded p-1 text-fb-text-secondary hover:bg-fb-control hover:text-fb-text-primary"
                      title="Sao chép token"
                      aria-label="Sao chép token"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-fb-text-secondary">Chưa có token — import tự động đang bị từ chối.</p>
                )}
                {settings.updatedAt && (
                  <p className="mt-2 text-xs text-fb-text-muted">
                    Cập nhật gần nhất: {formatDateTime(settings.updatedAt)}{settings.updatedByName ? ` — ${settings.updatedByName}` : ''}.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="import-api-token-draft" className="text-xs font-semibold text-fb-text-secondary">
                  {hasToken ? 'Đặt token khác' : 'Đặt token'}
                </label>
                <div className="relative flex items-center">
                  <input
                    id="import-api-token-draft"
                    type={isDraftVisible ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 w-full rounded-md border border-fb-border bg-fb-surface px-3 pr-10 font-mono text-sm text-fb-text-primary focus:border-fb-blue focus:outline-none"
                    placeholder="Dán token công cụ crawl đang dùng, hoặc bấm Tạo token mới"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setIsDraftVisible((prev) => !prev)}
                    className="absolute right-2 rounded p-1 text-fb-text-secondary hover:bg-fb-control hover:text-fb-text-primary"
                    title={isDraftVisible ? 'Ẩn' : 'Hiển thị'}
                    aria-label={isDraftVisible ? 'Ẩn token đang nhập' : 'Hiển thị token đang nhập'}
                  >
                    {isDraftVisible ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-fb-text-muted">
                  Tối thiểu {MIN_LENGTH} ký tự ASCII, không dấu, không khoảng trắng. Muốn công cụ crawl chạy tiếp không cần sửa cấu hình,
                  hãy dán đúng token nó đang gửi (giá trị <code>IMPORT_API_TOKEN</code> cũ).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<FloppyDisk className="w-4 h-4" weight="bold" />}
                  onClick={handleSaveDraft}
                  disabled={isSaving || draftTrimmed.length < MIN_LENGTH}
                >
                  Lưu token
                </Button>
                <Button size="sm" variant="secondary" icon={<ArrowsClockwise className="w-4 h-4" weight="bold" />} onClick={handleGenerate} disabled={isSaving}>
                  Tạo token mới
                </Button>
                {hasToken && (
                  <Button size="sm" variant="danger" icon={<Trash className="w-4 h-4" weight="bold" />} onClick={handleClear} disabled={isSaving}>
                    Xoá token
                  </Button>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-fb-border px-4 py-3 text-xs text-fb-text-secondary">
                <Key className="mt-0.5 size-4 shrink-0 text-fb-blue" weight="bold" aria-hidden="true" />
                <span>
                  Cấu hình phía công cụ crawl: <code>import_api.token</code> = token ở trên. Đổi token có hiệu lực
                  ngay trên máy chủ này và trong khoảng 10 giây với các máy chủ khác cùng CSDL.
                </span>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
