'use client';

import { useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface PurgePreview {
  batchCount: number;
  epicAlertHistoryCount: number;
  epicMilestoneHistoryCount: number;
  epicTtmSnapshotCount: number;
  importRowCount: number;
  issueCount: number;
  issueDailySnapshotCount: number;
  layerCount: number;
  targetDates: string[];
  totalLayersAvailable: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export function PurgeRecentLayersPanel() {
  const [layerCount, setLayerCount] = useState(1);
  const [preview, setPreview] = useState<PurgePreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handlePreview = async () => {
    setIsPreviewing(true);
    setMessage(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/data-source/purge-recent-layers?layerCount=${layerCount}`);
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không xem trước được.', type: 'error' });
        return;
      }
      setPreview(result);
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePurge = async () => {
    if (!preview || preview.targetDates.length === 0) return;
    if (!confirm(
      `Xóa VĨNH VIỄN toàn bộ dữ liệu RAW, dữ liệu lớp tổng hợp và dữ liệu sau tổng hợp (milestone) của ${preview.targetDates.length} lớp dữ liệu gần nhất `
      + `(${formatDate(preview.targetDates[preview.targetDates.length - 1])} → ${formatDate(preview.targetDates[0])})?\n\n`
      + `Bao gồm: ${formatNumber(preview.batchCount)} đợt import, ${formatNumber(preview.issueCount)} issues, `
      + `${formatNumber(preview.epicTtmSnapshotCount)} Epic TTM Snapshot, ${formatNumber(preview.epicMilestoneHistoryCount)} milestone. Không thể hoàn tác.`
    )) return;

    setIsPurging(true);
    setMessage(null);
    try {
      const res = await fetch('/api/data-source/purge-recent-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerCount: preview.layerCount }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' });
        return;
      }
      setMessage({ text: `Đã xóa toàn bộ dữ liệu của ${result.targetDates.length} lớp dữ liệu.`, type: 'success' });
      setPreview(null);
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xóa N lớp dữ liệu gần nhất</CardTitle>
      </CardHeader>
      <CardBody className="gap-4">
        <Alert variant="warning" title="Thao tác không thể hoàn tác">
          Xóa toàn bộ dữ liệu RAW (đợt import, issues), dữ liệu lớp tổng hợp (Epic TTM Snapshot, Issue Daily Snapshot, Alert History) và dữ liệu sau tổng hợp (Milestone) của các lớp dữ liệu gần nhất — kể cả khi dữ liệu import gốc đã bị dọn trước đó.
        </Alert>

        <Input
          className="max-w-[180px]"
          label="Số lớp dữ liệu gần nhất"
          min={1}
          onChange={(event) => {
            setLayerCount(Math.max(1, Number(event.target.value) || 1));
            setPreview(null);
          }}
          type="number"
          value={layerCount}
        />

        {message && <Alert title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}

        {preview && (
          preview.targetDates.length === 0 ? (
            <Alert variant="info" title="Không có gì để xóa">Hệ thống chưa có lớp dữ liệu nào.</Alert>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-fb-border bg-fb-surface-muted p-3">
              <p className="font-bold text-fb-text-primary">
                <Warning className="mr-1 inline size-4 text-status-warning" weight="fill" />
                Sẽ xóa {preview.targetDates.length}/{preview.totalLayersAvailable} lớp: {formatDate(preview.targetDates[preview.targetDates.length - 1])} → {formatDate(preview.targetDates[0])}
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-fb-text-secondary">
                <li>Đợt import (RAW): <strong>{formatNumber(preview.batchCount)}</strong></li>
                <li>Issues (RAW): <strong>{formatNumber(preview.issueCount)}</strong></li>
                <li>Import rows (RAW): <strong>{formatNumber(preview.importRowCount)}</strong></li>
                <li>Epic TTM Snapshot: <strong>{formatNumber(preview.epicTtmSnapshotCount)}</strong></li>
                <li>Issue Daily Snapshot: <strong>{formatNumber(preview.issueDailySnapshotCount)}</strong></li>
                <li>Alert History: <strong>{formatNumber(preview.epicAlertHistoryCount)}</strong></li>
                <li>Milestone History: <strong>{formatNumber(preview.epicMilestoneHistoryCount)}</strong></li>
              </ul>
            </div>
          )
        )}
      </CardBody>
      <CardFooter>
        <Button variant="outline" isLoading={isPreviewing} onClick={handlePreview}>Xem trước</Button>
        <Button
          variant="danger"
          isLoading={isPurging}
          disabled={!preview || preview.targetDates.length === 0}
          onClick={handlePurge}
        >
          Xóa vĩnh viễn
        </Button>
      </CardFooter>
    </Card>
  );
}
