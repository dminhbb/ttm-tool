'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudArrowDown, CloudArrowUp, Trash, Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { BackupTableInfo, ImportResult } from '@/lib/db-backup-types';
import type { ImportPreview } from '@/lib/db-backup-service';
import type { CleanupPreview } from '@/lib/db-cleanup-service';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function DatabaseBackupPage() {
  const [tables, setTables] = useState<BackupTableInfo[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [includeSchema, setIncludeSchema] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importPreviewedFileKey, setImportPreviewedFileKey] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTables = async () => {
    setIsLoadingTables(true);
    try {
      const res = await fetch('/api/admin/db-backup/tables');
      if (res.ok) setTables(await res.json());
    } finally {
      setIsLoadingTables(false);
    }
  };

  useEffect(() => {
    // Defer the request so effect setup itself does not synchronously schedule state updates.
    void Promise.resolve().then(fetchTables);
  }, []);

  const openExportModal = () => {
    setSelectedTables(new Set(tables.map((table) => table.tableName)));
    setIncludeSchema(false);
    setShowExportModal(true);
  };

  const toggleTable = (tableName: string, checked: boolean) => {
    setSelectedTables((current) => {
      const next = new Set(current);
      if (checked) next.add(tableName);
      else next.delete(tableName);
      return next;
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: [...selectedTables], includeSchema }),
      });
      if (!res.ok) {
        const result = await res.json();
        setMessage({ text: result.error || 'Export thất bại.', type: 'error' });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const fileNameMatch = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameMatch ? fileNameMatch[1] : 'export.sql';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ text: `Đã export ${selectedTables.size} bảng thành công.`, type: 'success' });
      setShowExportModal(false);
    } catch {
      setMessage({ text: 'Không thể kết nối API export.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportFile(event.target.files?.[0] ?? null);
    setImportPreview(null);
    setImportPreviewedFileKey(null);
    setImportResult(null);
  };

  const fileKeyOf = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const handlePreview = async () => {
    if (!importFile) return;
    setIsPreviewing(true);
    setMessage(null);
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const res = await fetch('/api/admin/db-backup/import?dryRun=1', { method: 'POST', body: data });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không đọc được file import.', type: 'error' });
        setImportPreview(null);
        setImportPreviewedFileKey(null);
        return;
      }
      setImportPreview(result);
      setImportPreviewedFileKey(fileKeyOf(importFile));
    } catch {
      setMessage({ text: 'Không thể kết nối API import.', type: 'error' });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setMessage(null);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const res = await fetch('/api/admin/db-backup/import', { method: 'POST', body: data });
      const result: ImportResult = await res.json();
      setImportResult(result);
      if (result.ok) {
        setMessage({ text: 'Import hoàn tất.', type: 'success' });
        setImportFile(null);
        setImportPreview(null);
        setImportPreviewedFileKey(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        void fetchTables();
      } else {
        setMessage({ text: 'Import thất bại, toàn bộ thay đổi đã được rollback.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Không thể kết nối API import.', type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const isPreviewCurrent = importFile && importPreviewedFileKey === fileKeyOf(importFile);

  const [retentionDays, setRetentionDays] = useState(30);
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null);
  const [isPreviewingCleanup, setIsPreviewingCleanup] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  const handleCleanupPreview = async () => {
    setIsPreviewingCleanup(true);
    setMessage(null);
    setCleanupPreview(null);
    try {
      const res = await fetch(`/api/admin/db-cleanup?retentionDays=${retentionDays}`);
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không xem trước được.', type: 'error' });
        return;
      }
      setCleanupPreview(result);
    } catch {
      setMessage({ text: 'Không thể kết nối API dọn dữ liệu.', type: 'error' });
    } finally {
      setIsPreviewingCleanup(false);
    }
  };

  const handleCleanupExecute = async () => {
    if (!cleanupPreview) return;
    if (!confirm(`Xóa vĩnh viễn ${formatNumber(cleanupPreview.batchCount)} đợt import cũ (và toàn bộ issues/import_rows liên quan)? Epic TTM Snapshot sẽ được giữ nguyên.`)) return;
    setIsCleaning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Dọn dữ liệu thất bại.', type: 'error' });
        return;
      }
      setMessage({ text: `Đã xóa ${formatNumber(result.batchesDeleted)} đợt import cũ hơn ${retentionDays} ngày.`, type: 'success' });
      setCleanupPreview(null);
      void fetchTables();
    } catch {
      setMessage({ text: 'Không thể kết nối API dọn dữ liệu.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Alert variant="warning" title="Lưu ý bảo mật">
        File export chứa dữ liệu nghiệp vụ đầy đủ, bao gồm mật khẩu đã băm (password hash) của user. Chỉ chia sẻ/lưu trữ file export ở nơi an toàn.
        Import là thao tác ghi vào cơ sở dữ liệu thật — hãy export một bản sao lưu trước khi import nếu không chắc chắn.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Export dữ liệu ra file SQL</CardTitle>
          <Button icon={<CloudArrowDown className="size-4" weight="bold" />} onClick={openExportModal} size="sm">
            Chọn bảng để export
          </Button>
        </CardHeader>
        <CardBody>
          {isLoadingTables ? <TableSkeleton rows={4} /> : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>Bảng</TH>
                    <TH>Tên bảng (DB)</TH>
                    <TH className="text-center">Số dòng</TH>
                  </TR>
                </THead>
                <TBody>
                  {tables.map((table) => (
                    <TR key={table.tableName}>
                      <TD className="font-medium">{table.label}</TD>
                      <TD className="font-mono text-fb-text-secondary">{table.tableName}</TD>
                      <TD className="text-center font-bold">{formatNumber(table.approxRowCount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import dữ liệu từ file SQL</CardTitle>
        </CardHeader>
        <CardBody className="gap-4">
          <p className="text-fb-text-secondary">
            Chỉ chấp nhận file <code>.sql</code> được tạo bởi chính chức năng Export ở trên. Dòng dữ liệu trùng khóa chính (đã tồn tại trong DB) sẽ tự động được <strong>bỏ qua</strong>, không ghi đè.
          </p>
          <input ref={fileInputRef} type="file" accept=".sql,application/sql,text/plain" onChange={onFileChange} className="text-fb-text-primary" />

          {importPreview && isPreviewCurrent && (
            <div className="flex flex-col gap-3 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
              <p className="font-bold text-fb-text-primary">Xem trước nội dung file:</p>
              {importPreview.createsSchemaFor.length > 0 && (
                <p className="text-fb-text-secondary">
                  File có kèm cấu trúc bảng (CREATE TABLE IF NOT EXISTS) cho: {importPreview.createsSchemaFor.join(', ')}. An toàn với DB đã có bảng (sẽ được bỏ qua).
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {importPreview.tableCounts.map((item) => (
                  <li key={item.tableName} className="flex items-center justify-between text-fb-text-secondary">
                    <span className="font-mono">{item.tableName}</span>
                    <Badge variant="info">{formatNumber(item.insertCount)} dòng</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importResult && (
            <div className="flex flex-col gap-2 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
              <p className="font-bold text-fb-text-primary">Kết quả import:</p>
              {importResult.tables.map((table) => (
                <div key={table.tableName} className="flex items-center justify-between text-fb-text-secondary">
                  <span className="font-mono">{table.tableName}</span>
                  {table.error ? (
                    <span className="flex items-center gap-1 text-status-danger"><Warning className="size-4" weight="bold" />{table.error}</span>
                  ) : (
                    <span>
                      <Badge variant="success">{formatNumber(table.inserted)} thêm mới</Badge>{' '}
                      <Badge variant="neutral">{formatNumber(table.skippedDuplicates)} bỏ qua (trùng)</Badge>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
        <CardFooter>
          <Button variant="outline" disabled={!importFile || isPreviewing} isLoading={isPreviewing} onClick={handlePreview}>
            Xem trước
          </Button>
          <Button
            icon={<CloudArrowUp className="size-4" weight="bold" />}
            disabled={!isPreviewCurrent || isImporting}
            isLoading={isImporting}
            onClick={handleImport}
          >
            Xác nhận import
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dọn dữ liệu import cũ</CardTitle>
        </CardHeader>
        <CardBody className="gap-4">
          <p className="text-fb-text-secondary">
            Xóa các đợt import cũ hơn số ngày chọn bên dưới (kéo theo <code>issues</code> và <code>import_rows</code> của đợt đó, do quan hệ cascade).
            Đợt import <strong>mới nhất luôn được giữ lại</strong> dù có cũ hơn ngưỡng, để dữ liệu hiện tại không bao giờ bị ảnh hưởng.
            Lịch sử tóm tắt của Epic (<code>epic_ttm_snapshots</code>) <strong>không bị xóa</strong>.
          </p>
          <div className="flex items-end gap-3">
            <Input
              type="number"
              label="Giữ lại (ngày)"
              min={7}
              max={3650}
              value={retentionDays}
              onChange={(event) => { setRetentionDays(Number(event.target.value)); setCleanupPreview(null); }}
              className="max-w-[140px]"
            />
            <Button variant="outline" isLoading={isPreviewingCleanup} onClick={handleCleanupPreview}>Xem trước</Button>
          </div>

          {cleanupPreview && (
            <div className="flex flex-col gap-2 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
              <p className="text-fb-text-secondary">
                Sẽ xóa <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.batchCount)}</strong> đợt import
                (ước tính <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.issueCount)}</strong> dòng issues,{' '}
                <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.importRowCount)}</strong> dòng import_rows)
                cũ hơn {formatDateTime(cleanupPreview.cutoffDate)}.
              </p>
              {cleanupPreview.latestBatchProtected && (
                <p className="text-fb-text-secondary">
                  Đợt gần nhất được giữ lại: <strong className="text-fb-text-primary">{cleanupPreview.latestBatchProtected.fileName}</strong>{' '}
                  ({formatDateTime(cleanupPreview.latestBatchProtected.aggregatedAt)})
                </p>
              )}
            </div>
          )}
        </CardBody>
        {cleanupPreview && (
          <CardFooter>
            <Button
              variant="danger"
              icon={<Trash className="size-4" weight="bold" />}
              disabled={cleanupPreview.batchCount === 0 || isCleaning}
              isLoading={isCleaning}
              onClick={handleCleanupExecute}
            >
              Xóa {formatNumber(cleanupPreview.batchCount)} đợt import cũ
            </Button>
          </CardFooter>
        )}
      </Card>

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Chọn bảng để export"
        maxWidth="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowExportModal(false)}>Hủy</Button>
            <Button onClick={handleExport} isLoading={isExporting} disabled={selectedTables.size === 0}>
              Export {selectedTables.size} bảng
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={selectedTables.size === tables.length && tables.length > 0}
                onChange={(event) => setSelectedTables(event.target.checked ? new Set(tables.map((table) => table.tableName)) : new Set())}
              />
              Chọn tất cả
            </label>
          </div>

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {tables.map((table) => (
              <li key={table.tableName}>
                <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-fb-surface-muted">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTables.has(table.tableName)}
                      onChange={(event) => toggleTable(table.tableName, event.target.checked)}
                    />
                    {table.label}
                  </span>
                  <span className="text-fb-text-secondary">{formatNumber(table.approxRowCount)} dòng</span>
                </label>
              </li>
            ))}
          </ul>

          <label className="flex items-center gap-2 border-t border-fb-border pt-3 font-semibold">
            <input type="checkbox" checked={includeSchema} onChange={(event) => setIncludeSchema(event.target.checked)} />
            Bao gồm cấu trúc bảng (CREATE TABLE IF NOT EXISTS)
          </label>
          <p className="text-fb-text-secondary">
            Chỉ nên bật khi cần dựng nhanh một database trống mới. Không dùng thay cho các file migration trong <code>db/migrations</code> —
            cấu trúc export chỉ gồm cột và khóa chính, không có khóa ngoại/ràng buộc CHECK. Luôn dùng <code>IF NOT EXISTS</code> nên tuyệt đối
            an toàn khi import vào database đã có sẵn bảng.
          </p>
        </div>
      </Modal>
    </div>
  );
}
