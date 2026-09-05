'use client';

import { useEffect, useState } from 'react';
import { Eye, Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import { addWorkingDays, toDateKey } from '@/lib/working-days';
import { AdPopupCard } from '@/components/layout/AdPopupCard';
import type { AdPopup, AdPopupInput } from '@/lib/ad-popup-types';

type PopupSortKey = 'campaignName' | 'status' | 'startDate' | 'maxImpressions';

const DEFAULT_MAX_IMPRESSIONS = 2;
const DEFAULT_DURATION_WORKING_DAYS = 3;
const DEFAULT_TIMEOUT_SECONDS = 15;

/** Ngày bắt đầu mặc định = hôm nay, ngày kết thúc mặc định = hôm nay + 3 ngày làm việc (chỉ trừ
 * thứ 7/CN — form này không tải lịch nghỉ lễ, chỉ là gợi ý ban đầu, admin có thể tự chỉnh trước
 * khi lưu). */
function buildEmptyForm(): AdPopupInput {
  const today = new Date();
  return {
    campaignName: '',
    clickUrl: '',
    endDate: toDateKey(addWorkingDays(today, DEFAULT_DURATION_WORKING_DAYS)),
    imageUrl: '',
    isActive: true,
    maxImpressions: DEFAULT_MAX_IMPRESSIONS,
    message: '',
    startDate: toDateKey(today),
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  };
}

export function AdPopupsPanel() {
  const [popups, setPopups] = useState<AdPopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AdPopupInput>(buildEmptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fetchPopups = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ad-popups');
      if (res.ok) setPopups(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchPopups);
  }, []);

  // Faithful preview: auto-closes on the same schedule the real popup would (no impression call,
  // unlike AdPopupDisplay — this is just admin-facing, not a real show).
  useEffect(() => {
    if (!isPreviewOpen) return undefined;
    const timer = setTimeout(() => setIsPreviewOpen(false), (form.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS) * 1000);
    return () => clearTimeout(timer);
  }, [isPreviewOpen, form.timeoutSeconds]);

  const openCreate = () => {
    setEditingId(null);
    setForm(buildEmptyForm());
    setShowModal(true);
  };

  const openEdit = (popup: AdPopup) => {
    setEditingId(popup.id);
    setForm({
      campaignName: popup.campaignName,
      clickUrl: popup.clickUrl,
      endDate: popup.endDate,
      imageUrl: popup.imageUrl,
      isActive: popup.isActive,
      maxImpressions: popup.maxImpressions,
      message: popup.message,
      startDate: popup.startDate,
      timeoutSeconds: popup.timeoutSeconds,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/ad-popups', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Popup quảng cáo.' : 'Đã thêm Popup quảng cáo mới.', type: 'success' });
      setShowModal(false);
      fetchPopups();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (popup: AdPopup) => {
    if (!confirm(`Xóa campaign "${popup.campaignName}"?`)) return;
    const res = await fetch(`/api/ad-popups?id=${popup.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Popup quảng cáo.', type: 'success' });
      fetchPopups();
    } else {
      const result = await res.json();
      setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' });
    }
  };

  const { sortKey, toggleSort, directionFor } = useSortableList<PopupSortKey>('startDate');
  const sortValue = (popup: AdPopup, key: PopupSortKey): string | number =>
    key === 'status' ? (popup.isActive ? 'active' : 'inactive') : popup[key];
  const sortedPopups = [...popups].sort((a, b) => compareValues(sortValue(a, sortKey), sortValue(b, sortKey), directionFor(sortKey) ?? 'asc'));

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Popup quảng cáo ({popups.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Popup quảng cáo
          </Button>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Hiển thị cho user sau khi đăng nhập — thông điệp kèm ảnh minh họa (nếu có), tự đóng sau &quot;Thời gian timeout&quot; hoặc bấm nút X. Chỉ hiện trong khoảng Ngày bắt đầu–Ngày kết thúc, và tối đa &quot;Số lần hiện tối đa&quot; lượt cho mỗi user.
          </p>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : popups.length === 0 ? (
            <EmptyState title="Chưa có Popup quảng cáo nào" description="Thêm 1 campaign để hiển thị thông điệp cho user sau khi đăng nhập." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={directionFor('campaignName')} onClick={() => toggleSort('campaignName')}>Campaign</TH>
                    <TH className="text-center" sortDirection={directionFor('status')} onClick={() => toggleSort('status')}>Trạng thái</TH>
                    <TH sortDirection={directionFor('startDate')} onClick={() => toggleSort('startDate')}>Thời gian áp dụng</TH>
                    <TH className="text-center" sortDirection={directionFor('maxImpressions')} onClick={() => toggleSort('maxImpressions')}>Số lần hiện tối đa</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedPopups.map((popup, index) => (
                    <TR key={popup.id}>
                      <TD>{index + 1}</TD>
                      <TD className="max-w-[220px] truncate font-medium" title={popup.message}>{popup.campaignName}</TD>
                      <TD className="text-center"><Badge variant={popup.isActive ? 'success' : 'neutral'}>{popup.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD className="whitespace-nowrap">{popup.startDate} → {popup.endDate}</TD>
                      <TD className="text-center">{popup.maxImpressions}</TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(popup)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(popup)}>Xóa</TableAction>
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

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Cập nhật Popup quảng cáo' : 'Thêm Popup quảng cáo mới'}
        maxWidth="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="ui-form flex flex-col gap-4">
          <Input
            label="Tên campaign"
            required
            value={form.campaignName}
            onChange={(event) => setForm({ ...form, campaignName: event.target.value })}
          />
          <FormField id="ad-popup-message" label="Nội dung thông điệp" required>
            <textarea
              className="ui-textarea form-control-compact"
              rows={4}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
            />
          </FormField>
          <Input
            label="URL ảnh đính kèm"
            placeholder="https://..."
            value={form.imageUrl}
            onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
          />
          <Input
            label="URL khi click ảnh/thông điệp"
            placeholder="https://..."
            value={form.clickUrl}
            onChange={(event) => setForm({ ...form, clickUrl: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Ngày bắt đầu"
              required
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
            <Input
              type="date"
              label="Ngày kết thúc"
              required
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              type="number"
              min={1}
              label="Số lần hiện tối đa (mỗi user)"
              required
              value={form.maxImpressions}
              onChange={(event) => setForm({ ...form, maxImpressions: parseInt(event.target.value, 10) || 1 })}
            />
            <Input
              type="number"
              min={1}
              label="Thời gian timeout (giây)"
              required
              helperText="Thời gian popup tự đóng nếu user không bấm X"
              value={form.timeoutSeconds}
              onChange={(event) => setForm({ ...form, timeoutSeconds: parseInt(event.target.value, 10) || 1 })}
            />
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            Đang hoạt động (Active)
          </label>
          <Button type="button" variant="outline" icon={<Eye className="w-4 h-4" weight="bold" />} onClick={() => setIsPreviewOpen(true)}>
            Test Popup
          </Button>
        </div>
      </Modal>

      {isPreviewOpen && (
        <AdPopupCard
          campaignName={form.campaignName || 'Xem thử'}
          clickUrl={form.clickUrl}
          imageUrl={form.imageUrl}
          message={form.message || '(Chưa nhập nội dung thông điệp)'}
          onDismiss={() => setIsPreviewOpen(false)}
          timeoutSeconds={form.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS}
        />
      )}
    </div>
  );
}
