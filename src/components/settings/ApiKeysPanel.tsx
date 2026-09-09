'use client';

import { useEffect, useState } from 'react';
import { Plus, PencilSimple, Trash, Eye, EyeSlash, Copy, Check, ArrowsClockwise, Key } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import { toDateKey } from '@/lib/working-days';
import type { ApiKey, ApiKeyInput } from '@/lib/api-key-types';

type ApiKeySortKey = 'keyName' | 'appName' | 'status' | 'createdAt';

function generateRandomApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomStr = '';
  for (let i = 0; i < 28; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ttm_ak_${randomStr}`;
}

function buildEmptyForm(): ApiKeyInput {
  return {
    keyName: '',
    appName: '',
    apiKey: generateRandomApiKey(),
    isActive: true,
    isUnlimited: true,
    validFrom: toDateKey(new Date()),
    validTo: null,
  };
}

export function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ApiKeyInput>(buildEmptyForm());
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Track password visibility & copied state in table rows
  const [visibleKeyIds, setVisibleKeyIds] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchApiKeys = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/api-keys');
      if (res.ok) {
        setApiKeys(await res.json());
      }
    } catch {
      setMessage({ text: 'Lỗi khi tải danh sách API Key.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchApiKeys);
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(buildEmptyForm());
    setShowFormPassword(true);
    setShowModal(true);
  };

  const openEdit = (item: ApiKey) => {
    setEditingId(item.id);
    setForm({
      keyName: item.keyName,
      appName: item.appName,
      apiKey: item.apiKey,
      isActive: item.isActive,
      isUnlimited: item.isUnlimited,
      validFrom: item.validFrom ?? toDateKey(new Date()),
      validTo: item.validTo,
    });
    setShowFormPassword(false);
    setShowModal(true);
  };

  const handleGenerateKey = () => {
    setForm((prev) => ({ ...prev, apiKey: generateRandomApiKey() }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống khi lưu API Key.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật API Key.' : 'Đã tạo API Key mới thành công.', type: 'success' });
      setShowModal(false);
      fetchApiKeys();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: ApiKey) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa API Key "${item.keyName}" (${item.appName})?`)) return;
    try {
      const res = await fetch(`/api/admin/api-keys?id=${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ text: 'Đã xóa API Key.', type: 'success' });
        fetchApiKeys();
      } else {
        const result = await res.json();
        setMessage({ text: result.error || 'Xóa API Key thất bại.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    }
  };

  const toggleTableKeyVisibility = (id: number) => {
    setVisibleKeyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyKey = async (id: number, keyText: string) => {
    try {
      await navigator.clipboard.writeText(keyText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback if clipboard API not available
    }
  };

  const { sortKey, toggleSort, directionFor } = useSortableList<ApiKeySortKey>('keyName');
  const sortValue = (item: ApiKey, key: ApiKeySortKey): string =>
    key === 'status' ? (item.isActive ? 'active' : 'inactive') : String(item[key]);

  const sortedApiKeys = [...apiKeys].sort((a, b) =>
    compareValues(sortValue(a, sortKey), sortValue(b, sortKey), directionFor(sortKey) ?? 'asc')
  );

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-fb-blue" weight="bold" />
            <span>Quản lý API Key ({apiKeys.length})</span>
          </CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm API Key
          </Button>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Cấp và quản lý các mã API Key phục vụ xác thực đăng nhập từ các ứng dụng/domain khác tới <strong>ttm-tool</strong>.
            Chỉ những API Key đang Active và còn thời hạn hiệu lực mới được phép truy cập.
          </p>

          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : apiKeys.length === 0 ? (
            <EmptyState title="Chưa có API Key nào" description="Thêm API Key đầu tiên để cấp quyền đăng nhập cho ứng dụng bên ngoài." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={directionFor('keyName')} onClick={() => toggleSort('keyName')}>Tên API Key</TH>
                    <TH sortDirection={directionFor('appName')} onClick={() => toggleSort('appName')}>Ứng dụng</TH>
                    <TH>Mã API Key</TH>
                    <TH className="text-center" sortDirection={directionFor('status')} onClick={() => toggleSort('status')}>Trạng thái</TH>
                    <TH>Thời gian áp dụng</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedApiKeys.map((item, index) => {
                    const isKeyVisible = !!visibleKeyIds[item.id];
                    const isCopied = copiedId === item.id;
                    const maskedKey = item.apiKey.length > 12
                      ? `${item.apiKey.slice(0, 7)}••••••••${item.apiKey.slice(-4)}`
                      : '••••••••••••••••';

                    return (
                      <TR key={item.id}>
                        <TD>{index + 1}</TD>
                        <TD className="font-semibold text-fb-text-primary">{item.keyName}</TD>
                        <TD className="font-medium text-fb-blue">{item.appName}</TD>
                        <TD>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="rounded bg-fb-surface-muted px-2 py-1 border border-fb-border font-medium">
                              {isKeyVisible ? item.apiKey : maskedKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleTableKeyVisibility(item.id)}
                              className="text-fb-text-secondary hover:text-fb-text-primary p-1 rounded hover:bg-fb-control"
                              title={isKeyVisible ? 'Ẩn mã API Key' : 'Hiển thị mã API Key'}
                            >
                              {isKeyVisible ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(item.id, item.apiKey)}
                              className="text-fb-text-secondary hover:text-fb-text-primary p-1 rounded hover:bg-fb-control"
                              title="Sao chép API Key"
                            >
                              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </TD>
                        <TD className="text-center">
                          <Badge variant={item.isActive ? 'success' : 'neutral'}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD className="whitespace-nowrap text-xs">
                          {item.isUnlimited ? (
                            <Badge variant="info">Không giới hạn</Badge>
                          ) : (
                            <span className="font-medium text-fb-text-primary">
                              {item.validFrom || '—'} → {item.validTo || 'Không giới hạn'}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <div className="flex justify-center gap-2">
                            <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(item)}>
                              Sửa
                            </TableAction>
                            <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(item)}>
                              Xóa
                            </TableAction>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>

      {/* Form Modal: Add / Edit API Key */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Sửa API Key' : 'Thêm API Key Mới'}
        footer={
          <div className="flex justify-end gap-3 select-none">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={isSaving}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm mới'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 py-1">
          <Input
            label="Tên API Key"
            placeholder="Ví dụ: Key Đăng Nhập CRM"
            value={form.keyName}
            onChange={(e) => setForm((prev) => ({ ...prev, keyName: e.target.value }))}
            required
          />

          <Input
            label="Ứng dụng"
            placeholder="Ví dụ: CRM System, Mobile App, Core Domain..."
            value={form.appName}
            onChange={(e) => setForm((prev) => ({ ...prev, appName: e.target.value }))}
            required
          />

          {/* API Key Password input with Eye icon toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-fb-text-secondary">
              Mã API Key <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showFormPassword ? 'text' : 'password'}
                className="w-full h-10 rounded-md border border-fb-border bg-fb-surface px-3 pr-20 font-mono text-sm text-fb-text-primary focus:border-fb-blue focus:outline-none"
                placeholder="Nhập hoặc tạo tự động API key"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                required
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowFormPassword((prev) => !prev)}
                  className="p-1 text-fb-text-secondary hover:text-fb-text-primary rounded hover:bg-fb-control transition-colors"
                  title={showFormPassword ? 'Ẩn mã API Key' : 'Hiển thị mã API Key'}
                >
                  {showFormPassword ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  className="p-1 text-fb-blue hover:bg-fb-blue-soft rounded transition-colors"
                  title="Tạo mã ngẫu nhiên mới"
                >
                  <ArrowsClockwise className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-fb-text-muted">
              Mã dùng để truyền trong Header HTTP <code>X-API-Key</code> hoặc Authorization Token khi các ứng dụng gọi xác thực.
            </p>
          </div>

          {/* Active Status Checkbox */}
          <div className="flex items-center gap-2 pt-1 select-none">
            <input
              type="checkbox"
              id="api_key_is_active"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="size-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
            />
            <label htmlFor="api_key_is_active" className="text-sm font-medium text-fb-text-primary cursor-pointer">
              Đang hoạt động (Active)
            </label>
          </div>

          {/* Time Limit Settings */}
          <div className="flex flex-col gap-3 rounded-lg border border-fb-border bg-fb-surface-muted p-3">
            <div className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                id="api_key_is_unlimited"
                checked={form.isUnlimited}
                onChange={(e) => setForm((prev) => ({ ...prev, isUnlimited: e.target.checked }))}
                className="size-4 rounded border-fb-border text-fb-blue focus:ring-fb-blue"
              />
              <label htmlFor="api_key_is_unlimited" className="text-sm font-semibold text-fb-text-primary cursor-pointer">
                Không giới hạn thời gian (Mặc định)
              </label>
            </div>

            {!form.isUnlimited && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Input
                  label="Từ ngày (From Date)"
                  type="date"
                  value={form.validFrom || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                  required
                />
                <Input
                  label="Đến ngày (To Date)"
                  type="date"
                  value={form.validTo || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value || null }))}
                />
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
