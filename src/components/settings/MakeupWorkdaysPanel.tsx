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
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { MakeupWorkday, MakeupWorkdayInput } from '@/lib/master-data-types';

type WorkdaySortKey = 'workDate' | 'status';

const EMPTY_FORM: MakeupWorkdayInput = {
  description: '',
  isActive: true,
  workDate: '',
};

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export interface MakeupWorkdaysPanelProps {
  year: number;
}

export function MakeupWorkdaysPanel({ year }: MakeupWorkdaysPanelProps) {
  const [workdays, setWorkdays] = useState<MakeupWorkday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MakeupWorkdayInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchWorkdays = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/makeup-workdays?year=${year}`);
      if (res.ok) setWorkdays(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchWorkdays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, workDate: `${year}-01-01` });
    setShowModal(true);
  };

  const openEdit = (workday: MakeupWorkday) => {
    setEditingId(workday.id);
    setForm({ description: workday.description, isActive: workday.isActive, workDate: workday.workDate });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/makeup-workdays', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Ngày làm bù.' : 'Đã tạo Ngày làm bù mới.', type: 'success' });
      setShowModal(false);
      fetchWorkdays();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const { sortKey: workdaySortKey, toggleSort: toggleWorkdaySort, directionFor: workdaySortDirection } = useSortableList<WorkdaySortKey>('workDate');
  const workdaySortValue = (workday: MakeupWorkday, key: WorkdaySortKey): string => (key === 'status' ? (workday.isActive ? 'active' : 'inactive') : workday[key]);
  const sortedWorkdays = [...workdays].sort((a, b) => compareValues(workdaySortValue(a, workdaySortKey), workdaySortValue(b, workdaySortKey), workdaySortDirection(workdaySortKey) ?? 'asc'));

  const handleDelete = async (workday: MakeupWorkday) => {
    if (!confirm(`Xóa Ngày làm bù "${formatDate(workday.workDate)}"?`)) return;
    const res = await fetch(`/api/makeup-workdays?id=${workday.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Ngày làm bù.', type: 'success' });
      fetchWorkdays();
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
          <CardTitle>Quản lý ngày làm bù ({workdays.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Ngày làm bù
          </Button>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : workdays.length === 0 ? (
            <EmptyState title="Chưa có Ngày làm bù nào" description="Thêm ngày Thứ 7/Chủ nhật được tính là ngày làm việc để bù cho đợt nghỉ lễ liên tục." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={workdaySortDirection('workDate')} onClick={() => toggleWorkdaySort('workDate')}>Ngày làm bù</TH>
                    <TH>Mô tả</TH>
                    <TH className="text-center" sortDirection={workdaySortDirection('status')} onClick={() => toggleWorkdaySort('status')}>Trạng thái</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedWorkdays.map((workday, index) => (
                    <TR key={workday.id}>
                      <TD>{index + 1}</TD>
                      <TD className="font-medium">{formatDate(workday.workDate)}</TD>
                      <TD>{workday.description || '-'}</TD>
                      <TD className="text-center">
                        <Badge variant={workday.isActive ? 'success' : 'neutral'}>{workday.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(workday)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(workday)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Ngày làm bù' : 'Thêm Ngày làm bù mới'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            type="date"
            label="Ngày làm bù"
            required
            value={form.workDate}
            onChange={(e) => setForm({ ...form, workDate: e.target.value })}
            helperText="Thường rơi vào Thứ 7 hoặc Chủ nhật, được tính là ngày làm việc."
          />

          <FormField id="workday-description" label="Mô tả">
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
