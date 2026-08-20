"use client";

import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { FileDropzone } from '@/components/data-source/FileDropzone';
import { TableContainer, Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';

interface ImportRowError {
  message: string;
  rowNumber: number;
}

interface ImportResult {
  errors: ImportRowError[];
  importedCount: number;
  totalRows: number;
}

export function ImportComponentsTab() {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applySelectedFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setMessage({ type: 'error', text: 'Chỉ chấp nhận file định dạng .csv.' });
      return;
    }
    setFile(selectedFile);
    setMessage(null);
    setResult(null);
  };

  const clearFileSelection = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Vui lòng chọn file CSV để tiếp tục.' });
      return;
    }
    setIsImporting(true);
    setMessage(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/data-source/import-components', { method: 'POST', body: formData });
      const data: ImportResult | { error: string } = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: 'error' in data ? data.error : 'Lỗi hệ thống khi import Components.' });
        return;
      }
      const importResult = data as ImportResult;
      setResult(importResult);
      if (importResult.errors.length > 0) {
        setMessage({ type: 'error', text: `File có ${importResult.errors.length} dòng lỗi — chưa lưu dòng nào. Sửa file rồi import lại.` });
      } else {
        setMessage({ type: 'success', text: `Import thành công ${importResult.importedCount}/${importResult.totalRows} dòng vào danh mục Components.` });
        clearFileSelection();
      }
    } catch {
      setMessage({ type: 'error', text: 'Không thể kết nối API import Components.' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Import danh mục Components</CardTitle>
        </CardHeader>
        <CardBody className="gap-3">
          <p className="text-[11.5px] font-medium leading-relaxed text-fb-text-secondary">
            File CSV 2 cột: <code className="rounded bg-fb-surface-muted px-1.5 py-0.5 font-mono text-[10.5px]">project_key</code> và{' '}
            <code className="rounded bg-fb-surface-muted px-1.5 py-0.5 font-mono text-[10.5px]">component</code>. Mỗi dòng là 1 cặp
            project_key + component (không trùng lặp trong cùng file); project_key phải khớp một Dự án đang hoạt động. Dữ liệu được
            gộp (upsert) vào cùng danh mục Components đang tự động tích lũy từ import Issues.
          </p>
          <FileDropzone
            file={file}
            inputRef={fileInputRef}
            onChange={(event) => { if (event.target.files?.[0]) applySelectedFile(event.target.files[0]); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) applySelectedFile(event.dataTransfer.files[0]); }}
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
          <Button variant="primary" onClick={handleImport} disabled={!file || isImporting} isLoading={isImporting}>
            Import Components
          </Button>
        </CardFooter>
      </Card>

      {message && (
        <Alert variant={message.type} title={message.type === 'success' ? 'Thao tác thành công' : 'Không thể hoàn tất thao tác'}>
          {message.text}
        </Alert>
      )}

      {result && result.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết lỗi ({result.errors.length} dòng)</CardTitle>
          </CardHeader>
          <CardBody>
            <TableContainer className="max-h-[400px] overflow-y-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-[80px] text-center">Dòng</TH>
                    <TH>Lỗi</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.errors.map((error, index) => (
                    <TR key={index}>
                      <TD className="text-center font-bold text-fb-text-secondary">{error.rowNumber}</TD>
                      <TD className="text-status-danger">{error.message}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
