'use client';

import { useEffect, useState } from 'react';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { showToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { DataTableToolbar } from '@/components/ui/DataTableToolbar';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { fuzzyIncludes } from '@/lib/fuzzy-search';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { ManagedUser } from '@/lib/auth-types';
import type { Domain, DomainInput, Project } from '@/lib/master-data-types';

const EMPTY_FORM: DomainInput = { description: '', domainCode: '', domainName: '', isActive: true, leadName: '', projectIds: [] };
type DomainSortKey = 'domainCode' | 'domainName' | 'leadName' | 'projectCount' | 'status';

export default function DomainsAdminPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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
      const [domainsResponse, usersResponse, projectsResponse] = await Promise.all([fetch('/api/domains'), fetch('/api/users'), fetch('/api/projects')]);
      if (domainsResponse.ok) setDomains(await domainsResponse.json());
      if (projectsResponse.ok) setProjects(await projectsResponse.json());
      if (usersResponse.ok) setUsers((await usersResponse.json()).filter((user: ManagedUser) => user.isActive));
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (domain: Domain) => { setEditingId(domain.id); setForm({ description: domain.description, domainCode: domain.domainCode, domainName: domain.domainName, isActive: domain.isActive, leadName: domain.leadName, projectIds: domain.projects.map((project) => project.id) }); setShowModal(true); };

  const handleSave = async () => {
    setIsSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/domains', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' }); return; }
      showToast(`${editingId ? 'Đã cập nhật Domain.' : 'Đã tạo Domain mới.'}${result.cacheRefreshing ? ' Dữ liệu cảnh báo Epic đang được tính lại theo Domain mới (vài phút).' : ''}`, 5000); setMessage(null); setShowModal(false); void load();
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsSaving(false); }
  };

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Xóa Domain "${domain.domainName}"?`)) return;
    const response = await fetch(`/api/domains?id=${domain.id}`, { method: 'DELETE' });
    if (response.ok) { showToast('Đã xóa Domain.', 5000); setMessage(null); void load(); }
    else { const result = await response.json(); setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' }); }
  };

  // "Dự án trong Domain" — every project, labelled with its current Domain when it belongs to a
  // different one: a project has exactly one Domain (projects.domain_id), so ticking it here moves it.
  const projectOptions = [...projects]
    .sort((a, b) => a.sourceProjectKey.localeCompare(b.sourceProjectKey))
    .map((project) => {
      const otherDomain = project.domainId !== null && project.domainId !== editingId ? project.domainName : null;
      return {
        value: String(project.id),
        label: `${project.sourceProjectKey} — ${project.projectName}${project.isActive ? '' : ' (Inactive)'}${otherDomain ? ` · đang thuộc ${otherDomain}` : ''}`,
      };
    });
  const selectedProjectIds = form.projectIds ?? [];
  const movedProjects = projects.filter((project) => selectedProjectIds.includes(project.id) && project.domainId !== null && project.domainId !== editingId);
  const releasedCount = editingId === null ? 0 : (domains.find((domain) => domain.id === editingId)?.projects ?? []).filter((project) => !selectedProjectIds.includes(project.id)).length;
  const projectHelperText = [
    'Mỗi dự án chỉ thuộc 1 Domain.',
    movedProjects.length > 0 ? `${movedProjects.length} dự án sẽ được chuyển từ Domain khác sang Domain này.` : '',
    releasedCount > 0 ? `${releasedCount} dự án bị bỏ chọn sẽ không còn thuộc Domain nào.` : '',
  ].filter(Boolean).join(' ');

  const leadOptions = [{ value: '', label: 'Chưa gán Lead' }, ...users.map((user) => ({ value: user.fullName, label: `${user.fullName} — ${user.email}` }))];
  const { sortKey: domainSortKey, toggleSort: toggleDomainSort, directionFor: domainSortDirection } = useSortableList<DomainSortKey>('domainCode');
  const domainSortValue = (domain: Domain, key: DomainSortKey): string | number => (key === 'status' ? (domain.isActive ? 'active' : 'inactive') : key === 'projectCount' ? domain.projects.length : domain[key]);
  const filteredDomains = domains
    .filter((domain) => fuzzyIncludes(searchTerm, [domain.domainCode, domain.domainName, domain.leadName, domain.description, domain.isActive ? 'active' : 'inactive', ...domain.projects.flatMap((project) => [project.sourceProjectKey, project.projectName])]))
    .sort((a, b) => compareValues(domainSortValue(a, domainSortKey), domainSortValue(b, domainSortKey), domainSortDirection(domainSortKey) ?? 'asc'));
  return <div className="flex flex-col gap-6">
    <InfoBannerDisplay pathname="/admin/domains" />
    {message && <Alert variant="error" title="Lỗi">{message.text}</Alert>}
    <Card><CardHeader><CardTitle>Danh mục Domain nghiệp vụ ({domains.length})</CardTitle><Button size="sm" icon={<Plus className="size-4" weight="bold" />} onClick={openCreate}>Thêm Domain</Button></CardHeader><CardBody>
      {isLoading ? <TableSkeleton rows={4} /> : domains.length === 0 ? <EmptyState title="Chưa có Domain nào" description="Thêm Domain nghiệp vụ đầu tiên để phân loại các dự án." /> : <><DataTableToolbar onReset={() => setSearchTerm('')} onSearchChange={setSearchTerm} placeholder="Tìm Domain, Lead, dự án hoặc mô tả" searchValue={searchTerm} />{filteredDomains.length === 0 ? <EmptyState title="Không tìm thấy Domain phù hợp" description="Hãy thay đổi từ khóa hoặc đặt lại tìm kiếm." /> : <TableContainer><Table><THead><TR>
        <TH>STT</TH>
        <TH sortDirection={domainSortDirection('domainCode')} onClick={() => toggleDomainSort('domainCode')}>Domain Code</TH>
        <TH sortDirection={domainSortDirection('domainName')} onClick={() => toggleDomainSort('domainName')}>Tên Domain</TH>
        <TH sortDirection={domainSortDirection('leadName')} onClick={() => toggleDomainSort('leadName')}>Lead phụ trách</TH>
        <TH sortDirection={domainSortDirection('projectCount')} onClick={() => toggleDomainSort('projectCount')}>Dự án trong Domain</TH>
        <TH>Mô tả</TH>
        <TH className="text-center" sortDirection={domainSortDirection('status')} onClick={() => toggleDomainSort('status')}>Trạng thái</TH>
        <TH className="text-center">Hành động</TH>
      </TR></THead><TBody>{filteredDomains.map((domain, index) => <TR key={domain.id}><TD>{index + 1}</TD><TD className="font-bold text-fb-blue">{domain.domainCode}</TD><TD className="font-medium">{domain.domainName}</TD><TD>{domain.leadName || '-'}</TD><TD className="min-w-[200px] max-w-[360px]">{domain.projects.length === 0 ? <span className="text-fb-text-secondary">Chưa có dự án</span> : <div className="flex flex-wrap gap-1">{domain.projects.map((project) => <Badge key={project.id} variant={project.isActive ? 'info' : 'neutral'} title={`${project.projectName}${project.isActive ? '' : ' (Inactive)'}`}>{project.sourceProjectKey}</Badge>)}</div>}</TD><TD className="max-w-[280px] truncate" title={domain.description}>{domain.description || '-'}</TD><TD className="text-center"><Badge variant={domain.isActive ? 'success' : 'neutral'}>{domain.isActive ? 'Active' : 'Inactive'}</Badge></TD><TD><div className="flex justify-center gap-2"><TableAction variant="info" icon={<PencilSimple className="size-4" />} onClick={() => openEdit(domain)}>Sửa</TableAction><TableAction variant="danger" icon={<Trash className="size-4" />} onClick={() => handleDelete(domain)}>Xóa</TableAction></div></TD></TR>)}</TBody></Table></TableContainer>}</>}
    </CardBody></Card>
    <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Cập nhật Domain' : 'Thêm Domain mới'} footer={<><Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button><Button onClick={handleSave} isLoading={isSaving}>Lưu</Button></>}>
      <div className="ui-form flex flex-col gap-4"><Input label="Domain Code" required value={form.domainCode} onChange={(event) => setForm({ ...form, domainCode: event.target.value })} /><Input label="Tên Domain" required value={form.domainName} onChange={(event) => setForm({ ...form, domainName: event.target.value })} /><Select label="Lead phụ trách" options={leadOptions} value={form.leadName} onChange={(event) => setForm({ ...form, leadName: event.target.value })} /><MultiSelect label="Dự án trong Domain" placeholder="Chưa chọn dự án" options={projectOptions} value={selectedProjectIds.map(String)} onChange={(values) => setForm({ ...form, projectIds: values.map(Number) })} helperText={projectHelperText} /><FormField id="domain-description" label="Mô tả"><textarea className="ui-textarea form-control-compact" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField><label className="ui-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Đang hoạt động (Active)</label></div>
    </Modal>
  </div>;
}
