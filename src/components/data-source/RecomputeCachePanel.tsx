'use client';

import { useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';

interface RecomputeResult {
  durationMs: number;
  sourceImportBatchId: number | null;
  epicAlertRowCacheCount: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

/**
 * Manually re-triggers the two eager, per-import caches (ttm_index_global_cache, epic_alert_row_
 * cache — normally only refreshed right after a CSV import commits, see import-service.ts) without
 * waiting for a new import. Both caches are unscoped by role — one recompute here serves TTM-Index
 * (PM)/QA-Index (PM) and "Quản trị Epic"/"Epic in PO" for every role at once, not per-role.
 */
export function RecomputeCachePanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RecomputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecompute = async () => {
    if (!confirm('Tổng hợp lại toàn bộ dữ liệu cache (TTM-Index/QA-Index và bảng dữ liệu Quản trị Epic) ngay bây giờ, không cần đợi import mới?')) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/data-source/recompute-cache', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Tổng hợp lại thất bại.');
        return;
      }
      setResult(body);
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tổng hợp lại dữ liệu cache</CardTitle>
      </CardHeader>
      <CardBody className="gap-4">
        <Alert variant="info" title="Khi nào cần dùng">
          TTM-Index/QA-Index và dữ liệu bảng &quot;Quản trị Epic&quot;/&quot;Epic in PO&quot; được tổng hợp sẵn 1 lần sau
          mỗi đợt import, không tính lại mỗi lần người dùng vào màn hình. Dùng nút này khi vừa sửa dữ
          liệu trực tiếp trong DB (không qua import), vừa restore dữ liệu, hoặc nghi ngờ lần tổng hợp
          tự động lúc import trước đó bị lỗi — không cần chờ đợt import kế tiếp.
        </Alert>

        {error && <Alert variant="error" title="Lỗi">{error}</Alert>}

        {result && (
          <Alert variant="success" title="Đã tổng hợp lại xong">
            Mất {formatNumber(result.durationMs)} ms — {formatNumber(result.epicAlertRowCacheCount)} Epic trong bảng dữ liệu, tính theo đợt import #{result.sourceImportBatchId ?? '—'}.
          </Alert>
        )}
      </CardBody>
      <CardFooter>
        <Button variant="primary" isLoading={isRunning} onClick={handleRecompute}>
          <ArrowsClockwise className="mr-1.5 inline size-4" />
          Tổng hợp lại ngay
        </Button>
      </CardFooter>
    </Card>
  );
}
