'use client';

import { useEffect, useState } from 'react';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
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
import { DataTableToolbar } from '@/components/ui/DataTableToolbar';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { fuzzyIncludes } from '@/lib/fuzzy-search';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { ManagedUser } from '@/lib/auth-types';
import type { Domain, DomainInput } from '@/lib/master-data-types';

const EMPTY_FORM: DomainInput = { description: '', domainCode: '', domainName: '', isActive: true, leadName: '' };
type DomainSortKey = 'domainCode' | 'domainName' | 'leadName' | 'status';

export default function DomainsAdminPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DomainInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      const [domainsResponse, usersResponse] = await Promise.all([fetch('/api/domains'), fetch('/api/users')]);
      if (domainsResponse.ok) setDomains(await domainsResponse.json());
      if (usersResponse.ok) setUsers((await usersResponse.json()).filter((user: ManagedUser) => user.isActive));
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (domain: Domain) => { setEditingId(domain.id); setForm({ description: domain.description, domainCode: domain.domainCode, domainName: domain.domainName, isActive: domain.isActive, leadName: domain.leadName }); setShowModal(true); };

  const handleSave = async () => {
    setIsSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/domains', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' }); return; }
      setMessage({ text: editingId ? 'Đã cập nhật Domain.' : 'Đã tạo Domain mới.', type: 'success' }); setShowModal(false); void load();
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsSaving(false); }
  };

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Xóa Domain "${domain.domainName}"?`)) return;
    const response = await fetch(`/api/domains?id=${domain.id}`, { method: 'DELETE' });
    if (response.ok) { setMessage({ text: 'Đã xóa Domain.', type: 'success' }); void load(); }
    else { const result = await response.json(); setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' }); }
  };

  const leadOptions = [{ value: '', label: 'Chưa gán Lead' }, ...users.map((user) => ({ value: user.fullName, label: `${user.fullName} — ${user.email}` }))];
  const { sortKey: domainSortKey, toggleSort: toggleDomainSort, directionFor: domainSortDirection } = useSortableList<DomainSortKey>('domainCode');
  const domainSortValue = (domain: Domain, key: DomainSortKey): string => (key === 'status' ? (domain.isActive ? 'active' : 'inactive') : domain[key]);
  const filteredDomains = domains
    .filter((domain) => fuzzyIncludes(searchTerm, [domain.domainCode, domain.domainName, domain.leadName, domain.description, domain.isActive ? 'active' : 'inactive']))
    .sort((a, b) => compareValues(domainSortValue(a, domainSortKey), domainSortValue(b, domainSortKey), domainSortDirection(domainSortKey) ?? 'asc'));
  return <div className="flex flex-col gap-6">
    {message && <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>{message.text}</Alert>}
    <Card><CardHeader><CardTitle>Danh mục Domain nghiệp vụ ({domains.length})</CardTitle><Button size="sm" icon={<Plus className="size-4" weight="bold" />} onClick={openCreate}>Thêm Domain</Button></CardHeader><CardBody>
      {isLoading ? <TableSkeleton rows={4} /> : domains.length === 0 ? <EmptyState title="Chưa có Domain nào" description="Thêm Domain nghiệp vụ đầu tiên để phân loại các dự án." /> : <><DataTableToolbar onReset={() => setSearchTerm('')} onSearchChange={setSearchTerm} placeholder="Tìm Domain, Lead hoặc mô tả" searchValue={searchTerm} />{filteredDomains.length === 0 ? <EmptyState title="Không tìm thấy Domain phù hợp" description="Hãy thay đổi từ khóa hoặc đặt lại tìm kiếm." /> : <TableContainer><Table><THead><TR>
        <TH>STT</TH>
        <TH sortDirection={domainSortDirection('domainCode')} onClick={() => toggleDomainSort('domainCode')}>Domain Code</TH>
        <TH sortDirection={domainSortDirection('domainName')} onClick={() => toggleDomainSort('domainName')}>Tên Domain</TH>
        <TH sortDirection={domainSortDirection('leadName')} onClick={() => toggleDomainSort('leadName')}>Lead phụ trách</TH>
        <TH>Mô tả</TH>
        <TH className="text-center" sortDirection={domainSortDirection('status')} onClick={() => toggleDomainSort('status')}>Trạng thái</TH>
        <TH className="text-center">Hành động</TH>
      </TR></THead><TBody>{filteredDomains.map((domain, index) => <TR key={domain.id}><TD>{index + 1}</TD><TD className="font-bold text-fb-blue">{domain.domainCode}</TD><TD className="font-medium">{domain.domainName}</TD><TD>{domain.leadName || '-'}</TD><TD className="max-w-[280px] truncate" title={domain.description}>{domain.description || '-'}</TD><TD className="text-center"><Badge variant={domain.isActive ? 'success' : 'neutral'}>{domain.isActive ? 'Active' : 'Inactive'}</Badge></TD><TD><div className="flex justify-center gap-2"><TableAction variant="info" icon={<PencilSimple className="size-4" />} onClick={() => openEdit(domain)}>Sửa</TableAction><TableAction variant="danger" icon={<Trash className="size-4" />} onClick={() => handleDelete(domain)}>Xóa</TableAction></div></TD></TR>)}</TBody></Table></TableContainer>}</>}
    </CardBody></Card>
    <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Cập nhật Domain' : 'Thêm Domain mới'} footer={<><Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button><Button onClick={handleSave} isLoading={isSaving}>Lưu</Button></>}>
      <div className="ui-form flex flex-col gap-4"><Input label="Domain Code" required value={form.domainCode} onChange={(event) => setForm({ ...form, domainCode: event.target.value })} /><Input label="Tên Domain" required value={form.domainName} onChange={(event) => setForm({ ...form, domainName: event.target.value })} /><Select label="Lead phụ trách" options={leadOptions} value={form.leadName} onChange={(event) => setForm({ ...form, leadName: event.target.value })} /><FormField id="domain-description" label="Mô tả"><textarea className="ui-textarea form-control-compact" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField><label className="ui-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Đang hoạt động (Active)</label></div>
    </Modal>
  </div>;
}
