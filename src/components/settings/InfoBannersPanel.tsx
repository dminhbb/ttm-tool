'use client';

import { useEffect, useState } from 'react';
import { Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import { stripHtmlToText } from '@/lib/sanitize-html';
import { toDateKey } from '@/lib/working-days';
import { PAGE_HEADERS } from '@/lib/app-screens';
import type { BannerType, InfoBanner, InfoBannerInput } from '@/lib/info-banner-types';

type BannerSortKey = 'name' | 'status' | 'bannerType' | 'startDate';

const SCREEN_OPTIONS = Object.entries(PAGE_HEADERS).map(([path, { title }]) => ({ value: path, label: `${title} (${path})` }));

const BANNER_TYPE_OPTIONS: { value: BannerType; label: string }[] = [
  { value: 'DEFAULT', label: 'Mặc định (áp dụng mọi màn hình)' },
  { value: 'PER_SCREEN', label: 'Theo màn hình' },
];

function buildEmptyForm(): InfoBannerInput {
  return {
    bannerType: 'PER_SCREEN',
    endDate: null,
    isActive: true,
    message: '',
    name: '',
    screenKey: SCREEN_OPTIONS[0]?.value ?? null,
    startDate: toDateKey(new Date()),
  };
}

export function InfoBannersPanel() {
  const [banners, setBanners] = useState<InfoBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InfoBannerInput>(buildEmptyForm());
  const [isSaving, setIsSaving] = useState(false);

  const fetchBanners = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/info-banners');
      if (res.ok) setBanners(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchBanners);
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(buildEmptyForm());
    setShowModal(true);
  };

  const openEdit = (banner: InfoBanner) => {
    setEditingId(banner.id);
    setForm({
      bannerType: banner.bannerType,
      endDate: banner.endDate,
      isActive: banner.isActive,
      message: banner.message,
      name: banner.name,
      screenKey: banner.screenKey ?? SCREEN_OPTIONS[0]?.value ?? null,
      startDate: banner.startDate,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/info-banners', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Banner thông báo.' : 'Đã thêm Banner thông báo mới.', type: 'success' });
      setShowModal(false);
      fetchBanners();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (banner: InfoBanner) => {
    if (banner.bannerType === 'DEFAULT') return;
    if (!confirm(`Xóa banner "${banner.name}"?`)) return;
    const res = await fetch(`/api/info-banners?id=${banner.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Banner thông báo.', type: 'success' });
      fetchBanners();
    } else {
      const result = await res.json();
      setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' });
    }
  };

  const { sortKey, toggleSort, directionFor } = useSortableList<BannerSortKey>('bannerType');
  const sortValue = (banner: InfoBanner, key: BannerSortKey): string =>
    key === 'status' ? (banner.isActive ? 'active' : 'inactive') : String(banner[key]);
  // Default banner always first regardless of the chosen sort column — it's a singleton, sorting
  // it in with the rest would bury it and defeat "highlight it in the list".
  const sortedBanners = [...banners].sort((a, b) => {
    if (a.bannerType === 'DEFAULT') return -1;
    if (b.bannerType === 'DEFAULT') return 1;
    return compareValues(sortValue(a, sortKey), sortValue(b, sortKey), directionFor(sortKey) ?? 'asc');
  });

  const screenLabel = (screenKey: string | null) => (screenKey ? PAGE_HEADERS[screenKey]?.title ?? screenKey : '—');

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Banner thông báo ({banners.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Banner
          </Button>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Banner &quot;Mặc định&quot; hiện trên mọi màn hình (chỉ 1 banner được ở loại này — được đánh dấu, không thể xóa).
            Banner &quot;Theo màn hình&quot; chỉ hiện thêm trên đúng màn hình được gán. Chỉ hiện trong khoảng Ngày bắt đầu–Ngày kết thúc và khi đang Active.
          </p>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : banners.length === 0 ? (
            <EmptyState title="Chưa có Banner thông báo nào" description="Thêm banner mặc định hoặc gán riêng cho 1 màn hình." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={directionFor('name')} onClick={() => toggleSort('name')}>Tên banner</TH>
                    <TH sortDirection={directionFor('bannerType')} onClick={() => toggleSort('bannerType')}>Loại</TH>
                    <TH>Màn hình</TH>
                    <TH className="text-center" sortDirection={directionFor('status')} onClick={() => toggleSort('status')}>Trạng thái</TH>
                    <TH sortDirection={directionFor('startDate')} onClick={() => toggleSort('startDate')}>Thời gian áp dụng</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedBanners.map((banner, index) => (
                    <TR key={banner.id} className={banner.bannerType === 'DEFAULT' ? 'bg-fb-blue-soft' : undefined}>
                      <TD>{index + 1}</TD>
                      <TD className="max-w-[220px] truncate font-medium" title={stripHtmlToText(banner.message)}>{banner.name}</TD>
                      <TD>{banner.bannerType === 'DEFAULT' ? <Badge variant="info">Mặc định</Badge> : 'Theo màn hình'}</TD>
                      <TD>{banner.bannerType === 'DEFAULT' ? 'Tất cả' : screenLabel(banner.screenKey)}</TD>
                      <TD className="text-center"><Badge variant={banner.isActive ? 'success' : 'neutral'}>{banner.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD className="whitespace-nowrap">{banner.startDate} → {banner.endDate ?? 'Không giới hạn'}</TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(banner)}>Sửa</TableAction>
                          <TableAction
                            variant="danger"
                            icon={<Trash className="w-4 h-4" />}
                            disabled={banner.bannerType === 'DEFAULT'}
                            title={banner.bannerType === 'DEFAULT' ? 'Không thể xóa banner mặc định' : undefined}
                            onClick={() => handleDelete(banner)}
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

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Cập nhật Banner thông báo' : 'Thêm Banner thông báo mới'}
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
            label="Tên banner"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <RichTextEditor
            id="info-banner-message"
            label="Nội dung banner"
            required
            singleLine
            placeholder="Nhập nội dung banner…"
            value={form.message}
            onChange={(html) => setForm({ ...form, message: html })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Loại banner"
              options={BANNER_TYPE_OPTIONS}
              value={form.bannerType}
              onChange={(event) => setForm({ ...form, bannerType: event.target.value as BannerType })}
            />
            {form.bannerType === 'PER_SCREEN' && (
              <Select
                label="Màn hình áp dụng"
                required
                options={SCREEN_OPTIONS}
                value={form.screenKey ?? ''}
                onChange={(event) => setForm({ ...form, screenKey: event.target.value })}
              />
            )}
          </div>
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
              placeholder="Để trống = không giới hạn"
              value={form.endDate ?? ''}
              onChange={(event) => setForm({ ...form, endDate: event.target.value || null })}
            />
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            Đang hoạt động (Active)
          </label>
        </div>
      </Modal>
    </div>
  );
}
