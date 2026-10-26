'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/dialogs';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/components/ui/Toast';
import { MAX_THINNING_DAILY_LIMIT, MIN_THINNING_DAILY_LIMIT } from '@/lib/data-layer-retention';
import type { CleanupPreview, CleanupResult } from '@/lib/db-cleanup-service';

/**
 * Tab "Dọn lịch sử" (Quản trị nguồn dữ liệu, SUPERADMIN) — the safety controls of the thinning of the `issues`
 * history (migration 20261029): the switch (OFF by default), the limit of issue rows one run may delete, the outcome of
 * the last run, a preview of what would go, and a manual run in rounds of that limit. Deleting history is irreversible,
 * so the order on the screen is: back up → preview → switch on / run a round.
 */

interface ThinningSettings {
  dailyLimit: number;
  enabled: boolean;
  lastDeleted: number | null;
  lastRemaining: number | null;
  lastRunAt: string | null;
  lastRunSource: 'DAILY' | 'MANUAL' | null;
  rawImportRetentionDays: number;
  updatedByName: string | null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Lỗi HTTP ${res.status}`);
  return body as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, method };
}

const formatNumber = (value: number): string => new Intl.NumberFormat('vi-VN').format(value);

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function HistoryThinningTab() {
  const [settings, setSettings] = useState<ThinningSettings | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [limitInput, setLimitInput] = useState(0);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [lastRound, setLastRound] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'run' | 'save' | 'toggle' | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await requestJson<ThinningSettings>('/api/data-source/history-thinning');
      setSettings(loaded);
      setLimitInput(loaded.dailyLimit);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không thể tải cấu hình.';
      if (/SUPERADMIN|Chưa đăng nhập/.test(message)) setForbidden(true); else setError(message);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const refreshPreview = useCallback(async (retentionDays: number) => {
    setPreview(await requestJson<CleanupPreview>(`/api/admin/db-cleanup?retentionDays=${retentionDays}`));
  }, []);

  if (forbidden) return <Alert title="Không có quyền" variant="warning">Chỉ SUPERADMIN được xem và cấu hình việc dọn lịch sử dữ liệu.</Alert>;
  if (!settings) return error ? <Alert title="Lỗi" variant="error">{error}</Alert> : <p className="text-fb-text-secondary">Đang tải…</p>;

  const limitChanged = limitInput !== settings.dailyLimit;
  const todaysDeletion = preview ? Math.min(preview.issueVersionCount, settings.dailyLimit) : null;
  const rounds = preview && preview.issueVersionCount > 0 ? Math.ceil(preview.issueVersionCount / settings.dailyLimit) : 0;

  const handlePreview = async () => {
    setBusy('preview');
    setError(null);
    try { await refreshPreview(settings.rawImportRetentionDays); } catch (previewError) { setError(previewError instanceof Error ? previewError.message : 'Không thể xem trước.'); } finally { setBusy(null); }
  };

  const handleSaveLimit = async () => {
    setBusy('save');
    setError(null);
    try {
      const saved = await requestJson<ThinningSettings>('/api/data-source/history-thinning', jsonInit('PATCH', { dailyLimit: limitInput }));
      setSettings(saved);
      setLimitInput(saved.dailyLimit);
      showToast('Đã lưu giới hạn số dòng mỗi lượt dọn.', 4000);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Không thể lưu.'); } finally { setBusy(null); }
  };

  const handleToggle = async () => {
    const turningOn = !settings.enabled;
    if (turningOn && !(await confirmDialog({
      title: 'Bật dọn lịch sử tự động',
      description: `Từ lượt tạo cache đầu ngày kế tiếp, mỗi ngày hệ thống sẽ xóa vĩnh viễn tối đa ${formatNumber(settings.dailyLimit)} dòng issues cũ (ngoài 30 ngày import gần nhất và các mốc tuần) cho tới khi hết. Thao tác này KHÔNG hoàn tác được.\n\nBạn đã sao lưu CSDL và đã bấm "Xem trước" để kiểm tra số dòng sẽ bị xóa chưa?`,
      confirmLabel: 'Bật dọn tự động',
    }))) return;
    setBusy('toggle');
    setError(null);
    try {
      setSettings(await requestJson<ThinningSettings>('/api/data-source/history-thinning', jsonInit('PATCH', { enabled: turningOn })));
      showToast(turningOn ? 'Đã BẬT dọn lịch sử tự động.' : 'Đã TẮT dọn lịch sử tự động — hệ thống không xóa gì nữa.', 5000);
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : 'Không thể đổi trạng thái.'); } finally { setBusy(null); }
  };

  const handleRunRound = async () => {
    if (!preview) return;
    const thisRound = Math.min(preview.issueVersionCount, settings.dailyLimit);
    if (!(await confirmDialog({
      title: 'Dọn một lượt',
      description: `Xóa vĩnh viễn ${formatNumber(thisRound)} / ${formatNumber(preview.issueVersionCount)} phiên bản issues cũ (lượt này tối đa ${formatNumber(settings.dailyLimit)} dòng). Phiên bản mới nhất của mỗi issue và dữ liệu 30 ngày import gần nhất được giữ nguyên.\n\nBạn đã sao lưu CSDL chưa?`,
      confirmLabel: 'Xóa vĩnh viễn',
    }))) return;
    setBusy('run');
    setError(null);
    try {
      const result = await requestJson<CleanupResult>('/api/admin/db-cleanup', jsonInit('POST', { limit: settings.dailyLimit, retentionDays: settings.rawImportRetentionDays }));
      setLastRound(result);
      showToast(`Đã xóa ${formatNumber(result.issueVersionsDeleted)} dòng issues, còn ${formatNumber(result.issueVersionsRemaining)} dòng chờ các lượt sau.`, 7000);
      await Promise.all([load(), refreshPreview(settings.rawImportRetentionDays)]);
    } catch (runError) { setError(runError instanceof Error ? runError.message : 'Không thể dọn dữ liệu.'); } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert title="Xóa lịch sử issues không hoàn tác được" variant="warning">
        Hệ thống giữ đầy đủ mọi phiên bản issues của <strong>30 ngày import gần nhất</strong>; xa hơn chỉ giữ phiên bản đang có hiệu lực vào ngày làm việc cuối mỗi tuần
        (trong {settings.rawImportRetentionDays} ngày) và luôn giữ phiên bản mới nhất của mỗi issue. Lần dọn đầu tiên trên một CSDL chưa từng dọn có thể xóa hàng loạt dòng, nên việc dọn tự động
        <strong> mặc định TẮT</strong>. Thứ tự an toàn: <strong>1) sao lưu CSDL</strong> → <strong>2) Xem trước</strong> → <strong>3) bật dọn tự động</strong> hoặc dọn tay từng lượt.
      </Alert>

      {error && <Alert title="Lỗi" variant="error">{error}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Dọn tự động hằng ngày</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">
              Chạy cùng lượt tạo cache đầu ngày. Khi TẮT, hệ thống vẫn ghi các mốc ngày hàng tuần nhưng không xóa dòng nào.
            </p>
          </div>
          <Badge variant={settings.enabled ? 'danger' : 'success'}>{settings.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</Badge>
        </CardHeader>
        <CardBody className="gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              className="w-[220px]"
              helperText={`Từ ${formatNumber(MIN_THINNING_DAILY_LIMIT)} đến ${formatNumber(MAX_THINNING_DAILY_LIMIT)}`}
              label="Tối đa số dòng xóa mỗi lượt"
              max={MAX_THINNING_DAILY_LIMIT}
              min={MIN_THINNING_DAILY_LIMIT}
              onChange={(event) => setLimitInput(Number(event.target.value))}
              type="number"
              value={limitInput}
            />
            <Button disabled={!limitChanged} isLoading={busy === 'save'} onClick={handleSaveLimit} variant="outline">Lưu giới hạn</Button>
          </div>
          <p className="text-xs text-fb-text-secondary">
            Lượt dọn gần nhất: <strong>{formatDateTime(settings.lastRunAt)}</strong>
            {settings.lastRunSource && <> ({settings.lastRunSource === 'DAILY' ? 'tự động hằng ngày' : 'dọn tay'})</>}
            {settings.lastRunAt && <> — đã xóa <strong>{formatNumber(settings.lastDeleted ?? 0)}</strong> dòng, còn <strong>{formatNumber(settings.lastRemaining ?? 0)}</strong> dòng chờ các lượt sau</>}
            {!settings.lastRunAt && ' — chưa có lượt nào'}
            {settings.updatedByName && <>. Cấu hình lưu bởi {settings.updatedByName}.</>}
          </p>
        </CardBody>
        <CardFooter>
          <Button isLoading={busy === 'toggle'} onClick={handleToggle} variant={settings.enabled ? 'outline' : 'danger'}>
            {settings.enabled ? 'Tắt dọn tự động' : 'Bật dọn tự động…'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Xem trước &amp; dọn tay</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">
              Xem trước chỉ đếm, không xóa gì. Dọn tay xóa từng lượt tối đa {formatNumber(settings.dailyLimit)} dòng (cùng giới hạn trên) — bấm lại cho tới khi hết.
              Muốn xóa hết trong một lần: tab &quot;Import &amp; Dọn dữ liệu&quot; ở màn Sao lưu / Phục hồi dữ liệu.
            </p>
          </div>
        </CardHeader>
        <CardBody className="gap-3">
          <div><Button isLoading={busy === 'preview'} onClick={handlePreview} variant="outline">Xem trước</Button></div>
          {preview && (
            <div className="rounded-md border border-fb-border bg-fb-surface-muted p-3 text-sm">
              <p>
                Sẽ xóa <strong>{formatNumber(preview.issueVersionCount)}</strong> / {formatNumber(preview.totalRows)} dòng issues
                ({formatNumber(preview.issueVersionsBeyondRetention)} cũ hơn {preview.cutoffDate}, {formatNumber(preview.issueVersionsInSparseZone)} nằm giữa các mốc tuần)
                và <strong>{formatNumber(preview.emptyBatchCount)}</strong> đợt import không còn dòng nào.
              </p>
              <p className="mt-1 text-xs text-fb-text-secondary">
                Giữ lại: {formatNumber(preview.keptDense)} dòng của các ngày từ {preview.denseStart ?? '—'} trở đi, {formatNumber(preview.keptBridging)} dòng đang có hiệu lực tại các mốc tuần
                và {formatNumber(preview.keptNewestOld)} phiên bản mới nhất của issue lâu không đổi.
              </p>
              {preview.issueVersionCount > 0 && (
                <p className="mt-2">
                  Với giới hạn hiện tại: lượt kế tiếp xóa <strong>{formatNumber(todaysDeletion ?? 0)}</strong> dòng; cần khoảng <strong>{formatNumber(rounds)}</strong> lượt để dọn hết.
                </p>
              )}
              {preview.issueVersionCount === 0 && <p className="mt-2">Không có gì để dọn.</p>}
            </div>
          )}
          {lastRound && <p className="text-xs text-fb-text-secondary">Lượt dọn tay vừa rồi: xóa {formatNumber(lastRound.issueVersionsDeleted)} dòng issues và {formatNumber(lastRound.batchesDeleted)} đợt import trống; còn {formatNumber(lastRound.issueVersionsRemaining)} dòng chờ.</p>}
        </CardBody>
        <CardFooter>
          <Button disabled={!preview || preview.issueVersionCount === 0} isLoading={busy === 'run'} onClick={handleRunRound} variant="danger">
            {preview && preview.issueVersionCount > 0 ? `Dọn một lượt (${formatNumber(todaysDeletion ?? 0)} dòng)` : 'Dọn một lượt'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
