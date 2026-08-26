'use client';

import { useEffect, useState } from 'react';
import { Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { Project, ProjectComponent, ProjectComponentInput } from '@/lib/master-data-types';

type ComponentSortKey = 'projectKey' | 'componentName' | 'status' | 'updatedAt';

const EMPTY_FORM: ProjectComponentInput = { componentName: '', isActive: true, projectKey: '' };

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const time = date.toTimeString().slice(0, 5);
  return `${day}/${month}/${date.getFullYear()} ${time}`;
}

/**
 * Cleanup view for the `project_components` catalog: lists rows that are "mồ côi" (orphan) —
 * present in the catalog but not on any issue's latest known `components` array — since the
 * catalog only ever accumulates (see project-component-service.ts) and nothing else ever prunes
 * it. SUPERADMIN only; self-hides on 401/403 like RawImportRetentionSettings does, since there's
 * no page-level role gate for the data-source screen this tab lives on.
 */
export function ComponentManagementTab() {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [orphans, setOrphans] = useState<ProjectComponent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectComponentInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleting, setDeleting] = useState<ProjectComponent | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const orphansResponse = await fetch('/api/project-components?orphan=1');
      if (orphansResponse.status === 401 || orphansResponse.status === 403) { setCanManage(false); return; }
      setCanManage(true);
      if (orphansResponse.ok) setOrphans(await orphansResponse.json());
      const projectsResponse = await fetch('/api/projects');
      if (projectsResponse.ok) setProjects((await projectsResponse.json()).filter((project: Project) => project.isActive));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const projectOptions = projects.map((project) => ({ value: project.sourceProjectKey, label: `${project.sourceProjectKey} — ${project.projectName}` }));

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (component: ProjectComponent) => { setEditingId(component.id); setForm({ componentName: component.componentName, isActive: component.isActive, projectKey: component.projectKey }); setShowModal(true); };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/project-components', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' }); return; }
      setMessage({ text: editingId ? 'Đã cập nhật Component.' : 'Đã thêm Component mới.', type: 'success' });
      setShowModal(false);
      void load();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/project-components?id=${deleting.id}`, { method: 'DELETE' });
    if (response.ok) { setMessage({ text: 'Đã xóa Component.', type: 'success' }); setDeleting(null); void load(); }
    else { const result = await response.json(); setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' }); }
  };

  const { sortKey, toggleSort, directionFor } = useSortableList<ComponentSortKey>('projectKey');
  const sortValue = (component: ProjectComponent, key: ComponentSortKey): string => (key === 'status' ? (component.isActive ? 'active' : 'inactive') : component[key]);
  const sortedOrphans = [...orphans].sort((a, b) => compareValues(sortValue(a, sortKey), sortValue(b, sortKey), directionFor(sortKey) ?? 'asc'));

  if (canManage === false) return <EmptyState title="Không có quyền truy cập" description="Chỉ CBQL Phòng (SUPERADMIN) mới có thể quản lý danh mục Component." />;

  return (
    <div className="flex flex-col gap-6">
      {message && <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>{message.text}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Component mồ côi ({orphans.length})</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">Component có trong danh mục nhưng không còn xuất hiện trên issue nào đã import (dữ liệu mới nhất theo từng issue).</p>
          </div>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>Thêm Component</Button>
        </CardHeader>
        <CardBody>
          {isLoading ? <TableSkeleton rows={4} /> : orphans.length === 0 ? (
            <EmptyState title="Không có Component mồ côi" description="Toàn bộ Component trong danh mục đều đang xuất hiện trên ít nhất một issue đã import." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>STT</TH>
                    <TH sortDirection={directionFor('projectKey')} onClick={() => toggleSort('projectKey')}>Project key</TH>
                    <TH sortDirection={directionFor('componentName')} onClick={() => toggleSort('componentName')}>Component</TH>
                    <TH className="text-center" sortDirection={directionFor('status')} onClick={() => toggleSort('status')}>Trạng thái</TH>
                    <TH sortDirection={directionFor('updatedAt')} onClick={() => toggleSort('updatedAt')}>Cập nhật lần cuối</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedOrphans.map((component, index) => (
                    <TR key={component.id}>
                      <TD>{index + 1}</TD>
                      <TD className="font-medium">{component.projectKey}</TD>
                      <TD>{component.componentName}</TD>
                      <TD className="text-center"><Badge variant={component.isActive ? 'success' : 'neutral'}>{component.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                      <TD>{formatDateTime(component.updatedAt)}</TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(component)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => setDeleting(component)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Component' : 'Thêm Component mới'}
        footer={<><Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button><Button onClick={handleSave} isLoading={isSaving}>Lưu</Button></>}
      >
        <div className="flex flex-col gap-4">
          <Select label="Dự án" onChange={(event) => setForm({ ...form, projectKey: event.target.value })} options={[{ value: '', label: 'Chọn dự án' }, ...projectOptions]} required value={form.projectKey} />
          <Input label="Component" onChange={(event) => setForm({ ...form, componentName: event.target.value })} required value={form.componentName} />
          <label className="ui-check"><input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />Đang hoạt động (Active)</label>
        </div>
      </Modal>

      <ConfirmDialog confirmLabel="Xóa" description={`Bạn có chắc muốn xóa Component "${deleting?.componentName ?? ''}" khỏi dự án ${deleting?.projectKey ?? ''}?`} isOpen={deleting !== null} onClose={() => setDeleting(null)} onConfirm={handleDelete} steps={1} title="Xóa Component" />
    </div>
  );
}
