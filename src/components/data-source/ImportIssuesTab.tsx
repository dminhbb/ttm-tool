"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ADAPTER_TYPES, DEFAULT_ADAPTER, ADAPTER_LABELS, type AdapterType } from '@/lib/adapters/index';
import { AggregatedDataLayersPanel } from '@/components/data-source/AggregatedDataLayersPanel';
import { CompleteDataPanel } from '@/components/data-source/CompleteDataPanel';
import { FileDropzone } from '@/components/data-source/FileDropzone';
import { PurgeRecentLayersPanel } from '@/components/data-source/PurgeRecentLayersPanel';
import { RawImportRetentionSettings } from '@/components/data-source/RawImportRetentionSettings';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { TableContainer, Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { Modal } from '@/components/ui/Modal';
import { RightPanel } from '@/components/layout/RightPanel';
import { Pagination } from '@/components/ui/Pagination';
import {
  Trash,
  Eye,
  ListMagnifyingGlass,
  CheckCircle,
  DownloadSimple,
  Info,
  SlidersHorizontal,
  Database,
  Wrench,
  Eraser,
} from '@phosphor-icons/react';

interface ImportBatch {
  id: number;
  fileName: string;
  importType: string;
  importedBy: string;
  importedAt: string;
  aggregatedAt: string;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  status: 'SUCCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
}

interface ValidationError {
  type: 'ERROR' | 'WARNING';
  field: string;
  message: string;
}

interface ValidationDetail {
  rowNumber: number;
  rawData: Record<string, string>;
  validationStatus: string;
  validationErrors: ValidationError[];
}

interface PreviewResult {
  fileName: string;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  status: string;
  validationReport: {
    rowNumber: number;
    issueKey: string;
    issueType: string;
    summary: string;
    status: 'VALID' | 'INVALID' | 'WARNING';
    errors: ValidationError[];
  }[];
}

const HISTORY_PAGE_SIZE = 5;

export function ImportIssuesTab() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState('CSV');
  const [adapterType, setAdapterType] = useState<AdapterType>(DEFAULT_ADAPTER);
  const [file, setFile] = useState<File | null>(null);
  const [aggregatedAt, setAggregatedAt] = useState('');
  const [isAutoDate, setIsAutoDate] = useState(false);
  const [autoDateMessage, setAutoDateMessage] = useState('');

  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  // Validation details modal
  const [showModal, setShowModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [validationDetails, setValidationDetails] = useState<ValidationDetail[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const applySelectedFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setImportMessage({ type: 'error', text: 'Chỉ chấp nhận file định dạng .csv.' });
      return;
    }

    setFile(selectedFile);
    setImportMessage(null);

    const dateMatch = selectedFile.name.match(/Jira[\s_](\d{4})-(\d{2})-(\d{2})T(\d{2})_(\d{2})/i);
    if (dateMatch) {
      const [, year, month, day, hour, minute] = dateMatch;
      setAggregatedAt(`${year}-${month}-${day}T${hour}:${minute}`);
      setIsAutoDate(true);
      setAutoDateMessage(`Tự động nhận diện từ tên file: ${day}/${month}/${year} ${hour}:${minute}`);
      return;
    }

    setDefaultDateTime();
  };

  const setDefaultDateTime = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
    setAggregatedAt(localISOTime);
    setIsAutoDate(false);
    setAutoDateMessage('');
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/data-source/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Error fetching import history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDefaultDateTime();
      fetchHistory();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      applySelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      applySelectedFile(e.dataTransfer.files[0]);
    }
  };

  const clearFileSelection = () => {
    setFile(null);
    setPreviewResult(null);
    setDefaultDateTime();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportSubmit = async (validateOnly: boolean) => {
    if (!file) {
      setImportMessage({ type: 'error', text: 'Vui lòng chọn file CSV để tiếp tục.' });
      return;
    }

    const aggregatedDate = new Date(aggregatedAt);
    if (!aggregatedAt || Number.isNaN(aggregatedDate.getTime())) {
      setImportMessage({ type: 'error', text: 'Vui lòng nhập thời gian tổng hợp hợp lệ.' });
      return;
    }

    setIsImporting(true);
    setImportMessage(null);
    if (!validateOnly) {
      setPreviewResult(null);
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('aggregatedAt', aggregatedDate.toISOString());
    formData.append('validateOnly', validateOnly ? 'true' : 'false');
    formData.append('adapterType', adapterType);

    try {
      const res = await fetch('/api/data-source/import', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setImportMessage({ type: 'error', text: result.error || 'Lỗi hệ thống khi xử lý dữ liệu.' });
      } else {
        if (validateOnly) {
          setPreviewResult(result);
          if (result.errorRows > 0) {
            setImportMessage({
              type: 'error',
              text: `Kiểm tra hoàn thành. Có lỗi dữ liệu nghiêm trọng! Tổng: ${result.totalRows} dòng. Lỗi: ${result.errorRows} dòng, Cảnh báo: ${result.warningRows} dòng. (Dữ liệu chưa được lưu).`
            });
          } else if (result.warningRows > 0) {
            setImportMessage({
              type: 'warning',
              text: `Kiểm tra hoàn thành. Không có lỗi nghiêm trọng, phát hiện ${result.warningRows} cảnh báo. (Dữ liệu chưa được lưu).`
            });
          } else {
            setImportMessage({
              type: 'success',
              text: `Kiểm tra hoàn thành. Tất cả ${result.totalRows} dòng đều hợp lệ! (Dữ liệu chưa được lưu).`
            });
          }
        } else {
          setPreviewResult(null);
          if (result.status === 'FAILED') {
            setImportMessage({
              type: 'error',
              text: `Import hoàn tất với lỗi! File chứa ${result.errorRows} dòng lỗi dữ liệu nghiêm trọng — các dòng này đã bị bỏ qua. ${result.successRows + result.warningRows}/${result.totalRows} dòng hợp lệ khác vẫn được lưu vào lớp dữ liệu ngày ${formatDate(result.aggregatedAt)}. Vui lòng kiểm tra lịch sử để xem chi tiết lỗi và điều chỉnh dữ liệu nguồn.`
            });
            clearFileSelection();
          } else if (result.status === 'COMPLETED_WITH_WARNINGS') {
            setImportMessage({
              type: 'warning',
              text: `Import thành công với ${result.warningRows} cảnh báo! Tổng cộng ${result.successRows}/${result.totalRows} dòng đã được đưa vào hệ thống.`
            });
            clearFileSelection();
          } else {
            setImportMessage({
              type: 'success',
              text: `Import thành công tốt đẹp! Đã lưu trữ ${result.successRows} issues vào lớp dữ liệu ngày ${formatDate(result.aggregatedAt)}.`
            });
            clearFileSelection();
          }
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportMessage({ type: 'error', text: 'Có lỗi xảy ra khi gọi API import.' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đợt import này? Toàn bộ dữ liệu issue thuộc lớp này sẽ bị xóa khỏi cơ sở dữ liệu.')) {
      return;
    }

    try {
      const res = await fetch(`/api/data-source/history?batchId=${batchId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setImportMessage({ type: 'success', text: 'Đã xóa đợt import và dọn dẹp dữ liệu liên quan thành công.' });
        fetchHistory();
      } else {
        const err = await res.json();
        setImportMessage({ type: 'error', text: err.error || 'Xóa thất bại.' });
      }
    } catch (error) {
      console.error('Delete batch error:', error);
      setImportMessage({ type: 'error', text: 'Không thể kết nối API xóa.' });
    }
  };

  const handleViewErrors = async (batch: ImportBatch) => {
    setSelectedBatch(batch);
    setShowModal(true);
    setIsLoadingDetails(true);
    setValidationDetails([]);

    try {
      const res = await fetch(`/api/data-source/history?batchId=${batch.id}`);
      if (res.ok) {
        const data = await res.json();
        setValidationDetails(data);
      }
    } catch (error) {
      console.error('Error fetching batch validation details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hour}:${minute}`;
  };

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">

        {/* Left column: Upload Panel, Live Preview & History */}
        <div className="flex flex-col gap-6">

          {/* Main Upload Zone Card */}
          <Card>
            <CardHeader>
              <CardTitle>Thiết lập nguồn dữ liệu CSV</CardTitle>
            </CardHeader>

            <CardBody>
              <FileDropzone
                file={file}
                inputRef={fileInputRef}
                onChange={handleFileChange}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />

              {file && (
                <div className="flex justify-end -mt-1">
                  <Button variant="ghost" size="sm" onClick={clearFileSelection} className="text-status-danger hover:bg-status-danger-soft hover:text-status-danger">
                    Hủy chọn file
                  </Button>
                </div>
              )}
            </CardBody>

            <CardFooter>
              <Button
                variant="outline"
                onClick={() => handleImportSubmit(true)}
                disabled={!file || isImporting}
              >
                Chỉ kiểm tra lỗi (Validate only)
              </Button>
              <Button
                variant="primary"
                onClick={() => handleImportSubmit(false)}
                disabled={!file || isImporting}
                isLoading={isImporting}
              >
                Import & Lưu dữ liệu
              </Button>
            </CardFooter>
          </Card>

          {/* Alert Messages (Clean Facebook notifications layout) */}
          {importMessage && (
            <Alert
              variant={importMessage.type}
              title={importMessage.type === 'success' ? 'Thao tác thành công' : importMessage.type === 'warning' ? 'Cần kiểm tra dữ liệu' : 'Không thể hoàn tất thao tác'}
            >
              {importMessage.text}
            </Alert>
          )}

          {/* Validation Live Preview Card */}
          {previewResult && (
            <Card>
              <CardHeader>
                <CardTitle>Preview kết quả kiểm tra (Dữ liệu chưa lưu)</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setPreviewResult(null)}>
                  Đóng preview
                </Button>
              </CardHeader>

              <CardBody>
                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-fb-border bg-fb-surface-muted p-3.5 text-[11.5px]">
                  <div><strong>Tổng số dòng:</strong> {previewResult.totalRows}</div>
                  <div className="text-status-success"><strong>Hợp lệ:</strong> {previewResult.successRows}</div>
                  <div className="text-status-warning"><strong>Cảnh báo:</strong> {previewResult.warningRows}</div>
                  <div className="text-status-danger"><strong>Lỗi:</strong> {previewResult.errorRows}</div>
                </div>

                {previewResult.validationReport.filter(row => row.status === 'INVALID' || row.status === 'WARNING').length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center text-[11.5px] font-bold text-status-success select-none">
                    <CheckCircle className="w-8 h-8" weight="fill" />
                    <span>✓ Tuyệt vời! Không phát hiện lỗi hoặc cảnh báo nào. Dữ liệu sẵn sàng để Import.</span>
                  </div>
                ) : (
                  <TableContainer className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-[60px] text-center">Dòng</TH>
                          <TH className="w-[120px]">Issue Key</TH>
                          <TH>Summary / Tên Issue</TH>
                          <TH className="w-[100px]">Mức độ</TH>
                          <TH>Chi tiết kiểm tra</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {previewResult.validationReport
                          .filter(row => row.status === 'INVALID' || row.status === 'WARNING')
                          .map((row, idx) => (
                            <TR key={idx}>
                              <TD className="text-center font-bold text-fb-text-secondary">{row.rowNumber}</TD>
                              <TD className="font-bold text-fb-blue">{row.issueKey}</TD>
                              <TD className="max-w-[200px] truncate font-medium" title={row.summary}>
                                {row.summary}
                              </TD>
                              <TD>
                                <Badge variant={row.status === 'INVALID' ? 'danger' : 'warning'}>
                                  {row.status === 'INVALID' ? 'Lỗi' : 'Cảnh báo'}
                                </Badge>
                              </TD>
                              <TD>
                                <ul className="m-0 flex list-none flex-row flex-nowrap gap-4 p-0 font-sans">
                                  {row.errors.map((err, eIdx) => (
                                    <li key={eIdx} className={`whitespace-nowrap ${err.type === 'ERROR' ? 'text-status-danger' : 'text-status-warning'}`}>
                                      <strong>{err.field}:</strong> {err.message}
                                    </li>
                                  ))}
                                </ul>
                              </TD>
                            </TR>
                          ))}
                      </TBody>
                    </Table>
                  </TableContainer>
                )}
              </CardBody>
            </Card>
          )}

          {/* Import log history card */}
          <Card>
            <CardHeader>
              <CardTitle>Nhật ký lịch sử import (Lớp Dữ liệu)</CardTitle>
            </CardHeader>

            <CardBody>
              {isLoadingHistory ? (
                <TableSkeleton rows={5} />
              ) : history.length === 0 ? (
                <EmptyState
                  title="Chưa có lịch sử import"
                  description="Tải lên file CSV đầu tiên để tạo lớp dữ liệu cho hệ thống."
                />
              ) : (
                <TableContainer>
                  <Table className="min-w-[1320px]">
                    <THead>
                      <TR>
                        <TH className="w-[84px]">Mã đợt</TH>
                        <TH className="w-[230px]">Tên file</TH>
                        <TH className="w-[140px]">Dữ liệu gốc</TH>
                        <TH className="w-[140px]">Thời gian import</TH>
                        <TH className="w-[90px]">Tổng dòng</TH>
                        <TH className="w-[80px]">Hợp lệ</TH>
                        <TH className="w-[90px]">Cảnh báo</TH>
                        <TH className="w-[70px]">Lỗi</TH>
                        <TH className="w-[130px]">Trạng thái</TH>
                        <TH className="w-[310px]">Hành động</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((batch) => (
                        <TR key={batch.id}>
                          <TD className="font-bold text-fb-text-primary">#{batch.id}</TD>
                          <TD className="max-w-[230px] truncate font-medium" title={batch.fileName}>
                            {batch.fileName}
                          </TD>
                          <TD className="font-bold text-fb-blue">
                            {formatDate(batch.aggregatedAt)}
                          </TD>
                          <TD className="font-medium text-fb-text-secondary">
                            {formatDate(batch.importedAt)}
                          </TD>
                          <TD className="text-center font-bold">{batch.totalRows}</TD>
                          <TD className="text-center font-bold text-status-success">{batch.successRows}</TD>
                          <TD className={`text-center font-bold ${batch.warningRows > 0 ? 'text-status-warning' : 'text-fb-text-secondary'}`}>
                            {batch.warningRows}
                          </TD>
                          <TD className={`text-center font-bold ${batch.errorRows > 0 ? 'text-status-danger' : 'text-fb-text-secondary'}`}>
                            {batch.errorRows}
                          </TD>
                          <TD>
                            <Badge variant={
                              batch.status === 'SUCCESS' ? 'success' :
                              batch.status === 'COMPLETED_WITH_WARNINGS' ? 'warning' : 'danger'
                            }>
                              {batch.status === 'SUCCESS' ? 'Thành công' :
                               batch.status === 'COMPLETED_WITH_WARNINGS' ? 'Có cảnh báo' : 'Có lỗi (đã bỏ qua dòng lỗi)'}
                            </Badge>
                          </TD>
                          <TD>
                            <div className="flex justify-center gap-2">
                              <TableAction
                                variant="info"
                                icon={<ListMagnifyingGlass className="w-4 h-4" />}
                                onClick={() => router.push(`/data-review/${batch.id}`)}
                              >
                                Duyệt dữ liệu
                              </TableAction>
                              {(batch.errorRows > 0 || batch.warningRows > 0) && (
                                <TableAction
                                  variant="neutral"
                                  icon={<Eye className="w-4 h-4" />}
                                  onClick={() => handleViewErrors(batch)}
                                >
                                  Chi tiết
                                </TableAction>
                              )}
                              <TableAction
                                variant="danger"
                                icon={<Trash className="w-4 h-4" />}
                                onClick={() => handleDeleteBatch(batch.id)}
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
            {!isLoadingHistory && history.length > HISTORY_PAGE_SIZE && (
              <CardFooter>
                <Pagination
                  currentPage={Math.min(historyPage, Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE)))}
                  itemLabel="đợt import"
                  onPageChange={setHistoryPage}
                  pageSize={HISTORY_PAGE_SIZE}
                  totalItems={history.length}
                />
              </CardFooter>
            )}
          </Card>

          <AggregatedDataLayersPanel />
        </div>

        <RightPanel
          expanded={isRightPanelExpanded}
          items={[
            { icon: SlidersHorizontal, label: 'Cấu hình đợt import' },
            { icon: Database, label: 'Lưu trữ dữ liệu import' },
            // Tạm ẩn cùng CompleteDataPanel — bỏ comment khi bật lại.
            // { icon: Wrench, label: 'Hoàn thiện dữ liệu' },
            { icon: Eraser, label: 'Xóa N lớp dữ liệu gần nhất' },
            { icon: Info, label: 'Thông tin chung và hướng dẫn' },
          ]}
          onToggle={() => setIsRightPanelExpanded((current) => !current)}
        >

          {/* Config Card */}
          <Card>
            <CardHeader>
              <CardTitle>Cấu hình Đợt Import</CardTitle>
            </CardHeader>

            <CardBody className="gap-4">
              <Select
                label="Loại nguồn dữ liệu"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                options={[
                  { value: 'CSV', label: 'Import file CSV' },
                  { value: 'API', label: 'Kết nối Jira API (Sắp có)' },
                  { value: 'DB', label: 'Query Jira DB (Sắp có)' },
                ]}
              />

              <Select
                id="adapter-type-right-panel"
                label="Định dạng file import (Adapter)"
                value={adapterType}
                onChange={(e) => setAdapterType(e.target.value as AdapterType)}
                options={Object.entries(ADAPTER_TYPES).map(([, val]) => ({
                  value: val,
                  label: `${ADAPTER_LABELS[val]}${val === DEFAULT_ADAPTER ? ' (Mặc định)' : ''}`,
                }))}
              />

              <Input
                type="datetime-local"
                label="Thời gian tổng hợp (Lớp dữ liệu)"
                labelAdornment={isAutoDate ? <Badge variant="success">Tự động</Badge> : undefined}
                value={aggregatedAt}
                onChange={(event) => {
                  setAggregatedAt(event.target.value);
                  setIsAutoDate(false);
                  setAutoDateMessage('');
                }}
                helperText={autoDateMessage || 'Thời gian dữ liệu được chốt từ Jira (dd/mm/yyyy hh:mm)'}
              />
            </CardBody>
          </Card>

          <RawImportRetentionSettings />

          {/* Tạm ẩn theo yêu cầu — bật lại bằng cách bỏ comment dòng dưới. Giữ nguyên code/logic. */}
          {/* <CompleteDataPanel /> */}

          <PurgeRecentLayersPanel />

          {/* Guide Card */}
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung & Hướng dẫn</CardTitle>
            </CardHeader>
            <CardBody className="gap-3 text-[11.5px] font-medium leading-relaxed text-fb-text-secondary">
              <p>
                Hệ thống lưu trữ tích lũy theo từng lớp dữ liệu (data layering).
              </p>
              <p>
                Mỗi Epic có thể có nhiều lớp dữ liệu theo thời điểm. Hệ thống phân biệt các lớp bằng trường Thời gian tổng hợp.
              </p>
              <p className="pt-1 font-bold text-fb-text-primary">
                Quy tắc đặt tên file để tự động nhận dạng ngày giờ:
              </p>
              <code className="block break-all rounded-xl border border-fb-border bg-fb-surface-muted px-3 py-2.5 font-mono text-[10px] text-fb-text-primary select-all">
                Jira 2026-08-07T15_18_36+0700.csv
              </code>
              <p className="text-[10px] leading-4 text-fb-text-secondary">
                Hệ thống nhận diện và thiết lập thời gian tổng hợp là 07/08/2026 15:18.
              </p>

              <div className="mt-2 border-t border-fb-border pt-3.5">
                <a
                  href="/brd/Jira 2026-08-07T15_18_36+0700.csv"
                  className="inline-flex items-center gap-2 text-[10.5px] font-bold text-fb-blue transition-colors hover:text-fb-blue-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-fb-blue/20"
                >
                  <DownloadSimple className="w-4 h-4" weight="bold" />
                  Tải file mẫu CSV
                </a>
              </div>
            </CardBody>
          </Card>

        </RightPanel>
      </div>

      {/* Validation details Modal (frosted glass) */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`Chi tiết đợt import #${selectedBatch?.id}`}
        maxWidth="xl"
        footer={
          <Button variant="outline" onClick={() => setShowModal(false)}>
            Đóng
          </Button>
        }
      >
        {selectedBatch && (
          <div className="flex flex-col gap-4 font-sans">
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-fb-border bg-fb-surface-muted p-3 text-[11.5px]">
              <div><strong>File:</strong> {selectedBatch.fileName}</div>
              <div><strong>Lớp dữ liệu:</strong> {formatDate(selectedBatch.aggregatedAt)}</div>
              <div>
                <span className="text-status-danger"><strong>Lỗi:</strong> {selectedBatch.errorRows}</span>
                {', '}
                <span className="text-status-warning"><strong>Cảnh báo:</strong> {selectedBatch.warningRows}</span>
              </div>
            </div>

            {isLoadingDetails ? (
              <TableSkeleton rows={4} />
            ) : validationDetails.length === 0 ? (
              <EmptyState
                title="Không có lỗi hoặc cảnh báo"
                description="Đợt import này đã vượt qua toàn bộ bước kiểm tra dữ liệu."
                icon={<CheckCircle className="size-5" weight="fill" aria-hidden="true" />}
              />
            ) : (
              <TableContainer className="max-h-[400px] overflow-y-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-[60px] text-center">Dòng</TH>
                      <TH className="w-[120px]">Issue Key</TH>
                      <TH>Summary / Tên Issue</TH>
                      <TH className="w-[100px]">Mức độ</TH>
                      <TH>Chi tiết kiểm tra</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {validationDetails.map((row, idx) => (
                      <TR key={idx}>
                        <TD className="text-center font-bold text-fb-text-secondary">{row.rowNumber}</TD>
                        <TD className="font-bold text-fb-blue">{row.rawData.issueKey || '-'}</TD>
                        <TD className="max-w-[240px] truncate font-medium" title={row.rawData.summary}>
                          {row.rawData.summary}
                        </TD>
                        <TD>
                          <Badge variant={row.validationStatus === 'INVALID' ? 'danger' : 'warning'}>
                            {row.validationStatus === 'INVALID' ? 'Lỗi' : 'Cảnh báo'}
                          </Badge>
                        </TD>
                        <TD>
                          <ul className="m-0 flex list-none flex-row flex-nowrap gap-4 p-0">
                            {row.validationErrors.map((err, eIdx) => (
                              <li key={eIdx} className={`whitespace-nowrap ${err.type === 'ERROR' ? 'text-status-danger' : 'text-status-warning'}`}>
                                <strong>{err.field}:</strong> {err.message}
                              </li>
                            ))}
                          </ul>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
