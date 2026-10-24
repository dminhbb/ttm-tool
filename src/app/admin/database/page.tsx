'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudArrowDown, CloudArrowUp, Trash, Warning } from '@phosphor-icons/react';
import { confirmDialog } from '@/components/ui/dialogs';
import { Alert } from '@/components/ui/Alert';
import { showToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
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

/** "YYYY-MM-DD" (a data-layer date, always this exact shape from the API) → "dd/mm/yyyy". */
function formatLayerDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

type BackupTab = 'smart' | 'layer' | 'dump' | 'restore_cleanup';

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DatabaseBackupPage() {
  const [activeTab, setActiveTab] = useState<BackupTab>('smart');
  const [tables, setTables] = useState<BackupTableInfo[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [includeSchema, setIncludeSchema] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [layerDates, setLayerDates] = useState<string[]>([]);
  const [smartLayerDate, setSmartLayerDate] = useState(todayIsoDate);
  const [isSmartExporting, setIsSmartExporting] = useState(false);
  const [startLayerDate, setStartLayerDate] = useState('');
  const [endLayerDate, setEndLayerDate] = useState('');
  const [includeRawData, setIncludeRawData] = useState(true);
  const [isExportingLayerRange, setIsExportingLayerRange] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importSelectedTables, setImportSelectedTables] = useState<Set<string>>(new Set());
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

  const fetchLayerDates = async () => {
    try {
      const res = await fetch('/api/admin/db-backup/layer-dates');
      if (!res.ok) return;
      const result: { dates: string[] } = await res.json();
      setLayerDates(result.dates);
      // Default to the most recent single layer — the common case is "export today's data",
      // not the full history; the user widens the range explicitly when they need more.
      if (result.dates.length > 0) {
        setSmartLayerDate(result.dates[0]);
        setStartLayerDate(result.dates[0]);
        setEndLayerDate(result.dates[0]);
      }
    } catch {
      // Non-fatal — the layer-range export form just shows no options; the table-based export below still works.
    }
  };

  useEffect(() => {
    // Defer the request so effect setup itself does not synchronously schedule state updates.
    void Promise.resolve().then(fetchTables);
    void Promise.resolve().then(fetchLayerDates);
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

  const handleSmartExport = async () => {
    if (!smartLayerDate) return;
    setIsSmartExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-backup/export-smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerDate: smartLayerDate }),
      });
      if (!res.ok) {
        const result = await res.json();
        setMessage({ text: result.error || 'Smart export thất bại.', type: 'error' });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const fileNameMatch = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameMatch ? fileNameMatch[1] : `ttm-monitor-smart-export-${smartLayerDate}.sql`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(`Đã tạo file Smart Export lớp bề mặt tính đến ${formatLayerDate(smartLayerDate)} thành công.`, 5000);
      setMessage(null);
    } catch {
      setMessage({ text: 'Không thể kết nối API Smart Export.', type: 'error' });
    } finally {
      setIsSmartExporting(false);
    }
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
      showToast(`Đã export ${selectedTables.size} bảng thành công.`, 5000);
      setMessage(null);
      setShowExportModal(false);
    } catch {
      setMessage({ text: 'Không thể kết nối API export.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleLayerRangeExport = async () => {
    if (!startLayerDate || !endLayerDate) return;
    if (startLayerDate > endLayerDate) {
      setMessage({ text: '"Start Data Layer" phải trước hoặc trùng ngày với "End Data Layer".', type: 'error' });
      return;
    }
    setIsExportingLayerRange(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-backup/export-layer-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: startLayerDate, endDate: endLayerDate, includeRawData }),
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
      showToast(`Đã export dữ liệu từ lớp ${formatLayerDate(startLayerDate)} đến ${formatLayerDate(endLayerDate)} thành công.`, 5000);
      setMessage(null);
    } catch {
      setMessage({ text: 'Không thể kết nối API export.', type: 'error' });
    } finally {
      setIsExportingLayerRange(false);
    }
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportFile(event.target.files?.[0] ?? null);
    setImportPreview(null);
    setImportSelectedTables(new Set());
    setImportPreviewedFileKey(null);
    setImportResult(null);
  };

  const toggleImportTable = (tableName: string, checked: boolean) => {
    setImportSelectedTables((current) => {
      const next = new Set(current);
      if (checked) next.add(tableName);
      else next.delete(tableName);
      return next;
    });
  };

  const fileKeyOf = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const handlePreview = async () => {
    if (!importFile) return;
    setIsPreviewing(true);
    setMessage(null);
    setImportResult(null);
    try {
      // Sent as the raw request body, not multipart/form-data — see the route's own comment for
      // why (Node's built-in FormData parser fails on large files).
      const res = await fetch('/api/admin/db-backup/import?dryRun=1', { method: 'POST', body: importFile });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không đọc được file import.', type: 'error' });
        setImportPreview(null);
        setImportPreviewedFileKey(null);
        return;
      }
      setImportPreview(result);
      setImportSelectedTables(new Set((result as ImportPreview).tableCounts.map((item) => item.tableName)));
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
      const tablesParam = encodeURIComponent([...importSelectedTables].join(','));
      // Import thử trước: toàn bộ thay đổi được rollback, chỉ để biết import SẼ XÓA bao nhiêu dòng ở mỗi bảng.
      const simulation: ImportResult = await (await fetch(`/api/admin/db-backup/import?tables=${tablesParam}&simulate=1`, { method: 'POST', body: importFile })).json();
      if (!simulation.ok) {
        setImportResult(simulation);
        setMessage({ text: 'Import thử không thành công — chưa có gì bị thay đổi.', type: 'error' });
        return;
      }
      const deletions = simulation.tables.filter((table) => table.deleted > 0);
      if (deletions.length > 0) {
        const lines = deletions.map((table) => `• ${table.tableName}: ${formatNumber(table.deleted)} dòng`).join('\n');
        const confirmed = await confirmDialog({
          title: 'Import sẽ xóa dữ liệu trong CSDL',
          description: `Các dòng sau có trong CSDL nhưng không có trong file (hoặc trùng khóa với dòng của file) và sẽ bị xóa — không hoàn tác được:\n\n${lines}\n\nTài khoản của bạn được giữ nguyên.`,
          confirmLabel: 'Vẫn import',
        });
        if (!confirmed) return;
      }
      const res = await fetch(`/api/admin/db-backup/import?tables=${tablesParam}`, { method: 'POST', body: importFile });
      const result: ImportResult = await res.json();
      setImportResult(result);
      if (result.ok) {
        showToast('Import hoàn tất. Hệ thống đang cập nhật lại cache.', 5000);
        setMessage(null);
        setImportFile(null);
        setImportPreview(null);
        setImportSelectedTables(new Set());
        setImportPreviewedFileKey(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        void fetchTables();
        void fetchLayerDates();
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
    if (!(await confirmDialog({ title: 'Xóa đợt import cũ', description: `Xóa vĩnh viễn ${formatNumber(cleanupPreview.batchCount)} đợt import cũ (và toàn bộ issues liên quan)? Dòng thời gian cảnh báo sẽ được giữ nguyên.`, confirmLabel: 'Xóa vĩnh viễn' }))) return;
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
      showToast(`Đã xóa ${formatNumber(result.batchesDeleted)} đợt import cũ hơn ${retentionDays} ngày.`, 5000);
      setMessage(null);
      setCleanupPreview(null);
      void fetchTables();
      void fetchLayerDates();
    } catch {
      setMessage({ text: 'Không thể kết nối API dọn dữ liệu.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/admin/database" />
      <nav className="ui-tabs" aria-label="Sao lưu và phục hồi dữ liệu">
        <Button onClick={() => setActiveTab('smart')} variant={activeTab === 'smart' ? 'primary' : 'outline'}>
          Export dữ liệu thông minh
        </Button>
        <Button onClick={() => setActiveTab('layer')} variant={activeTab === 'layer' ? 'primary' : 'outline'}>
          Export theo lớp dữ liệu
        </Button>
        <Button onClick={() => setActiveTab('dump')} variant={activeTab === 'dump' ? 'primary' : 'outline'}>
          Dump dữ liệu
        </Button>
        <Button onClick={() => setActiveTab('restore_cleanup')} variant={activeTab === 'restore_cleanup' ? 'primary' : 'outline'}>
          Import &amp; Dọn dữ liệu
        </Button>
      </nav>

      {message && (
        <Alert variant="error" title="Lỗi">
          {message.text}
        </Alert>
      )}

      <Alert variant="warning" title="Lưu ý bảo mật">
        File export chứa dữ liệu nghiệp vụ đầy đủ, bao gồm mật khẩu đã băm (password hash) của user. Chỉ chia sẻ/lưu trữ file export ở nơi an toàn.
        Import là thao tác ghi vào cơ sở dữ liệu thật — hãy export một bản sao lưu trước khi import nếu không chắc chắn.
      </Alert>

      {activeTab === 'smart' && (
        <Card>
          <CardHeader>
            <CardTitle>Export dữ liệu thông minh (Surface Data Layer)</CardTitle>
          </CardHeader>
          <CardBody className="gap-4">
            <p className="text-fb-text-secondary">
              Tổng hợp <strong>lớp dữ liệu bề mặt (Surface Data Layer)</strong> tính từ ngày mốc được chọn trở xuống (<code>aggregated_at::date &lt;= ngày chọn</code>) theo đúng 3 cấp:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-fb-text-secondary">
              <li>
                <strong>Epic</strong>: lên danh sách toàn bộ Epic trong phạm vi từ ngày đã chọn trở về trước và chỉ lấy <strong>bản ghi mới nhất</strong> của từng Epic.
              </li>
              <li>
                <strong>Story của Epic</strong>: lấy toàn bộ Story thuộc các Epic trên theo đúng logic lớp dữ liệu bề mặt (chỉ lấy bản ghi mới nhất tính đến ngày đã chọn).
              </li>
              <li>
                <strong>Subtask của Story / Epic</strong>: lấy toàn bộ Subtask thuộc các Story/Epic trên theo đúng logic lớp dữ liệu bề mặt (chỉ lấy bản ghi mới nhất tính đến ngày đã chọn).
              </li>
              <li>
                Khi import lại file SQL này ở tab <strong>Import &amp; Dọn dữ liệu</strong>, hệ thống tự động tạo một lớp dữ liệu hợp nhất lấy <strong>ngày và giờ hiện tại lúc thực hiện import</strong> làm timestamp, đồng thời tự động tính toán lại toàn bộ cache và cảnh báo.
              </li>
            </ul>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
              <Input
                type="date"
                label="Chọn ngày mốc lớp dữ liệu"
                value={smartLayerDate}
                onChange={(event) => setSmartLayerDate(event.target.value)}
                className="min-w-[180px]"
              />
              <Button
                variant="primary"
                icon={<CloudArrowDown className="size-4" weight="bold" />}
                onClick={handleSmartExport}
                isLoading={isSmartExporting}
                disabled={!smartLayerDate}
              >
                Smart export
              </Button>
            </div>
            {layerDates.length > 0 && (
              <p className="text-fb-text-secondary">
                Lớp dữ liệu mới nhất hiện có trên hệ thống: <strong className="text-fb-text-primary">{formatLayerDate(layerDates[0])}</strong>
                {layerDates.length > 1 ? ` (tổng cộng ${formatNumber(layerDates.length)} ngày có lớp dữ liệu, cũ nhất ${formatLayerDate(layerDates[layerDates.length - 1])})` : ''}.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === 'layer' && (
        <Card>
          <CardHeader>
            <CardTitle>Export theo lớp dữ liệu</CardTitle>
          </CardHeader>
          <CardBody className="gap-4">
            <div className="flex flex-col gap-3 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
              <p className="text-fb-text-secondary">
                Chọn một khoảng lớp dữ liệu liên tiếp (theo ngày <code>aggregated_at</code>) — export luôn bao gồm dữ liệu lịch sử Epic (<code>epic_alert_timeline</code>) trong khoảng đã chọn; bật
                &quot;Export Raw Data&quot; để gộp thêm dữ liệu gốc (<code>issues</code>, <code>import_batches</code>).
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  label="Start Data Layer"
                  options={[...layerDates].sort().map((date) => ({ value: date, label: formatLayerDate(date) }))}
                  value={startLayerDate}
                  onChange={(event) => setStartLayerDate(event.target.value)}
                  disabled={layerDates.length === 0}
                  className="min-w-[160px]"
                />
                <Select
                  label="End Data Layer"
                  options={[...layerDates].sort().map((date) => ({ value: date, label: formatLayerDate(date) }))}
                  value={endLayerDate}
                  onChange={(event) => setEndLayerDate(event.target.value)}
                  disabled={layerDates.length === 0}
                  className="min-w-[160px]"
                />
                <label className="flex items-center gap-2 pb-2 font-semibold">
                  <input type="checkbox" checked={includeRawData} onChange={(event) => setIncludeRawData(event.target.checked)} />
                  Export Raw Data
                </label>
                <Button
                  variant="primary"
                  icon={<CloudArrowDown className="size-4" weight="bold" />}
                  onClick={handleLayerRangeExport}
                  isLoading={isExportingLayerRange}
                  disabled={!startLayerDate || !endLayerDate || startLayerDate > endLayerDate}
                >
                  Export
                </Button>
              </div>
              {layerDates.length === 0 && <p className="text-fb-text-secondary">Chưa có lớp dữ liệu nào để export.</p>}
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'dump' && (
        <Card>
          <CardHeader>
            <CardTitle>Export dữ liệu ra file SQL</CardTitle>
            <Button variant="outline" icon={<CloudArrowDown className="size-4" weight="bold" />} onClick={openExportModal} size="sm">
              Export nâng cao (chọn bảng thủ công)
            </Button>
          </CardHeader>
          <CardBody className="gap-4">
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
      )}

      {activeTab === 'restore_cleanup' && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Import dữ liệu từ file SQL</CardTitle>
            </CardHeader>
            <CardBody className="gap-4">
              <p className="text-fb-text-secondary">
                Chỉ chấp nhận file <code>.sql</code> được tạo bởi chính chức năng Export ở trên. Dòng dữ liệu trùng khóa chính (đã tồn tại trong DB) sẽ được <strong>cập nhật (ghi đè)</strong> bằng dữ liệu trong file — không còn bị bỏ qua. Với các bảng danh mục / cấu hình (users, dự án, phân quyền, cài đặt…), dòng có trong CSDL nhưng <strong>không có trong file sẽ bị xóa</strong> (đồng bộ theo file); tài khoản của chính bạn không bao giờ bị xóa. Hệ thống import thử trước và hỏi xác nhận kèm số dòng sẽ xóa. Đối với file được tạo từ <strong>Export dữ liệu thông minh</strong>, hệ thống sẽ tự động tạo một lớp dữ liệu bề mặt mới với timestamp là thời điểm thực hiện import, <strong>xóa các issue và snapshot không thuộc lớp bề mặt trong file</strong>, rồi tính toán lại toàn bộ cache.
              </p>
              <input ref={fileInputRef} type="file" accept=".sql,application/sql,text/plain" onChange={onFileChange} className="text-fb-text-primary" />

              {importPreview && isPreviewCurrent && (
                <div className="flex flex-col gap-3 rounded-xl border border-fb-border bg-fb-surface-muted p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-fb-text-primary">Xem trước nội dung file — chọn bảng sẽ import dữ liệu:</p>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={importSelectedTables.size === importPreview.tableCounts.length && importPreview.tableCounts.length > 0}
                        onChange={(event) => setImportSelectedTables(event.target.checked ? new Set(importPreview.tableCounts.map((item) => item.tableName)) : new Set())}
                      />
                      Chọn tất cả
                    </label>
                  </div>
                  {importPreview.createsSchemaFor.length > 0 && (
                    <p className="text-fb-text-secondary">
                      File có kèm cấu trúc bảng (CREATE TABLE IF NOT EXISTS) cho: {importPreview.createsSchemaFor.join(', ')}. Luôn được tạo bất kể có chọn import dữ liệu bảng đó hay không — an toàn với DB đã có bảng (sẽ được bỏ qua).
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {importPreview.tableCounts.map((item) => (
                      <li key={item.tableName}>
                        <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-fb-surface">
                          <span className="flex items-center gap-2 font-mono text-fb-text-secondary">
                            <input
                              type="checkbox"
                              checked={importSelectedTables.has(item.tableName)}
                              onChange={(event) => toggleImportTable(item.tableName, event.target.checked)}
                            />
                            {item.tableName}
                          </span>
                          <Badge variant={importSelectedTables.has(item.tableName) ? 'info' : 'neutral'}>{formatNumber(item.insertCount)} dòng</Badge>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {importSelectedTables.size === 0 && (
                    <p className="text-status-warning">Chưa chọn bảng nào — import sẽ không ghi dữ liệu của bất kỳ bảng nào (chỉ tạo cấu trúc bảng nếu file có kèm).</p>
                  )}
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
                          <Badge variant="info">{formatNumber(table.updated)} cập nhật (ghi đè)</Badge>{' '}
                          <Badge variant="neutral">{formatNumber(table.skippedDuplicates)} bỏ qua (trùng)</Badge>
                          {table.deleted > 0 && <>{' '}<Badge variant="danger">{formatNumber(table.deleted)} đã xóa</Badge></>}
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
                variant="primary"
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
                Xóa các đợt import cũ hơn số ngày chọn bên dưới (kéo theo <code>issues</code> của đợt đó, do quan hệ cascade).
                Đợt import <strong>mới nhất luôn được giữ lại</strong> dù có cũ hơn ngưỡng, để dữ liệu hiện tại không bao giờ bị ảnh hưởng.
                Dòng thời gian cảnh báo (<code>epic_alert_timeline</code>) <strong>không bị xóa</strong>; lịch sử Issue chỉ còn trong <code>issues</code> theo thời hạn lưu.
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
                    <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.importRowCount)}</strong> dòng đã import)
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
        </div>
      )}

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Chọn bảng để export"
        maxWidth="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowExportModal(false)}>Hủy</Button>
            <Button variant="primary" onClick={handleExport} isLoading={isExporting} disabled={selectedTables.size === 0}>
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
