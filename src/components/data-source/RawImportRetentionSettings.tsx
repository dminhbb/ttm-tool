'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface RetentionResponse {
  rawImportRetentionDays: number;
}

function isRetentionResponse(value: unknown): value is RetentionResponse {
  return typeof value === 'object'
    && value !== null
    && 'rawImportRetentionDays' in value
    && typeof value.rawImportRetentionDays === 'number';
}

export function RawImportRetentionSettings() {
  const [canConfigure, setCanConfigure] = useState<boolean | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let isMounted = true;
    void fetch('/api/data-source/retention')
      .then(async (response) => ({ data: await response.json() as unknown, status: response.status }))
      .then(({ data, status }) => {
        if (!isMounted) return;
        if (status === 401 || status === 403) { setCanConfigure(false); return; }
        if (!isRetentionResponse(data)) {
          setCanConfigure(true);
          setMessage({ text: 'Không thể tải cấu hình thời hạn lưu dữ liệu.', type: 'error' });
          return;
        }
        setRetentionDays(data.rawImportRetentionDays);
        setCanConfigure(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setCanConfigure(true);
        setMessage({ text: 'Không thể kết nối dịch vụ cấu hình lưu trữ.', type: 'error' });
      });
    return () => { isMounted = false; };
  }, []);

  const save = async () => {
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 3650) {
      setMessage({ text: 'Số ngày giữ dữ liệu raw phải là số nguyên từ 7 đến 3650.', type: 'error' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/data-source/retention', {
        body: JSON.stringify({ rawImportRetentionDays: retentionDays }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      const result: unknown = await response.json();
      if (!response.ok || !isRetentionResponse(result)) {
        const error = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'Không thể lưu cấu hình thời hạn lưu dữ liệu.';
        setMessage({ text: error, type: 'error' });
        return;
      }
      setRetentionDays(result.rawImportRetentionDays);
      setMessage({ text: 'Đã lưu cấu hình. Hệ thống tự dọn raw import sau mỗi lần import được lưu.', type: 'success' });
    } catch {
      setMessage({ text: 'Không thể kết nối dịch vụ cấu hình lưu trữ.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (canConfigure === false) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lưu trữ dữ liệu import</CardTitle>
      </CardHeader>
      <CardBody className="gap-4">
        <p className="text-fb-text-secondary">
          Dữ liệu raw gồm batch import, dòng import và issues của batch. Sau thời hạn cấu hình, raw data được tự dọn khi import thành công; bảng tổng hợp Epic, Story và Subtask được giữ vĩnh viễn để phục vụ tra cứu lịch sử.
        </p>
        <Input
          className="max-w-[180px]"
          label="Giữ dữ liệu raw (ngày)"
          max={3650}
          min={7}
          onChange={(event) => setRetentionDays(Number(event.target.value))}
          type="number"
          value={retentionDays}
        />
        {message && <Alert title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}
      </CardBody>
      <CardFooter>
        <Button isLoading={isSaving} onClick={save}>Lưu cấu hình</Button>
      </CardFooter>
    </Card>
  );
}
