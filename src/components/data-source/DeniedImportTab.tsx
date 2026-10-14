'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle, MagnifyingGlass, Prohibit, Trash, Broom } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/dialogs';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { showToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { parseEpicKeyList } from '@/lib/import-admission-rules';

/**
 * Tab "Từ chối import" (Quản trị nguồn dữ liệu, SUPERADMIN) — the Epics the import adapter keeps out
 * of the database, the A/B dates of its automatic rules and the scan of the Epics already stored.
 * Denying an Epic deletes its data (Epic deletion) after a confirmation popup; caches are NOT rebuilt
 * — a toast reminds the admin to run them by hand.
 */

interface DeniedImportEpic {
  addedBy: string | null;
  allowImport: boolean;
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  hasData: boolean;
  ideaApprovedDate: string | null;
  lastDeletedAt: string | null;
  r4gDate: string | null;
  reason: string | null;
  requestingUnit: string | null;
  source: 'AUTO_RULE' | 'MANUAL' | 'SEED';
  startDate: string | null;
  status: string | null;
  summary: string | null;
}

interface AdmissionSettings {
  createdBefore: string | null;
  releasedDueBefore: string | null;
}

interface DeletionPreview {
  epicsWithoutData: string[];
  issues: { epicKey: string; issueKey: string; issueType: string }[];
  tables: { label: string; rows: number; table: string }[];
  totalRows: number;
}

interface DeletionResult {
  epicKeys: string[];
  issueKeys: string[];
  totalRows: number;
}

interface ScanCandidate {
  epicKey: string;
  reason: string;
  status: string;
  summary: string;
}

const PAGE_SIZE = 25;

const SOURCE_LABEL: Record<DeniedImportEpic['source'], string> = {
  AUTO_RULE: 'Rule tự động',
  MANUAL: 'Thủ công',
  SEED: 'Rà soát 14/10',
};

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Lỗi HTTP ${res.status}`);
  return body as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, method };
}

function toastDeleted(result: DeletionResult | null): void {
  if (!result || result.epicKeys.length === 0) return;
  showToast(`Đã xóa dữ liệu ${result.epicKeys.length} Epic (${result.issueKeys.length} issue). Hãy chạy lại cache để cập nhật số liệu.`, 7000);
}

/** Confirmation text of an Epic deletion, from its preview. */
function describeDeletion(action: string, epicKeys: readonly string[], preview: DeletionPreview): string {
  const tables = preview.tables.filter((table) => table.rows > 0).map((table) => `• ${table.label}: ${table.rows}`).join('\n');
  const withoutData = preview.epicsWithoutData.length > 0 ? `\n\nChưa có dữ liệu trong CSDL: ${preview.epicsWithoutData.join(', ')}.` : '';
  return `${action} ${epicKeys.length} Epic (${epicKeys.join(', ')}) và XÓA VĨNH VIỄN dữ liệu của chúng ở mọi lớp dữ liệu: `
    + `${preview.issues.length} issue (Epic, Story, Subtask), ${preview.totalRows} dòng dữ liệu.`
    + (tables ? `\n\n${tables}` : '')
    + withoutData
    + '\n\nKhông thể hoàn tác. Cache không tự chạy lại — hãy chạy lại cache sau khi xóa.';
}

export function DeniedImportTab() {
  const keysFieldId = useId();
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [epics, setEpics] = useState<DeniedImportEpic[]>([]);
  const [settings, setSettings] = useState<AdmissionSettings>({ createdBefore: null, releasedDueBefore: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const [keysInput, setKeysInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scan, setScan] = useState<{ candidates: ScanCandidate[]; selected: Set<string> } | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/data-source/denied-import');
      if (res.status === 401 || res.status === 403) {
        setCanManage(false);
        return;
      }
      setCanManage(true);
      const body = await res.json();
      if (!res.ok) {
        setMessage({ text: body.error || 'Không tải được danh sách Từ chối import.', type: 'error' });
        return;
      }
      setEpics(body.epics);
      setSettings(body.settings);
      setSelected((current) => new Set([...current].filter((key) => body.epics.some((epic: DeniedImportEpic) => epic.epicKey === key))));
    } catch {
      setCanManage(true);
      setMessage({ text: 'Không thể kết nối API Từ chối import.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Deferring the initial request prevents a synchronous state update during effect setup.
    void Promise.resolve().then(load);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi-VN');
    if (!term) return epics;
    return epics.filter((epic) => [epic.epicKey, epic.summary, epic.status, epic.requestingUnit, epic.reason]
      .some((value) => value?.toLocaleLowerCase('vi-VN').includes(term)));
  }, [epics, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedEpics = epics.filter((epic) => selected.has(epic.epicKey));
  // "Xóa dữ liệu còn tồn tại" works on the selection when there is one, else on the whole list.
  const purgeTargets = (selectedEpics.length > 0 ? selectedEpics : epics).filter((epic) => epic.hasData && !epic.allowImport);

  /** Runs one action with the shared busy flag / error message, then reloads the list. */
  const run = async (work: () => Promise<void>) => {
    setIsBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Thao tác thất bại.', type: 'error' });
    } finally {
      setIsBusy(false);
      await load();
    }
  };

  const previewOf = (epicKeys: readonly string[]) => requestJson<DeletionPreview>(`/api/data-source/epic-deletion?keys=${encodeURIComponent(epicKeys.join(','))}`);

  const handleAdd = () => run(async () => {
    const { invalid, keys } = parseEpicKeyList(keysInput);
    if (invalid.length > 0) throw new Error(`Epic key không hợp lệ: ${invalid.join(', ')}.`);
    if (keys.length === 0) throw new Error('Nhập ít nhất 1 Epic key.');
    const preview = await previewOf(keys);
    if (!(await confirmDialog({ confirmLabel: 'Từ chối & xóa dữ liệu', description: describeDeletion('Thêm vào Từ chối import', keys, preview), title: 'Từ chối import Epic' }))) return;
    toastDeleted(await requestJson<DeletionResult>('/api/data-source/denied-import', jsonInit('POST', { epicKeys: keys, reason: reasonInput })));
    setKeysInput('');
    setReasonInput('');
  });

  const handleAllowance = (epicKeys: string[], allowImport: boolean) => run(async () => {
    if (allowImport) {
      const ok = await confirmDialog({
        confirmLabel: 'Cho phép import',
        description: `Cho phép import lại ${epicKeys.length} Epic (${epicKeys.join(', ')}) và miễn trừ khỏi rule tự động? Dữ liệu chỉ quay lại khi Epic có trong file import tiếp theo (Epic được cập nhật trên Jira, hoặc import lại toàn bộ).`,
        title: 'Cho phép import',
        tone: 'primary',
      });
      if (!ok) return;
      await requestJson('/api/data-source/denied-import', jsonInit('PATCH', { allowImport: true, epicKeys }));
      setMessage({ text: `Đã cho phép import ${epicKeys.length} Epic.`, type: 'success' });
      return;
    }
    const preview = await previewOf(epicKeys);
    if (!(await confirmDialog({ confirmLabel: 'Từ chối & xóa dữ liệu', description: describeDeletion('Từ chối import lại', epicKeys, preview), title: 'Từ chối import Epic' }))) return;
    const body = await requestJson<{ deletion: DeletionResult | null }>('/api/data-source/denied-import', jsonInit('PATCH', { allowImport: false, epicKeys }));
    toastDeleted(body.deletion);
  });

  const handleRemove = (epicKeys: string[]) => run(async () => {
    const ok = await confirmDialog({
      confirmLabel: 'Xóa khỏi danh sách',
      description: `Xóa ${epicKeys.length} Epic (${epicKeys.join(', ')}) khỏi danh sách Từ chối import? Dữ liệu đã xóa không tự quay lại; nếu Epic còn vi phạm rule A/B, lần import sau sẽ tự từ chối lại. Muốn miễn trừ hẳn, hãy bật "Cho phép import" thay vì xóa.`,
      title: 'Xóa khỏi Từ chối import',
    });
    if (!ok) return;
    const body = await requestJson<{ removed: number }>('/api/data-source/denied-import', jsonInit('DELETE', { epicKeys }));
    setSelected(new Set());
    setMessage({ text: `Đã xóa ${body.removed} Epic khỏi danh sách.`, type: 'success' });
  });

  const handlePurgeRemaining = (epicKeys: string[]) => run(async () => {
    if (epicKeys.length === 0) return;
    const preview = await previewOf(epicKeys);
    if (!(await confirmDialog({ confirmLabel: 'Xóa dữ liệu', description: describeDeletion('Xóa dữ liệu còn tồn tại của', epicKeys, preview), title: 'Xóa dữ liệu Epic bị từ chối' }))) return;
    toastDeleted(await requestJson<DeletionResult>('/api/data-source/denied-import/purge', jsonInit('POST', { epicKeys })));
  });

  const handleSaveSettings = () => run(async () => {
    const saved = await requestJson<AdmissionSettings>('/api/data-source/denied-import/settings', jsonInit('PUT', settings));
    setSettings(saved);
    setMessage({ text: 'Đã lưu cấu hình. Áp dụng từ lần import tiếp theo — bấm "Quét lại" để áp dụng cho dữ liệu đang có.', type: 'success' });
  });

  const handleScan = () => run(async () => {
    const body = await requestJson<{ candidates: ScanCandidate[] }>('/api/data-source/denied-import/scan');
    if (body.candidates.length === 0) {
      setMessage({ text: 'Không có Epic nào trong CSDL vi phạm rule A/B (ngoài các Epic đã có trong danh sách).', type: 'success' });
      return;
    }
    setScan({ candidates: body.candidates, selected: new Set(body.candidates.map((candidate) => candidate.epicKey)) });
  });

  const handleDenyScanned = () => {
    if (!scan) return;
    const epicKeys = [...scan.selected];
    setScan(null);
    void run(async () => {
      if (epicKeys.length === 0) return;
      const preview = await previewOf(epicKeys);
      if (!(await confirmDialog({ confirmLabel: 'Từ chối & xóa dữ liệu', description: describeDeletion('Từ chối import (rule tự động)', epicKeys, preview), title: 'Từ chối import Epic' }))) return;
      toastDeleted(await requestJson<DeletionResult>('/api/data-source/denied-import/scan', jsonInit('POST', { epicKeys })));
    });
  };

  const toggleSelected = (epicKey: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(epicKey)) next.delete(epicKey);
    else next.add(epicKey);
    return next;
  });
  const allPageSelected = pageRows.length > 0 && pageRows.every((epic) => selected.has(epic.epicKey));
  const togglePage = () => setSelected((current) => {
    const next = new Set(current);
    for (const epic of pageRows) {
      if (allPageSelected) next.delete(epic.epicKey);
      else next.add(epic.epicKey);
    }
    return next;
  });

  if (canManage === false) return <EmptyState title="Không có quyền truy cập" description="Chỉ CBQL Phòng (SUPERADMIN) mới có thể quản lý danh sách Từ chối import." />;

  return (
    <div className="flex flex-col gap-6">
      {message && <Alert title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rule tự động</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">
              Chỉ nhận Epic có Created ≥ ngày Created; Epic Released / MVP Done chỉ nhận khi Due Date ≥ ngày Due Date (Due trống thì xét R4G Date).
              Epic vi phạm bị từ chối khi import và tự thêm vào danh sách bên dưới. Để trống ngày = tắt rule.
            </p>
          </div>
        </CardHeader>
        {/* .ui-field is width:100% — every field sits in a sized box so the whole row stays on one line. */}
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[170px] shrink-0">
              <Input
                label="Ngày Created >="
                onChange={(event) => setSettings({ ...settings, createdBefore: event.target.value || null })}
                type="date"
                value={settings.createdBefore ?? ''}
              />
            </div>
            <div className="w-[170px] shrink-0">
              <Input
                label="Ngày Due Date >="
                onChange={(event) => setSettings({ ...settings, releasedDueBefore: event.target.value || null })}
                type="date"
                value={settings.releasedDueBefore ?? ''}
              />
            </div>
            <Button variant="outline" disabled={isBusy} onClick={handleSaveSettings}>Lưu cấu hình</Button>
            <Button variant="outline" disabled={isBusy} icon={<MagnifyingGlass className="size-4" />} onClick={handleScan}>Quét lại CSDL</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Thêm Epic vào danh sách từ chối import</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">
              Nhập Epic key cách nhau bởi dấu phẩy, khoảng trắng hoặc xuống dòng. Thêm Epic sẽ <strong>xóa vĩnh viễn</strong> dữ liệu của nó (Epic, Story, Subtask); cache không tự chạy lại.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <FormField id={keysFieldId} label="Epic key">
                <textarea
                  className="ui-input form-control-compact resize-y font-mono placeholder:text-fb-text-placeholder"
                  id={keysFieldId}
                  onChange={(event) => setKeysInput(event.target.value)}
                  placeholder="WM-27125, API-166546"
                  rows={1}
                  value={keysInput}
                />
              </FormField>
            </div>
            <div className="w-[300px] shrink-0">
              <Input label="Lý do" onChange={(event) => setReasonInput(event.target.value)} value={reasonInput} />
            </div>
            <Button variant="danger" disabled={isBusy || keysInput.trim() === ''} icon={<Prohibit className="size-4" />} onClick={handleAdd}>Thêm vào danh sách</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Danh sách Epic từ chối import ({epics.length})</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">
              Epic trong danh sách (và Story, Subtask của chúng) bị loại khỏi mọi lần import. Rê chuột lên badge Nguồn để xem lý do.
            </p>
          </div>
        </CardHeader>
        <CardBody className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[280px] shrink-0">
              <Input onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm Epic key, summary, status…" value={search} />
            </div>
            <span className="text-[12px] text-fb-text-secondary">Đã chọn {selected.size}</span>
            <Button variant="outline" disabled={isBusy || selected.size === 0} onClick={() => handleAllowance([...selected], true)} size="sm">Cho phép import</Button>
            <Button variant="outline" disabled={isBusy || selected.size === 0} onClick={() => handleAllowance([...selected], false)} size="sm">Từ chối lại</Button>
            <Button variant="danger" disabled={isBusy || selected.size === 0} icon={<Trash className="size-4" />} onClick={() => handleRemove([...selected])} size="sm">Xóa theo lô</Button>
            <Button
              variant="outline"
              disabled={isBusy || purgeTargets.length === 0}
              icon={<Broom className="size-4" />}
              onClick={() => handlePurgeRemaining(purgeTargets.map((epic) => epic.epicKey))}
              size="sm"
              title="Chạy Epic deletion cho các Epic bị từ chối mà CSDL vẫn còn dữ liệu (ví dụ sau khi chạy migration trên CSDL khác)"
            >
              Xóa dữ liệu còn tồn tại ({purgeTargets.length})
            </Button>
          </div>

          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState description="Thêm Epic key ở trên, hoặc bấm Quét lại CSDL." title="Chưa có Epic nào bị từ chối import" />
          ) : (
            <TableContainer>
              {/* Auto layout + ui-table-compact: columns size to their content and share the spare width,
                  Summary / Đơn vị yêu cầu are capped and truncate (full text on hover), so the table stays
                  balanced and fits the tab without a horizontal scrollbar. The reason sits in the badge tooltip. */}
              <Table className="ui-table-compact">
                <THead>
                  <TR>
                    <TH className="w-[28px]"><input aria-label="Chọn cả trang" checked={allPageSelected} onChange={togglePage} type="checkbox" /></TH>
                    <TH>Epic</TH>
                    <TH>Summary</TH>
                    <TH>Status</TH>
                    <TH>Đơn vị yêu cầu</TH>
                    <TH>Created</TH>
                    <TH>Duyệt ý tưởng</TH>
                    <TH>Start</TH>
                    <TH>R4G</TH>
                    <TH>Due</TH>
                    <TH>Nguồn</TH>
                    <TH className="text-center">Cho phép import</TH>
                    <TH className="text-center">Dữ liệu CSDL</TH>
                    <TH className="w-[40px]"><span className="sr-only">Hành động</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {pageRows.map((epic) => (
                    <TR key={epic.epicKey}>
                      <TD><input aria-label={`Chọn ${epic.epicKey}`} checked={selected.has(epic.epicKey)} onChange={() => toggleSelected(epic.epicKey)} type="checkbox" /></TD>
                      <TD className="font-bold text-fb-blue">{epic.epicKey}</TD>
                      <TD title={epic.summary ?? undefined}><div className="max-w-[220px] truncate">{epic.summary ?? '—'}</div></TD>
                      <TD>{epic.status ?? '—'}</TD>
                      <TD title={epic.requestingUnit ?? undefined}><div className="max-w-[160px] truncate">{epic.requestingUnit ?? '—'}</div></TD>
                      <TD>{formatDate(epic.createdDate)}</TD>
                      <TD>{formatDate(epic.ideaApprovedDate)}</TD>
                      <TD>{formatDate(epic.startDate)}</TD>
                      <TD>{formatDate(epic.r4gDate)}</TD>
                      <TD>{formatDate(epic.dueDate)}</TD>
                      <TD>
                        <Tooltip className="inline-flex w-auto" content={epic.reason ?? ''} disabled={!epic.reason} multiline side="left">
                          <Badge className={epic.reason ? 'cursor-help' : undefined} variant={epic.source === 'AUTO_RULE' ? 'warning' : 'neutral'}>{SOURCE_LABEL[epic.source]}</Badge>
                        </Tooltip>
                      </TD>
                      <TD className="text-center">
                        <input
                          aria-label={`Cho phép import ${epic.epicKey}`}
                          checked={epic.allowImport}
                          disabled={isBusy}
                          onChange={(event) => handleAllowance([epic.epicKey], event.target.checked)}
                          type="checkbox"
                        />
                      </TD>
                      <TD className="text-center">
                        {epic.hasData
                          ? <Badge variant={epic.allowImport ? 'info' : 'danger'}>Còn</Badge>
                          : <span className="inline-flex items-center gap-1 text-[11px] text-status-success"><CheckCircle className="size-3.5" weight="fill" />Đã xóa</span>}
                      </TD>
                      <TD className="text-center">
                        <TableAction
                          aria-label={`Xóa ${epic.epicKey} khỏi danh sách`}
                          className="px-1.5"
                          disabled={isBusy}
                          icon={<Trash className="size-4" />}
                          onClick={() => handleRemove([epic.epicKey])}
                          title="Xóa khỏi danh sách"
                          variant="danger"
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
        {!isLoading && filtered.length > PAGE_SIZE && (
          <CardFooter>
            <Pagination currentPage={currentPage} itemLabel="Epic" onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={filtered.length} />
          </CardFooter>
        )}
      </Card>

      <Modal
        footer={(
          <>
            <Button variant="outline" onClick={() => setScan(null)}>Đóng</Button>
            <Button variant="danger" disabled={!scan || scan.selected.size === 0} onClick={handleDenyScanned}>Từ chối {scan?.selected.size ?? 0} Epic</Button>
          </>
        )}
        isOpen={scan !== null}
        maxWidth="2xl"
        onClose={() => setScan(null)}
        title="Epic trong CSDL vi phạm rule A/B"
      >
        {scan && (
          <TableContainer>
            <Table className="min-w-[760px]">
              <THead>
                <TR>
                  <TH className="w-[36px]">
                    <input
                      aria-label="Chọn tất cả"
                      checked={scan.selected.size === scan.candidates.length}
                      onChange={(event) => setScan({ ...scan, selected: new Set(event.target.checked ? scan.candidates.map((candidate) => candidate.epicKey) : []) })}
                      type="checkbox"
                    />
                  </TH>
                  <TH className="w-[120px]">Epic</TH>
                  <TH className="w-[240px]">Summary</TH>
                  <TH className="w-[100px]">Status</TH>
                  <TH>Vi phạm</TH>
                </TR>
              </THead>
              <TBody>
                {scan.candidates.map((candidate) => (
                  <TR key={candidate.epicKey}>
                    <TD>
                      <input
                        aria-label={`Chọn ${candidate.epicKey}`}
                        checked={scan.selected.has(candidate.epicKey)}
                        onChange={() => {
                          const next = new Set(scan.selected);
                          if (next.has(candidate.epicKey)) next.delete(candidate.epicKey);
                          else next.add(candidate.epicKey);
                          setScan({ ...scan, selected: next });
                        }}
                        type="checkbox"
                      />
                    </TD>
                    <TD className="font-bold text-fb-blue">{candidate.epicKey}</TD>
                    <TD className="truncate" title={candidate.summary}>{candidate.summary}</TD>
                    <TD>{candidate.status}</TD>
                    <TD className="text-[11.5px] text-fb-text-secondary">{candidate.reason}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Modal>
    </div>
  );
}
