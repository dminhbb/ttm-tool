"use client";

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
import type { Domain, Project, ProjectInput } from '@/lib/master-data-types';

const EMPTY_FORM: ProjectInput = {
  domainId: null,
  isActive: true,
  leadName: '',
  projectKey: '',
  projectName: '',
  sourceProjectKey: '',
  sourceType: 'JIRA',
};

export default function ProjectsAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectInput>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [projectsRes, domainsRes] = await Promise.all([fetch('/api/projects'), fetch('/api/domains')]);
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (domainsRes.ok) setDomains(await domainsRes.json());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchAll);
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (project: Project) => {
    setEditingId(project.id);
    setForm({
      domainId: project.domainId,
      isActive: project.isActive,
      leadName: project.leadName,
      projectKey: project.projectKey,
      projectName: project.projectName,
      sourceProjectKey: project.sourceProjectKey,
      sourceType: project.sourceType,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/projects', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: editingId ? 'Đã cập nhật Dự án.' : 'Đã tạo Dự án mới.', type: 'success' });
      setShowModal(false);
      fetchAll();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`Xóa Dự án "${project.projectName}"?`)) return;
    const res = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMessage({ text: 'Đã xóa Dự án.', type: 'success' });
      fetchAll();
    } else {
      const result = await res.json();
      setMessage({ text: result.error || 'Xóa thất bại.', type: 'error' });
    }
  };

  const domainOptions = [{ value: '', label: '— Chưa gán Domain —' }, ...domains.map((d) => ({ value: String(d.id), label: d.domainName }))];

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danh mục Dự án ({projects.length})</CardTitle>
          <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={openCreate}>
            Thêm Dự án
          </Button>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : projects.length === 0 ? (
            <EmptyState title="Chưa có Dự án nào" description="Thêm Dự án và mapping với Jira Project Key để nhận diện Domain khi import." />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>Project Key</TH>
                    <TH>Tên dự án</TH>
                    <TH>Domain</TH>
                    <TH>Source Project Key</TH>
                    <TH>Lead phụ trách</TH>
                    <TH className="text-center">Trạng thái</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {projects.map((project) => (
                    <TR key={project.id}>
                      <TD className="font-bold text-fb-blue">{project.projectKey}</TD>
                      <TD className="font-medium">{project.projectName}</TD>
                      <TD>{project.domainName || '-'}</TD>
                      <TD>{project.sourceProjectKey}</TD>
                      <TD>{project.leadName || '-'}</TD>
                      <TD className="text-center">
                        <Badge variant={project.isActive ? 'success' : 'neutral'}>{project.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-center gap-2">
                          <TableAction variant="info" icon={<PencilSimple className="w-4 h-4" />} onClick={() => openEdit(project)}>Sửa</TableAction>
                          <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleDelete(project)}>Xóa</TableAction>
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
        title={editingId ? 'Cập nhật Dự án' : 'Thêm Dự án mới'}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Lưu</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Project Key" required value={form.projectKey} onChange={(e) => setForm({ ...form, projectKey: e.target.value })} />
          <Input label="Tên dự án" required value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} />
          <Input
            label="Source Project Key (Jira)"
            required
            helperText="Phải khớp với Project Key trong file CSV import từ Jira."
            value={form.sourceProjectKey}
            onChange={(e) => setForm({ ...form, sourceProjectKey: e.target.value })}
          />
          <Select
            label="Domain nghiệp vụ"
            options={domainOptions}
            value={form.domainId != null ? String(form.domainId) : ''}
            onChange={(e) => setForm({ ...form, domainId: e.target.value ? Number(e.target.value) : null })}
          />
          <Input label="Lead phụ trách" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} />
          <label className="ui-check">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Đang hoạt động (Active)
          </label>
        </div>
      </Modal>
    </div>
  );
}
