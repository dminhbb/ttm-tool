'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowsClockwise, CloudArrowDown, CloudArrowUp, ListBullets, LockKey, Trash, Warning } from '@phosphor-icons/react';
import { confirmDialog } from '@/components/ui/dialogs';
import { Alert } from '@/components/ui/Alert';
import { showToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { cn } from '@/lib/utils';
import type { BackupTableInfo, ImportResult } from '@/lib/db-backup-types';
import type { ImportPreview } from '@/lib/db-backup-service';
import type { CleanupPreview } from '@/lib/db-cleanup-service';
import { DEFAULT_SMART_EXPORT_SCOPE, type SmartExportScope } from '@/lib/db-backup-tables';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

/** "YYYY-MM-DD" (a data-layer date, always this exact shape from the API) → "dd/mm/yyyy". */
function formatLayerDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/** Table size: KB below 1 MB, MB from there (vi-VN decimals). */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(bytes / 1024 / 1024)} MB`;
}

type BackupTab = 'smart' | 'info' | 'restore' | 'cleanup';

interface SmartScopeOption {
  description: ReactNode;
  title: string;
  value: SmartExportScope;
}

const SMART_SCOPE_OPTIONS: SmartScopeOption[] = [
  {
    description: (
      <div className="flex flex-col gap-3 leading-relaxed">
        <p>
          Chỉ tổng hợp <strong>lớp dữ liệu bề mặt (Surface Data Layer)</strong> tính từ ngày mốc được chọn trở xuống (<code>aggregated_at::date &lt;= ngày chọn</code>) theo đúng 3 cấp:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Epic:</strong> Danh sách toàn bộ Epic trong phạm vi từ ngày đã chọn trở về trước và chỉ lấy <strong>bản ghi mới nhất</strong> của từng Epic.</li>
          <li><strong>Story của Epic:</strong> Toàn bộ Story thuộc các Epic trên (chỉ lấy bản ghi mới nhất tính đến ngày đã chọn).</li>
          <li><strong>Subtask của Story / Epic:</strong> Toàn bộ Subtask thuộc các Story/Epic trên (chỉ lấy bản ghi mới nhất tính đến ngày đã chọn).</li>
        </ul>
        <div className="rounded-lg border border-fb-border bg-fb-surface-muted p-3 text-xs">
          <strong>Lưu ý:</strong> File <strong>không chứa</strong> bất kỳ bảng cấu hình nào khác (không xuất user, mật khẩu, dự án, domain, bản tin...). Môi trường nhận chỉ nạp lớp dữ liệu Epic mới mà không làm thay đổi các bảng danh mục sẵn có.
        </div>
      </div>
    ),
    title: 'Chỉ dữ liệu tại surface data layer',
    value: 'SURFACE_ONLY',
  },
  {
    description: (
      <div className="flex flex-col gap-3 leading-relaxed">
        <p>
          Lớp dữ liệu bề mặt (Surface Data Layer) kèm theo dữ liệu của các bảng cấu hình, nghiệp vụ, <strong>ngoại trừ</strong> các bảng thuộc nhóm <strong>&quot;Xác thực &amp; phân quyền&quot;</strong>:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Được xuất:</strong> Domain, Dự án, Component, Tiêu chí &amp; Bộ ngân sách TTM, Phạm vi dữ liệu, Scoring Service &amp; Rule Management, Epic ngoại lệ / Từ chối import, Ngày nghỉ &amp; ngày làm bù, Rule cảnh báo, Ánh xạ Issue type, Cấu hình Jira, Popup quảng cáo, Banner thông tin, Bình luận / Trạng thái xử lý / Ẩn Epic, Lịch sử chỉ số TTM &amp; Cache xu hướng, Các bảng PMS, <strong>Bản tin (kèm ảnh)</strong>, Audit log.</li>
          <li><strong>Không xuất:</strong> Toàn bộ nhóm Xác thực &amp; phân quyền gồm <strong>User (và password hash)</strong>, User ↔ Domain / Dự án / Component, Quyền xem, Ma trận phân quyền, Phiên đăng nhập, Yêu cầu cấp lại mật khẩu.</li>
        </ul>
        <div className="rounded-lg border border-fb-border bg-fb-surface-muted p-3 text-xs">
          <strong>Lưu ý:</strong> User ở cơ sở dữ liệu đích được giữ nguyên vẹn 100%, không bị ghi đè tài khoản hay phiên đăng nhập.
        </div>
      </div>
    ),
    title: 'Dữ liệu tại surface data layer và các dữ liệu khác trừ các bảng thuộc nhóm \'Xác thực & phân quyền\'',
    value: 'SURFACE_AND_DATA',
  },
  {
    description: (
      <div className="flex flex-col gap-3 leading-relaxed">
        <p>
          Lớp dữ liệu bề mặt (Surface Data Layer) kèm theo <strong>toàn bộ dữ liệu của tất cả các bảng còn lại</strong> trong hệ thống:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Bao gồm nhóm Xác thực &amp; phân quyền:</strong> Danh sách <strong>User (kèm mật khẩu băm password hash)</strong>, Phân quyền Domain / Dự án / Component, Thiết lập quyền xem, Ma trận phân quyền theo role.</li>
          <li><strong>Cùng toàn bộ các bảng nghiệp vụ:</strong> Bản tin (kèm ảnh), Audit log, Lịch sử chỉ số TTM &amp; Cache xu hướng, Danh mục dự án, Cấu hình Jira, Rules scoring...</li>
          <li><em>Không xuất:</em> Phiên đăng nhập đang hoạt động, Token/API key, Nhật ký truy cập, Cấu hình MCP.</li>
        </ul>
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-xs text-status-warning">
          <strong>Cảnh báo bảo mật:</strong> File xuất ở chế độ này chứa toàn bộ user và mật khẩu đã băm (password hash). Khi import vào môi trường đích, danh sách user sẽ được đồng bộ theo file và các phiên đăng nhập khác sẽ bị đăng xuất.
        </div>
      </div>
    ),
    title: 'Dữ liệu surface data layer và toàn bộ dữ liệu các bảng còn lại',
    value: 'ALL',
  },
];

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
  // "Thông tin DB" is read lazily: only when its tab is opened (one count per table is not free), again after an import / clean-up.
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [layerDates, setLayerDates] = useState<string[]>([]);
  const [smartLayerDate, setSmartLayerDate] = useState(todayIsoDate);
  const [isSmartExporting, setIsSmartExporting] = useState(false);
  const [smartScope, setSmartScope] = useState<SmartExportScope>(DEFAULT_SMART_EXPORT_SCOPE);
  const selectedScopeOption = SMART_SCOPE_OPTIONS.find((option) => option.value === smartScope) ?? SMART_SCOPE_OPTIONS[0];
  // Smart export carries every user (password hashes): the SUPERADMIN confirms with their own password first.
  const [showSmartPassword, setShowSmartPassword] = useState(false);
  const [smartPassword, setSmartPassword] = useState('');
  const [smartPasswordError, setSmartPasswordError] = useState<string | null>(null);

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
      setTablesLoaded(true);
    }
  };

  const fetchLayerDates = async () => {
    try {
      const res = await fetch('/api/admin/db-backup/layer-dates');
      if (!res.ok) return;
      const result: { dates: string[] } = await res.json();
      setLayerDates(result.dates);
      // Default to the most recent layer — the common case is "export the current data".
      if (result.dates.length > 0) setSmartLayerDate(result.dates[0]);
    } catch {
      // Non-fatal — the date field just keeps its default (today).
    }
  };

  useEffect(() => {
    // Defer the request so effect setup itself does not synchronously schedule state updates.
    void Promise.resolve().then(fetchLayerDates);
  }, []);

  useEffect(() => {
    if (activeTab === 'info' && !tablesLoaded) void Promise.resolve().then(fetchTables);
  }, [activeTab, tablesLoaded]);

  const tableGroups = useMemo(() => {
    const groups: { id: string; name: string; sizeBytes: number; tables: BackupTableInfo[] }[] = [];
    for (const table of tables) {
      let group = groups.find((item) => item.id === table.groupId);
      if (!group) {
        group = { id: table.groupId, name: table.groupName, sizeBytes: 0, tables: [] };
        groups.push(group);
      }
      group.tables.push(table);
      group.sizeBytes += table.sizeBytes;
    }
    return groups;
  }, [tables]);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);

  const scrollToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setHighlightedGroupId(groupId);
    const element = document.getElementById(`db-group-${groupId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.setTimeout(() => {
      setHighlightedGroupId((curr) => (curr === groupId ? null : curr));
    }, 2000);
  };

  useEffect(() => {
    if (activeTab !== 'info' || tableGroups.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topId = visible[0].target.id.replace('db-group-', '');
          setActiveGroupId(topId);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const group of tableGroups) {
      const el = document.getElementById(`db-group-${group.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [activeTab, tableGroups]);

  const closeSmartPassword = () => {
    setShowSmartPassword(false);
    setSmartPassword('');
    setSmartPasswordError(null);
  };

  const handleSmartExport = async () => {
    if (!smartLayerDate || !smartPassword) return;
    setIsSmartExporting(true);
    setSmartPasswordError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-backup/export-smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layerDate: smartLayerDate, password: smartPassword, scope: smartScope }),
      });
      if (!res.ok) {
        const result = await res.json();
        // A wrong password stays in the popup so it can be retyped; any other failure closes it.
        if (result.code === 'WRONG_PASSWORD') {
          setSmartPasswordError(result.error);
          return;
        }
        closeSmartPassword();
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
      closeSmartPassword();
      setMessage(null);
    } catch {
      closeSmartPassword();
      setMessage({ text: 'Không thể kết nối API Smart Export.', type: 'error' });
    } finally {
      setIsSmartExporting(false);
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
        setTablesLoaded(false);
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
  const [showCleanupPassword, setShowCleanupPassword] = useState(false);
  const [cleanupPassword, setCleanupPassword] = useState('');
  const [cleanupPasswordError, setCleanupPasswordError] = useState<string | null>(null);

  const closeCleanupPassword = () => {
    setShowCleanupPassword(false);
    setCleanupPassword('');
    setCleanupPasswordError(null);
  };

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
    if (!cleanupPreview || !cleanupPassword) return;
    setIsCleaning(true);
    setCleanupPasswordError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/db-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays, password: cleanupPassword }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.code === 'WRONG_PASSWORD') {
          setCleanupPasswordError(result.error);
          return;
        }
        closeCleanupPassword();
        setMessage({ text: result.error || 'Dọn dữ liệu thất bại.', type: 'error' });
        return;
      }
      showToast(`Đã xóa ${formatNumber(result.issueVersionsDeleted)} phiên bản issues và ${formatNumber(result.batchesDeleted)} đợt import rỗng (giữ ${retentionDays} ngày).`, 5000);
      closeCleanupPassword();
      setMessage(null);
      setCleanupPreview(null);
      setTablesLoaded(false);
      void fetchLayerDates();
    } catch {
      closeCleanupPassword();
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
        <Button onClick={() => setActiveTab('info')} variant={activeTab === 'info' ? 'primary' : 'outline'}>
          Thông tin DB
        </Button>
        <Button onClick={() => setActiveTab('restore')} variant={activeTab === 'restore' ? 'primary' : 'outline'}>
          Import dữ liệu
        </Button>
        <Button onClick={() => setActiveTab('cleanup')} variant={activeTab === 'cleanup' ? 'primary' : 'outline'}>
          Dọn lịch sử issues
        </Button>
      </nav>

      {message && (
        <Alert variant="error" title="Lỗi">
          {message.text}
        </Alert>
      )}

      <Alert variant="warning" title="Lưu ý bảo mật">
        File Smart export chứa dữ liệu nghiệp vụ đầy đủ, bao gồm mật khẩu đã băm (password hash) của user. Chỉ chia sẻ/lưu trữ file export ở nơi an toàn.
        Import là thao tác ghi vào cơ sở dữ liệu thật — hãy export một bản sao lưu trước khi import nếu không chắc chắn.
      </Alert>

      {activeTab === 'smart' && (
        <Card>
          <CardHeader>
            <CardTitle>Export dữ liệu thông minh (Surface Data Layer)</CardTitle>
          </CardHeader>
          <CardBody className="gap-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Panel bên trái: Form cấu hình phạm vi, ngày mốc, nút export */}
              <div className="flex flex-col gap-4 rounded-xl border border-fb-border bg-fb-surface-muted p-4 lg:col-span-5">
                <fieldset className="flex flex-col gap-2.5">
                  <legend className="mb-1 text-sm font-semibold text-fb-text-primary">
                    Phạm vi Smart export
                  </legend>
                  {SMART_SCOPE_OPTIONS.map((option) => {
                    const isSelected = smartScope === option.value;
                    return (
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                          isSelected
                            ? 'border-fb-blue bg-fb-surface ring-1 ring-fb-blue/40 shadow-xs'
                            : 'border-fb-border bg-fb-surface/60 hover:bg-fb-surface',
                        )}
                        key={option.value}
                      >
                        <input
                          checked={isSelected}
                          className="mt-0.5 size-4 text-fb-blue focus:ring-fb-blue"
                          name="smart-export-scope"
                          onChange={() => setSmartScope(option.value)}
                          type="radio"
                          value={option.value}
                        />
                        <span className="text-xs font-medium leading-snug text-fb-text-primary">
                          {option.title}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="pt-2">
                  <Input
                    label="Ngày mốc lớp dữ liệu"
                    onChange={(event) => setSmartLayerDate(event.target.value)}
                    type="date"
                    value={smartLayerDate}
                  />
                </div>

                <div className="pt-1">
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    disabled={!smartLayerDate}
                    icon={<CloudArrowDown className="size-4" weight="bold" />}
                    onClick={() => setShowSmartPassword(true)}
                  >
                    Smart export
                  </Button>
                </div>

                {layerDates.length > 0 && (
                  <p className="border-t border-fb-border pt-3 text-xs text-fb-text-secondary">
                    Lớp dữ liệu mới nhất hiện có: <strong className="text-fb-text-primary">{formatLayerDate(layerDates[0])}</strong>
                    {layerDates.length > 1 ? ` (tổng cộng ${formatNumber(layerDates.length)} ngày có lớp dữ liệu, cũ nhất ${formatLayerDate(layerDates[layerDates.length - 1])})` : ''}.
                  </p>
                )}
              </div>

              {/* Panel bên phải: Mô tả chi tiết option đang chọn */}
              <div className="flex flex-col rounded-xl border border-fb-border bg-fb-surface p-5 lg:col-span-7">
                <div className="mb-3 border-b border-fb-border pb-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-fb-text-secondary">
                    Mô tả phạm vi export
                  </span>
                  <h3 className="mt-1 text-sm font-bold text-fb-text-primary">
                    {selectedScopeOption.title}
                  </h3>
                </div>
                <div className="text-xs leading-relaxed text-fb-text-secondary">
                  {selectedScopeOption.description}
                </div>
              </div>
            </div>
            <Modal
              isOpen={showSmartPassword}
              onClose={closeSmartPassword}
              title="Xác nhận mật khẩu để export"
              icon={LockKey}
              maxWidth="sm"
              footer={(
                <>
                  <Button variant="outline" onClick={closeSmartPassword} disabled={isSmartExporting}>Hủy</Button>
                  <Button variant="primary" onClick={handleSmartExport} isLoading={isSmartExporting} disabled={!smartPassword}>Export</Button>
                </>
              )}
            >
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSmartExport();
                }}
              >
                <p className="text-fb-text-secondary">
                  File Smart export có thể chứa <strong>user kèm password hash</strong> (ở option 3). Nhập mật khẩu của tài khoản SUPERADMIN đang đăng nhập để tiếp tục.
                </p>
                <Input
                  autoComplete="current-password"
                  autoFocus
                  error={smartPasswordError ?? undefined}
                  label="Mật khẩu của bạn"
                  onChange={(event) => { setSmartPassword(event.target.value); setSmartPasswordError(null); }}
                  type="password"
                  value={smartPassword}
                />
              </form>
            </Modal>
          </CardBody>
        </Card>
      )}

      {activeTab === 'info' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Thông tin cơ sở dữ liệu</CardTitle>
              <p className="mt-1 text-xs text-fb-text-secondary">
                Dữ liệu schema public phân nhóm theo chức năng, gồm số bản ghi và dung lượng vật lý (dữ liệu + index + TOAST).
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isLoadingTables && (
                <div className="flex items-center gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 py-1.5 text-xs text-fb-text-secondary">
                  <span>{formatNumber(tables.length)} bảng</span>
                  <span className="text-fb-border">|</span>
                  <span>Tổng dung lượng: <strong className="font-bold text-fb-text-primary">{formatSize(tables.reduce((sum, table) => sum + table.sizeBytes, 0))}</strong></span>
                </div>
              )}
              <Button
                variant="outline"
                icon={<ArrowsClockwise className="size-4" weight="bold" />}
                onClick={() => setTablesLoaded(false)}
                disabled={isLoadingTables}
              >
                Làm mới
              </Button>
            </div>
          </CardHeader>
          <CardBody className="gap-4">
            {isLoadingTables ? <TableSkeleton rows={6} /> : (
              <div className="flex flex-col lg:flex-row items-start gap-6">
                {/* Mục lục chỉ mục các nhóm ở bên trái */}
                <aside className="w-full lg:w-64 xl:w-72 shrink-0 lg:sticky lg:top-20 self-start rounded-xl border border-fb-border bg-fb-surface p-3 shadow-xs">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-fb-border">
                    <div className="flex items-center gap-2">
                      <ListBullets className="size-4 text-fb-text-secondary" weight="bold" />
                      <span className="text-xs font-bold uppercase tracking-wider text-fb-text-secondary">
                        Mục lục nhóm ({tableGroups.length})
                      </span>
                    </div>
                  </div>
                  <nav className="flex flex-col gap-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                    {tableGroups.map((group, idx) => {
                      const isActive = activeGroupId === group.id;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => scrollToGroup(group.id)}
                          className={cn(
                            'group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                            isActive
                              ? 'bg-fb-surface-muted text-fb-text-primary font-bold border-l-2 border-fb-blue'
                              : 'text-fb-text-secondary hover:bg-fb-control-hover/60 hover:text-fb-text-primary',
                          )}
                          title={`${group.name} (${group.tables.length} bảng, ${formatSize(group.sizeBytes)})`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-fb-text-secondary font-mono shrink-0 w-4">
                              {idx + 1}.
                            </span>
                            <span className="truncate leading-snug">{group.name}</span>
                          </span>
                          <span className="shrink-0 text-xs font-mono tabular-nums text-fb-text-secondary/80 group-hover:text-fb-text-secondary">
                            {group.tables.length}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </aside>

                {/* Danh sách các nhóm bảng ở bên phải (tối đa 2 bảng/hàng) */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {tableGroups.map((group) => (
                      <div
                        key={group.id}
                        id={`db-group-${group.id}`}
                        className={cn(
                          'flex flex-col overflow-hidden rounded-xl border bg-fb-surface shadow-xs transition-all duration-300 scroll-mt-20',
                          highlightedGroupId === group.id
                            ? 'border-fb-blue ring-2 ring-fb-blue/40'
                            : 'border-fb-border',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-fb-border bg-fb-surface-muted px-4 py-2.5">
                          <span className="font-bold text-fb-text-primary text-sm truncate">{group.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-md border border-fb-border/60 bg-fb-surface px-2 py-0.5 text-xs font-medium text-fb-text-secondary">
                              {formatNumber(group.tables.length)} bảng
                            </span>
                            <span className="rounded-md border border-fb-border/60 bg-fb-surface px-2.5 py-0.5 text-xs font-mono font-bold text-fb-text-primary">
                              {formatSize(group.sizeBytes)}
                            </span>
                          </div>
                        </div>
                        <div className="overflow-x-auto flex-1">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="border-b border-fb-border/70 bg-fb-surface-muted/30 text-[11px] font-bold uppercase tracking-wider text-fb-text-secondary">
                                <th className="px-4 py-2.5">Bảng / Mục đích</th>
                                <th className="px-3 py-2.5 text-right w-28">Số dòng</th>
                                <th className="px-4 py-2.5 text-right w-28">Dung lượng</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-fb-border/40">
                              {group.tables.map((table, idx) => (
                                <tr
                                  key={table.tableName}
                                  className={`transition-colors hover:bg-fb-control-hover/40 ${idx % 2 === 1 ? 'bg-fb-surface-muted/20' : 'bg-fb-surface'}`}
                                >
                                  <td className="px-4 py-3 align-middle" title={table.tableName}>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-semibold text-fb-text-primary text-[13px] leading-snug">
                                        {table.label || table.tableName}
                                      </span>
                                      {table.label && (
                                        <span className="font-mono text-[11px] text-fb-text-secondary tracking-tight">
                                          {table.tableName}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-fb-text-secondary align-middle tabular-nums text-xs">
                                    {table.isEstimate ? '~' : ''}{formatNumber(table.approxRowCount)}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-fb-text-primary align-middle tabular-nums text-xs">
                                    {formatSize(table.sizeBytes)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-fb-text-secondary">
                    Nhóm theo chức năng (chương 5 tài liệu sản phẩm). Mỗi dòng: tên bảng · số dòng · Size (dữ liệu + index + TOAST). Bảng lớn hơn 20 MB hiển thị số dòng ước lượng (~). Dữ liệu chỉ được đọc khi mở tab này.
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === 'restore' && (
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
      )}

      {activeTab === 'cleanup' && (
        <Card>
          <CardHeader>
            <CardTitle>Dọn lịch sử issues</CardTitle>
          </CardHeader>
          <CardBody className="gap-4">
            <p className="text-fb-text-secondary">
              Cùng việc làm thưa lịch sử <code>issues</code> mà hệ thống tự chạy mỗi ngày: giữ nguyên mọi phiên bản của <strong>30 ngày import gần nhất</strong>;
              xa hơn chỉ giữ phiên bản đang có hiệu lực vào <strong>ngày làm việc cuối mỗi tuần</strong> (trong số ngày chọn bên dưới) và <strong>phiên bản mới nhất của mỗi issue</strong>,
              nên Epic lâu không cập nhật vẫn hiển thị. Dòng thời gian cảnh báo (<code>epic_alert_timeline</code>) <strong>không bị xóa</strong>.
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
                  Sẽ xóa <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.issueVersionCount)}</strong> / {formatNumber(cleanupPreview.totalRows)} dòng issues
                  ({formatNumber(cleanupPreview.issueVersionsBeyondRetention)} cũ hơn {cleanupPreview.cutoffDate}, {formatNumber(cleanupPreview.issueVersionsInSparseZone)} nằm giữa các mốc tuần)
                  và <strong className="text-fb-text-primary">{formatNumber(cleanupPreview.emptyBatchCount)}</strong> đợt import không còn dòng nào.
                </p>
                <p className="text-fb-text-secondary">
                  Giữ lại: {formatNumber(cleanupPreview.keptDense)} dòng của các ngày từ {cleanupPreview.denseStart ?? '—'} trở đi,
                  {' '}{formatNumber(cleanupPreview.keptBridging)} dòng đang có hiệu lực tại các mốc tuần và {formatNumber(cleanupPreview.keptNewestOld)} phiên bản mới nhất của issue lâu không đổi.
                </p>
              </div>
            )}
          </CardBody>
          {cleanupPreview && (
            <CardFooter>
              <Button
                variant="danger"
                icon={<Trash className="size-4" weight="bold" />}
                disabled={(cleanupPreview.issueVersionCount === 0 && cleanupPreview.emptyBatchCount === 0) || isCleaning}
                isLoading={isCleaning}
                onClick={() => setShowCleanupPassword(true)}
              >
                Xóa {formatNumber(cleanupPreview.issueVersionCount)} phiên bản issues cũ
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      <Modal
        isOpen={showCleanupPassword}
        onClose={closeCleanupPassword}
        title="Xác nhận mật khẩu để dọn dữ liệu"
        icon={LockKey}
        maxWidth="sm"
        footer={(
          <>
            <Button variant="outline" onClick={closeCleanupPassword} disabled={isCleaning}>Hủy</Button>
            <Button
              variant="danger"
              icon={<Trash className="size-4" weight="bold" />}
              onClick={handleCleanupExecute}
              isLoading={isCleaning}
              disabled={!cleanupPassword || isCleaning}
            >
              Xác nhận xóa vĩnh viễn
            </Button>
          </>
        )}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCleanupExecute();
          }}
        >
          {cleanupPreview && (
            <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-xs text-status-danger">
              Thao tác này sẽ xóa vĩnh viễn <strong>{formatNumber(cleanupPreview.issueVersionCount)}</strong> phiên bản issues cũ
              và <strong>{formatNumber(cleanupPreview.emptyBatchCount)}</strong> đợt import rỗng. Dữ liệu không thể hoàn tác.
            </div>
          )}
          <p className="text-xs text-fb-text-secondary">
            Đây là chức năng nhạy cảm về dữ liệu. Vui lòng nhập mật khẩu của tài khoản SUPERADMIN đang đăng nhập để tiếp tục.
          </p>
          <Input
            autoComplete="current-password"
            autoFocus
            error={cleanupPasswordError ?? undefined}
            label="Mật khẩu của bạn"
            onChange={(event) => { setCleanupPassword(event.target.value); setCleanupPasswordError(null); }}
            type="password"
            value={cleanupPassword}
          />
        </form>
      </Modal>

    </div>
  );
}
