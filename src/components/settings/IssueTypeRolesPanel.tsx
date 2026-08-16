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
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { TEAM_ROLES } from '@/lib/master-data-types';
import type { IssueTypeRoleMapping, IssueTypeRoleMappingInput, TeamRole } from '@/lib/master-data-types';

const EMPTY_FORM: IssueTypeRoleMappingInput = { issueType: '', teamRole: 'BA' };

const ROLE_OPTIONS = TEAM_ROLES.map((role) => ({ value: role, label: role }));

const ROLE_BADGE_VARIANT: Record<TeamRole, 'info' | 'success' | 'warning' | 'neutral'> = {
  BA: 'info',
  DEV: 'success',
  TEST: 'warning',
  PM: 'neutral',
};

export function IssueTypeRolesPanel() {
  const [mappings, setMappings] = useState<IssueTypeRoleMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<IssueTypeRoleMappingInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchMappings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/issue-type-roles');
      if (res.ok) setMappings(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchMappings);
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (mapping: IssueTypeRoleMapping) => {
    setEditingId(mapping.id);
    setForm({ issueType: mapping.issueType, teamRole: mapping.teamRole });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/issue-type-roles', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Issue Type.' : 'Đã thêm Issue Type mới.', type: 'success' });
      setShowModal(false);
      fetchMappings();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (mapping: IssueTypeRoleMapping) => {
    if (!confirm(`Xóa khai báo Issue Type "${mapping.issueType}"?`)) return;
    const res = await fetch(`/api/issue-type-roles?id=${mapping.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Issue Type.', type: 'success' });
      fetchMappings();
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
          <CardTitle>Khai báo Issue Type theo Role ({mappings.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Issue Type
          </Button>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Khai báo Issue Type (Jira) tương ứng với vai trò trong team phát triển: BA, DEV, TEST, PM.
            Dùng để xác định subtask nào đại diện cho vai trò nào khi tính các mốc DESIGN/DEV/TEST của Epic.
          </p>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : mappings.length === 0 ? (
            <EmptyState title="Chưa có khai báo nào" description="Thêm Issue Type để gán vào vai trò BA/DEV/TEST/PM." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>Issue Type</TH>
                    <TH>Role</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {mappings.map((mapping) => (
                    <TR key={mapping.id}>
                      <TD className="font-medium">{mapping.issueType}</TD>
                      <TD><Badge variant={ROLE_BADGE_VARIANT[mapping.teamRole]}>{mapping.teamRole}</Badge></TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(mapping)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(mapping)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Issue Type' : 'Thêm Issue Type mới'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Issue Type"
            required
            placeholder='VD: BA, Design, "Review TKCT", UAT...'
            value={form.issueType}
            onChange={(e) => setForm({ ...form, issueType: e.target.value })}
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={form.teamRole}
            onChange={(e) => setForm({ ...form, teamRole: e.target.value as TeamRole })}
          />
        </div>
      </Modal>
    </div>
  );
}
