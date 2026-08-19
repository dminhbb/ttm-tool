'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import type { JiraSettings } from '@/lib/jira-settings-types';

const EMPTY: JiraSettings = { apiBaseUrl: '', viewIssueBaseUrl: '' };
const readError = (value: unknown, fallback: string) =>
  typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : fallback;

export function JiraConfigPanel() {
  const [form, setForm] = useState<JiraSettings>(EMPTY);
  const [notice, setNotice] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/jira-settings', { cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể tải cấu hình Jira.'));
      setForm(payload as JiraSettings);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể tải cấu hình Jira.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/jira-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể lưu cấu hình Jira.'));
      setForm(payload as JiraSettings);
      setNotice({ text: 'Đã lưu cấu hình Jira.', type: 'success' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu cấu hình Jira.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert title={notice.type === 'success' ? 'Thành công' : 'Lỗi'} variant={notice.type === 'success' ? 'success' : 'error'}>{notice.text}</Alert>}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cấu hình Jira</CardTitle>
            <p className="mt-1 text-fb-text-secondary">Địa chỉ dùng cho các chức năng tích hợp Jira của ứng dụng (VD: liên kết mở nhanh Epic trên Jira).</p>
          </div>
          <Button isLoading={saving} onClick={() => void save()} size="sm">Lưu cấu hình</Button>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            disabled={loading}
            helperText="Dùng cho các chức năng gọi trực tiếp Jira API trong tương lai."
            label="Địa chỉ Jira API"
            onChange={(event) => setForm((current) => ({ ...current, apiBaseUrl: event.target.value }))}
            placeholder="https://jira.mbbank.com.vn/rest/api/2"
            value={form.apiBaseUrl}
          />
          <Input
            disabled={loading}
            helperText='Ghép trực tiếp với Epic Key để mở Epic trên Jira — nhập kèm dấu "/" ở cuối. VD: "https://jira.mbbank.com.vn/browse/" + "HCM-172837".'
            label="Địa chỉ Jira View Issue"
            onChange={(event) => setForm((current) => ({ ...current, viewIssueBaseUrl: event.target.value }))}
            placeholder="https://jira.mbbank.com.vn/browse/"
            value={form.viewIssueBaseUrl}
          />
        </CardBody>
      </Card>
    </div>
  );
}
