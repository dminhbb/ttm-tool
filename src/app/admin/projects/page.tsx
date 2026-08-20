'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwise, FileArrowUp, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { ManagedUser } from '@/lib/auth-types';
import { PROJECT_CATEGORIES } from '@/lib/master-data-types';
import { fuzzyIncludes } from '@/lib/fuzzy-search';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { Domain, Project, ProjectComponent, ProjectInput } from '@/lib/master-data-types';

const PAGE_SIZE = 20;
type ProjectSortKey = 'projectName' | 'projectCategory' | 'ttm' | 'domainName' | 'sourceProjectKey' | 'leadName' | 'status';
const EMPTY_FORM: ProjectInput = { domainId: null, isActive: true, projectCategory: null, projectName: '', sourceProjectKey: '', sourceType: 'JIRA', ttm: 'N' };

export default function ProjectsAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterLead, setFilterLead] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [projectsResponse, domainsResponse, usersResponse, componentsResponse] = await Promise.all([fetch('/api/projects'), fetch('/api/domains'), fetch('/api/users'), fetch('/api/project-components')]);
      if (projectsResponse.ok) setProjects(await projectsResponse.json());
      if (domainsResponse.ok) setDomains(await domainsResponse.json());
      if (usersResponse.ok) setUsers(await usersResponse.json());
      if (componentsResponse.ok) setProjectComponents(await componentsResponse.json());
    } finally { setIsLoading(false); }
  };

  useEffect(() => { void Promise.resolve().then(fetchAll); }, []);

  const { sortKey: projectSortKey, sortDirection: projectActiveDirection, toggleSort: toggleProjectSort, directionFor: projectSortDirection } = useSortableList<ProjectSortKey>('sourceProjectKey');
  const projectSortValue = (project: Project, key: ProjectSortKey): string => (key === 'status' ? (project.isActive ? 'active' : 'inactive') : (project[key] ?? ''));
  const filteredProjects = useMemo(() => projects.filter((project) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return (!normalizedQuery || project.sourceProjectKey.toLocaleLowerCase('vi-VN').includes(normalizedQuery) || project.projectName.toLocaleLowerCase('vi-VN').includes(normalizedQuery))
      && (!filterDomain || String(project.domainId ?? '') === filterDomain)
      && fuzzyIncludes(filterLead, [project.leadName])
      && (!filterStatus || String(project.isActive) === filterStatus);
  }).sort((a, b) => compareValues(projectSortValue(a, projectSortKey), projectSortValue(b, projectSortKey), projectActiveDirection)), [filterDomain, filterLead, filterStatus, projects, query, projectSortKey, projectActiveDirection]);
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const visibleProjects = filteredProjects.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);
  const domainOptions = [{ value: '', label: '— Chưa gán Domain —' }, ...domains.filter((domain) => domain.isActive).map((domain) => ({ value: String(domain.id), label: domain.domainName }))];
  const editingProject = editingId ? projects.find((project) => project.id === editingId) ?? null : null;

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (project: Project) => { setEditingId(project.id); setForm({ domainId: project.domainId, isActive: project.isActive, projectCategory: project.projectCategory, projectName: project.projectName, sourceProjectKey: project.sourceProjectKey, sourceType: project.sourceType, ttm: project.ttm }); setShowModal(true); };
  const handleSave = async () => {
    setIsSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/projects', { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' }); return; }
      setMessage({ text: editingId ? 'Đã cập nhật dự án.' : 'Đã tạo dự án mới.', type: 'success' }); setShowModal(false); void fetchAll();
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsSaving(false); }
  };
  const handleDelete = async (project: Project) => { if (!confirm(`Xóa dự án "${project.projectName}"?`)) return; const response = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' }); if (response.ok) { setMessage({ text: 'Đã xóa dự án.', type: 'success' }); void fetchAll(); } else { const result = await response.json(); setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' }); } };
  const uploadProjects = async () => {
    if (!importFile) { setMessage({ text: 'Vui lòng chọn file CSV.', type: 'error' }); return; }
    setIsImporting(true); setMessage(null);
    try { const data = new FormData(); data.append('file', importFile); const response = await fetch('/api/projects', { method: 'PATCH', body: data }); const result = await response.json(); if (!response.ok) { setMessage({ text: result.error || 'Import dự án thất bại.', type: 'error' }); return; } setMessage({ text: `Đã import ${result.imported} dự án${result.unresolvedLeadCount ? `; để trống PM/SM cho ${result.unresolvedLeadCount} dự án vì user không tồn tại hoặc inactive` : ''}.`, type: 'success' }); setShowImportModal(false); setImportFile(null); void fetchAll(); } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsImporting(false); }
  };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => setImportFile(event.target.files?.[0] ?? null);

  return <div className="flex flex-col gap-6">
    {message && <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>{message.text}</Alert>}
    <Card><CardHeader><CardTitle>Danh mục Dự án ({filteredProjects.length})</CardTitle><div className="flex gap-2"><Button icon={<FileArrowUp className="size-4" weight="bold" />} onClick={() => setShowImportModal(true)} size="sm" variant="outline">Thêm nhiều dự án</Button><Button icon={<Plus className="size-4" weight="bold" />} onClick={openCreate} size="sm">Thêm dự án</Button></div></CardHeader><CardBody>
      <div className="ui-table-toolbar grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]"><Input aria-label="Tìm project key hoặc tên dự án" label="Tìm kiếm" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Project Key hoặc tên dự án" value={query} /><Select label="Domain" onChange={(event) => { setFilterDomain(event.target.value); setPage(1); }} options={[{ value: '', label: 'Tất cả Domain' }, ...domains.map((domain) => ({ value: String(domain.id), label: domain.domainName }))]} value={filterDomain} /><Input label="PM/SM" onChange={(event) => { setFilterLead(event.target.value); setPage(1); }} placeholder="Nhập tên hoặc email PM/SM" value={filterLead} /><Select label="Trạng thái" onChange={(event) => { setFilterStatus(event.target.value); setPage(1); }} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} value={filterStatus} /><button aria-label="Đặt lại tìm kiếm và bộ lọc" className="ui-icon-button self-end" onClick={() => { setQuery(''); setFilterDomain(''); setFilterLead(''); setFilterStatus(''); setPage(1); }} title="Đặt lại tìm kiếm và bộ lọc" type="button"><ArrowCounterClockwise aria-hidden="true" className="size-4" weight="bold" /></button></div>
      {isLoading ? <TableSkeleton rows={4} /> : filteredProjects.length === 0 ? <EmptyState title="Không có dự án phù hợp" description="Điều chỉnh bộ lọc hoặc thêm dự án mới." /> : <><TableContainer><Table><THead><TR>
        <TH>STT</TH>
        <TH sortDirection={projectSortDirection('sourceProjectKey')} onClick={() => toggleProjectSort('sourceProjectKey')}>Project Key (Jira)</TH>
        <TH sortDirection={projectSortDirection('projectName')} onClick={() => toggleProjectSort('projectName')}>Tên dự án</TH>
        <TH sortDirection={projectSortDirection('projectCategory')} onClick={() => toggleProjectSort('projectCategory')}>Loại hình</TH>
        <TH sortDirection={projectSortDirection('ttm')} onClick={() => toggleProjectSort('ttm')}>Time to Market</TH>
        <TH sortDirection={projectSortDirection('domainName')} onClick={() => toggleProjectSort('domainName')}>Domain</TH>
        <TH sortDirection={projectSortDirection('leadName')} onClick={() => toggleProjectSort('leadName')}>PM/SM</TH>
        <TH className="text-center" sortDirection={projectSortDirection('status')} onClick={() => toggleProjectSort('status')}>Trạng thái</TH>
        <TH className="text-center">Hành động</TH>
      </TR></THead><TBody>{visibleProjects.map((project, index) => <TR key={project.id}><TD>{(Math.min(page, totalPages) - 1) * PAGE_SIZE + index + 1}</TD><TD className="font-bold text-fb-blue">{project.sourceProjectKey}</TD><TD className="font-medium">{project.projectName}</TD><TD>{project.projectCategory || '-'}</TD><TD>{project.ttm}</TD><TD>{project.domainName || '-'}</TD><TD>{project.leadName || '-'}</TD><TD className="text-center"><Badge variant={project.isActive ? 'success' : 'neutral'}>{project.isActive ? 'Active' : 'Inactive'}</Badge></TD><TD><div className="flex justify-center gap-2"><TableAction variant="info" icon={<PencilSimple className="size-4" />} onClick={() => openEdit(project)}>Sửa</TableAction><TableAction variant="danger" icon={<Trash className="size-4" />} onClick={() => void handleDelete(project)}>Xóa</TableAction></div></TD></TR>)}</TBody></Table></TableContainer><Pagination currentPage={Math.min(page, totalPages)} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={filteredProjects.length} /></>}
    </CardBody></Card>
    <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Cập nhật Dự án' : 'Thêm Dự án mới'} footer={<><Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button><Button onClick={handleSave} isLoading={isSaving}>Lưu</Button></>}><ProjectForm form={form} domainOptions={domainOptions} project={editingProject} projectComponents={projectComponents} users={users} onChange={setForm} /></Modal>
    <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Thêm nhiều dự án từ CSV" footer={<><Button onClick={() => setShowImportModal(false)} variant="outline">Hủy</Button><Button isLoading={isImporting} onClick={uploadProjects}>Import dự án</Button></>}><div className="ui-form flex flex-col gap-4"><p className="text-fb-text-secondary">CSV gồm: <strong>Tên dự án</strong>, <strong>Loại hình dự án</strong>, <strong>PM-SM</strong>, <strong>Key</strong>, <strong>TTM</strong>. Bắt buộc: Tên dự án, Key, TTM. Key được dùng làm Project Key (Jira). Loại hình hoặc PM/SM không hợp lệ/trống sẽ được để trống.</p><Input accept=".csv,text/csv" label="File CSV" onChange={onFileChange} required type="file" /><p className="text-fb-text-secondary">Tối đa 500 dòng, dung lượng tối đa 1 MB. Time to Market chỉ nhận Y hoặc N.</p></div></Modal>
  </div>;
}

function ProjectForm({ domainOptions, form, project, projectComponents, users, onChange }: { domainOptions: { value: string; label: string }[]; form: ProjectInput; project: Project | null; projectComponents: ProjectComponent[]; users: ManagedUser[]; onChange: (form: ProjectInput) => void }) {
  return <div className="ui-form flex flex-col gap-4"><Input label="Tên dự án" required value={form.projectName} onChange={(event) => onChange({ ...form, projectName: event.target.value })} /><Select label="Loại hình dự án" options={[{ value: '', label: 'Chưa xác định' }, ...PROJECT_CATEGORIES.map((value) => ({ value, label: value }))]} value={form.projectCategory ?? ''} onChange={(event) => onChange({ ...form, projectCategory: event.target.value ? event.target.value as ProjectInput['projectCategory'] : null })} /><Select label="Time to Market" options={[{ value: 'N', label: 'N' }, { value: 'Y', label: 'Y' }]} required value={form.ttm} onChange={(event) => onChange({ ...form, ttm: event.target.value as ProjectInput['ttm'] })} /><Input label="Project Key (Jira)" required helperText="Phải khớp với Key trong dữ liệu Jira/CSV import." value={form.sourceProjectKey} onChange={(event) => onChange({ ...form, sourceProjectKey: event.target.value })} /><Select label="Domain nghiệp vụ" options={domainOptions} value={form.domainId != null ? String(form.domainId) : ''} onChange={(event) => onChange({ ...form, domainId: event.target.value ? Number(event.target.value) : null })} /><ProjectLeadInfo project={project} projectComponents={projectComponents} users={users} /><label className="ui-check"><input type="checkbox" checked={form.isActive} onChange={(event) => onChange({ ...form, isActive: event.target.checked })} />Đang hoạt động (Active)</label></div>;
}

/** Read-only — PM/SM assignment (and its Component-level scope) is set exclusively from the Users
 * screen (UserForm's "Dự án" picker), never from this popup. */
function ProjectLeadInfo({ project, projectComponents, users }: { project: Project | null; projectComponents: ProjectComponent[]; users: ManagedUser[] }) {
  if (!project) return null;
  if (!project.leadName) return <div className="ui-form-section rounded-lg border border-fb-border bg-fb-surface-muted p-3"><p className="text-xs font-semibold text-fb-text-secondary">PM/SM</p><p className="mt-1 text-sm text-fb-text-secondary">Chưa gán PM/SM. Gán tại màn hình Quản lý user.</p></div>;
  const lead = users.find((user) => user.fullName === project.leadName);
  const components = lead?.projectComponents[String(project.id)] ?? [];
  const hasComponentCatalog = projectComponents.some((component) => component.projectKey === project.sourceProjectKey && component.isActive);
  return <div className="ui-form-section rounded-lg border border-fb-border bg-fb-surface-muted p-3">
    <p className="text-xs font-semibold text-fb-text-secondary">PM/SM</p>
    <p className="mt-1 text-sm font-medium text-fb-text-primary">{project.leadName}{lead ? ` — ${lead.email}` : ''}</p>
    {hasComponentCatalog && <>
      <p className="mt-2 text-xs font-semibold text-fb-text-secondary">Component được phân quyền</p>
      {components.length === 0
        ? <p className="mt-1 text-sm text-fb-text-secondary">Toàn quyền dự án (không giới hạn Component).</p>
        : <ul className="mt-1 flex flex-wrap gap-1.5">{components.map((component) => <li key={component}><Badge variant="info">{component}</Badge></li>)}</ul>}
    </>}
    <p className="mt-2 text-[11px] text-fb-text-secondary">Việc gán/đổi PM/SM và giới hạn Component được thực hiện tại màn hình Quản lý user.</p>
  </div>;
}
