'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';

interface AggregatedDataLayer {
  batchFileName: string | null;
  batchId: number | null;
  batchStatus: string | null;
  epicAlertHistoryCount: number;
  epicTtmSnapshotCount: number;
  issueDailySnapshotCount: number;
  layerDate: string;
  rawDataAvailable: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export function AggregatedDataLayersPanel() {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [layers, setLayers] = useState<AggregatedDataLayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [pendingLayerDate, setPendingLayerDate] = useState<string | null>(null);

  const fetchLayers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/data-source/aggregated-history');
      if (res.status === 401 || res.status === 403) {
        setCanManage(false);
        return;
      }
      setCanManage(true);
      if (res.ok) {
        setLayers(await res.json());
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Không thể tải danh sách lớp dữ liệu tổng hợp.', type: 'error' });
      }
    } catch {
      setCanManage(true);
      setMessage({ text: 'Không thể kết nối API dữ liệu tổng hợp.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup.
    void Promise.resolve().then(fetchLayers);
  }, []);

  const handleDelete = async (layerDate: string) => {
    if (!confirm(`Xóa toàn bộ dữ liệu tổng hợp (Epic TTM Snapshot, Issue Daily Snapshot, Alert History) của lớp dữ liệu ngày ${formatDate(layerDate)}? Dữ liệu import gốc không bị ảnh hưởng.`)) {
      return;
    }
    setPendingLayerDate(layerDate);
    setMessage(null);
    try {
      const res = await fetch(`/api/data-source/aggregated-history?layerDate=${encodeURIComponent(layerDate)}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ text: `Đã xóa dữ liệu tổng hợp của lớp ${formatDate(layerDate)}.`, type: 'success' });
        await fetchLayers();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Xóa thất bại.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Không thể kết nối API xóa dữ liệu tổng hợp.', type: 'error' });
    } finally {
      setPendingLayerDate(null);
    }
  };

  const handleRerun = async (layerDate: string) => {
    setPendingLayerDate(layerDate);
    setMessage(null);
    try {
      const res = await fetch('/api/data-source/aggregated-history/rerun', {
        body: JSON.stringify({ layerDate }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (res.ok) {
        setMessage({ text: `Đã chạy lại tổng hợp cho lớp ${formatDate(layerDate)}.`, type: 'success' });
        await fetchLayers();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Chạy lại tổng hợp thất bại.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Không thể kết nối API chạy lại tổng hợp.', type: 'error' });
    } finally {
      setPendingLayerDate(null);
    }
  };

  if (canManage === false) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhật ký lớp dữ liệu tổng hợp (Epic)</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-fb-text-secondary">
          Mỗi lớp dữ liệu tổng hợp (epic_ttm_snapshots, issue_daily_snapshots, epic_alert_history) được tính từ dữ liệu import gốc cùng ngày. Xóa lớp này không ảnh hưởng dữ liệu import gốc; chạy lại chỉ khả dụng khi dữ liệu import gốc của ngày đó còn tồn tại.
        </p>
        {message && <Alert className="mb-3" title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : layers.length === 0 ? (
          <EmptyState title="Chưa có lớp dữ liệu tổng hợp nào" description="Import CSV để hệ thống tự tính toán dữ liệu tổng hợp." />
        ) : (
          <TableContainer>
            <Table className="min-w-[900px]">
              <THead>
                <TR>
                  <TH className="w-[120px]">Lớp dữ liệu</TH>
                  <TH className="w-[140px] text-center">Epic TTM Snapshot</TH>
                  <TH className="w-[140px] text-center">Issue Daily Snapshot</TH>
                  <TH className="w-[130px] text-center">Alert History</TH>
                  <TH className="w-[140px] text-center">Dữ liệu import gốc</TH>
                  <TH className="w-[220px]">Hành động</TH>
                </TR>
              </THead>
              <TBody>
                {layers.map((layer) => (
                  <TR key={layer.layerDate}>
                    <TD className="font-bold text-fb-blue">{formatDate(layer.layerDate)}</TD>
                    <TD className="text-center font-bold">{layer.epicTtmSnapshotCount}</TD>
                    <TD className="text-center font-bold">{layer.issueDailySnapshotCount}</TD>
                    <TD className="text-center font-bold">{layer.epicAlertHistoryCount}</TD>
                    <TD className="text-center">
                      <Badge variant={layer.rawDataAvailable ? 'success' : 'neutral'}>
                        {layer.rawDataAvailable ? 'Còn' : 'Đã dọn'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex justify-center gap-2">
                        <TableAction
                          disabled={!layer.rawDataAvailable || pendingLayerDate === layer.layerDate}
                          icon={<ArrowsClockwise className="w-4 h-4" />}
                          onClick={() => handleRerun(layer.layerDate)}
                          title={layer.rawDataAvailable ? undefined : 'Không còn dữ liệu import gốc để chạy lại'}
                          variant="info"
                        >
                          Chạy lại
                        </TableAction>
                        <TableAction
                          disabled={pendingLayerDate === layer.layerDate}
                          icon={<Trash className="w-4 h-4" />}
                          onClick={() => handleDelete(layer.layerDate)}
                          variant="danger"
                        >
                          Xóa
                        </TableAction>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </CardBody>
    </Card>
  );
}
