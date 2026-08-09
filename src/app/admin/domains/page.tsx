"use client";

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
import type { Domain, DomainInput } from '@/lib/master-data-types';

const EMPTY_FORM: DomainInput = { description: '', domainCode: '', domainName: '', isActive: true, leadName: '' };

export default function DomainsAdminPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DomainInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDomains = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/domains');
      if (res.ok) setDomains(await res.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchDomains);
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (domain: Domain) => {
    setEditingId(domain.id);
    setForm({ description: domain.description, domainCode: domain.domainCode, domainName: domain.domainName, isActive: domain.isActive, leadName: domain.leadName });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/domains', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Domain.' : 'Đã tạo Domain mới.', type: 'success' });
      setShowModal(false);
      fetchDomains();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Xóa Domain "${domain.domainName}"?`)) return;
    const res = await fetch(`/api/domains?id=${domain.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Domain.', type: 'success' });
      fetchDomains();
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
          <CardTitle>Danh mục Domain nghiệp vụ ({domains.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Domain
          </Button>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : domains.length === 0 ? (
            <EmptyState title="Chưa có Domain nào" description="Thêm Domain nghiệp vụ đầu tiên để phân loại các dự án." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>Domain Code</TH>
                    <TH>Tên Domain</TH>
                    <TH>Lead phụ trách</TH>
                    <TH>Mô tả</TH>
                    <TH className="text-center">Trạng thái</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {domains.map((domain) => (
                    <TR key={domain.id}>
                      <TD className="font-bold text-fb-blue">{domain.domainCode}</TD>
                      <TD className="font-medium">{domain.domainName}</TD>
                      <TD>{domain.leadName || '-'}</TD>
                      <TD className="max-w-[280px] truncate" title={domain.description}>{domain.description || '-'}</TD>
                      <TD className="text-center">
                        <Badge variant={domain.isActive ? 'success' : 'neutral'}>{domain.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(domain)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(domain)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Domain' : 'Thêm Domain mới'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Domain Code" required value={form.domainCode} onChange={(e) => setForm({ ...form, domainCode: e.target.value })} />
          <Input label="Tên Domain" required value={form.domainName} onChange={(e) => setForm({ ...form, domainName: e.target.value })} />
          <Input label="Lead phụ trách" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} />
          <FormField id="domain-description" label="Mô tả">
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
