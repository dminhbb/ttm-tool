'use client';

import { useEffect, useState } from 'react';
import { ChartPie } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface DashboardViewSettings {
  leadViewForAllUsers: boolean;
  updatedAt: string | null;
}

/** Quản trị hệ thống → Dashboard: the "Dashboard Lead view cho tất cả user" switch (TTM Dashboard 2). */
export function DashboardViewPanel() {
  const [settings, setSettings] = useState<DashboardViewSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/admin/dashboard-view-settings')
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setSettings(await res.json());
      })
      .catch(() => setError('Không thể tải cấu hình Dashboard.'));
  }, []);

  const handleToggle = async () => {
    if (!settings) return;
    const next = !settings.leadViewForAllUsers;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/dashboard-view-settings', {
        body: JSON.stringify({ leadViewForAllUsers: next }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Không thể cập nhật cấu hình.');
        return;
      }
      setSettings(result);
      showToast(next ? 'Đã bật Dashboard Lead view cho tất cả user.' : 'Đã tắt Dashboard Lead view cho tất cả user.', 5000);
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsSaving(false);
    }
  };

  const enabled = settings?.leadViewForAllUsers ?? false;

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="error" title="Lỗi">{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartPie className="w-5 h-5 text-fb-blue" weight="bold" />
            <span>Dashboard Lead view cho tất cả user</span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Khi bật, mọi user (Admin, PM/SM) mở TTM Dashboard 2 sẽ mặc định thấy màn hình của Lead với số liệu <strong>toàn công ty</strong>,
            và vẫn chuyển được về số liệu theo phạm vi của mình (nút <em>Của tôi</em>). Chỉ con số thống kê được mở rộng: khi bấm vào số liệu để mở
            popup Quản trị Epic, danh sách Epic vẫn theo đúng phân quyền dữ liệu của user đó.
          </p>
          {!settings ? (
            <p className="text-sm text-fb-text-secondary">Đang tải...</p>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-fb-text-primary">Trạng thái tính năng</p>
                <p className="text-xs text-fb-text-secondary">
                  {enabled ? 'Đang bật — user mặc định xem Lead view toàn công ty.' : 'Đang tắt — mỗi user chỉ xem số liệu theo phạm vi của mình.'}
                </p>
              </div>
              <button
                aria-checked={enabled}
                aria-label="Dashboard Lead view cho tất cả user"
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors outline-none disabled:opacity-60',
                  enabled ? 'bg-fb-blue' : 'bg-fb-border',
                )}
                disabled={isSaving}
                onClick={handleToggle}
                role="switch"
                type="button"
              >
                <span className={cn('inline-block size-5 transform rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
              </button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
