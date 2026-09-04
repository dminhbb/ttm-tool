'use client';

import { useEffect, useState } from 'react';
import { Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { Holiday, HolidayInput } from '@/lib/master-data-types';

type HolidaySortKey = 'name' | 'holidayType' | 'startDate' | 'endDate' | 'status';

const EMPTY_FORM: HolidayInput = {
  description: '',
  endDate: '',
  holidayType: 'COMPANY',
  isActive: true,
  isMultiDay: false,
  name: '',
  startDate: '',
};

const HOLIDAY_TYPE_OPTIONS = [
  { value: 'PUBLIC', label: 'Ngày lễ quốc gia' },
  { value: 'COMPANY', label: 'Nghỉ công ty' },
  { value: 'OTHER', label: 'Khác' },
];

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export interface HolidaysPanelProps {
  year: number;
}

export function HolidaysPanel({ year }: HolidaysPanelProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HolidayInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchHolidays = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/holidays?year=${year}`);
      if (res.ok) setHolidays(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchHolidays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setForm({
      description: holiday.description,
      endDate: holiday.endDate,
      holidayType: holiday.holidayType,
      isActive: holiday.isActive,
      isMultiDay: holiday.isMultiDay,
      name: holiday.name,
      startDate: holiday.startDate,
    });
    setShowModal(true);
  };

  const toggleMultiDay = (checked: boolean) => {
    setForm((current) => ({ ...current, isMultiDay: checked, endDate: checked ? current.endDate : current.startDate }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/holidays', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Holiday.' : 'Đã tạo Holiday mới.', type: 'success' });
      setShowModal(false);
      fetchHolidays();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const { sortKey: holidaySortKey, toggleSort: toggleHolidaySort, directionFor: holidaySortDirection } = useSortableList<HolidaySortKey>('startDate');
  const holidaySortValue = (holiday: Holiday, key: HolidaySortKey): string => (key === 'status' ? (holiday.isActive ? 'active' : 'inactive') : holiday[key]);
  const sortedHolidays = [...holidays].sort((a, b) => compareValues(holidaySortValue(a, holidaySortKey), holidaySortValue(b, holidaySortKey), holidaySortDirection(holidaySortKey) ?? 'asc'));

  const handleDelete = async (holiday: Holiday) => {
    if (!confirm(`Xóa Holiday "${holiday.name}"?`)) return;
    const res = await fetch(`/api/holidays?id=${holiday.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Holiday.', type: 'success' });
      fetchHolidays();
    } else {
      const result = await res.json();
      setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quản lý Holiday ({holidays.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Holiday
          </Button>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : holidays.length === 0 ? (
            <EmptyState title="Chưa có Holiday nào" description="Thêm ngày nghỉ để hệ thống loại trừ khỏi tính ngày làm việc." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={holidaySortDirection('name')} onClick={() => toggleHolidaySort('name')}>Tên ngày nghỉ</TH>
                    <TH sortDirection={holidaySortDirection('holidayType')} onClick={() => toggleHolidaySort('holidayType')}>Loại</TH>
                    <TH sortDirection={holidaySortDirection('startDate')} onClick={() => toggleHolidaySort('startDate')}>Ngày bắt đầu</TH>
                    <TH sortDirection={holidaySortDirection('endDate')} onClick={() => toggleHolidaySort('endDate')}>Ngày kết thúc</TH>
                    <TH className="text-center" sortDirection={holidaySortDirection('status')} onClick={() => toggleHolidaySort('status')}>Trạng thái</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedHolidays.map((holiday, index) => (
                    <TR key={holiday.id}>
                      <TD>{index + 1}</TD>
                      <TD className="font-medium">{holiday.name}</TD>
                      <TD>{HOLIDAY_TYPE_OPTIONS.find((o) => o.value === holiday.holidayType)?.label ?? holiday.holidayType}</TD>
                      <TD>{formatDate(holiday.startDate)}</TD>
                      <TD>{holiday.isMultiDay ? formatDate(holiday.endDate) : '-'}</TD>
                      <TD className="text-center">
                        <Badge variant={holiday.isActive ? 'success' : 'neutral'}>{holiday.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(holiday)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(holiday)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Holiday' : 'Thêm Holiday mới'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Tên ngày nghỉ" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select
            label="Loại ngày nghỉ"
            options={HOLIDAY_TYPE_OPTIONS}
            value={form.holidayType}
            onChange={(e) => setForm({ ...form, holidayType: e.target.value as HolidayInput['holidayType'] })}
          />

          <FormField id="holiday-multi-day" label="Nhiều ngày">
            <label className="ui-check">
              <input type="checkbox" checked={form.isMultiDay} onChange={(e) => toggleMultiDay(e.target.checked)} />
              {form.isMultiDay ? 'Holiday kéo dài nhiều ngày' : 'Holiday chỉ 1 ngày'}
            </label>
          </FormField>

          <div className="flex gap-4">
            <Input
              type="date"
              label="Ngày bắt đầu"
              required
              className="flex-1"
              value={form.startDate}
              onChange={(e) => setForm((current) => ({ ...current, startDate: e.target.value, endDate: current.isMultiDay ? current.endDate : e.target.value }))}
            />
            <Input
              type="date"
              label="Ngày kết thúc"
              required={form.isMultiDay}
              disabled={!form.isMultiDay}
              className="flex-1"
              value={form.isMultiDay ? form.endDate : form.startDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              helperText={!form.isMultiDay ? 'Bằng Ngày bắt đầu khi tắt Nhiều ngày' : undefined}
            />
          </div>

          <FormField id="holiday-description" label="Mô tả">
            <textarea
              className="ui-textarea form-control-compact"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </FormField>

          <label className="ui-check">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Đang hoạt động (Active)
          </label>
        </div>
      </Modal>
    </div>
  );
}
