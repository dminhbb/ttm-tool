'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { AuthUser, DomainSummary, ProjectSummary, UserProfileDetails } from '@/lib/auth-types';

export interface UserInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<AuthUser['role'], string> = { SUPERADMIN: 'Superadmin', ADMIN: 'Admin', SUPERVISOR: 'Supervisor', USER: 'User' };

type ProfileResponse = { user: AuthUser } & UserProfileDetails;

function isProfileResponse(value: unknown): value is ProfileResponse {
  return typeof value === 'object' && value !== null && 'user' in value && 'domains' in value && 'ledProjects' in value;
}

function DomainList({ domains }: { domains: DomainSummary[] }) {
  if (domains.length === 0) return <p className="text-sm text-fb-text-secondary">Chưa được gán domain.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {domains.map((domain) => (
        <li key={domain.id}>
          <Badge variant="info">{domain.domainCode} — {domain.domainName}</Badge>
        </li>
      ))}
    </ul>
  );
}

function UsageStatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-fb-border bg-fb-surface-muted px-3 py-2">
      <p className="text-xl font-bold text-fb-text-primary">{value}</p>
      <p className="text-xs text-fb-text-secondary">{label}</p>
    </div>
  );
}

function ProjectList({ projects, emptyText }: { projects: ProjectSummary[]; emptyText: string }) {
  if (projects.length === 0) return <p className="text-sm text-fb-text-secondary">{emptyText}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {projects.map((project) => (
        <li key={project.id}>
          <Badge variant="neutral">{project.projectKey} — {project.projectName}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function UserInfoModal({ isOpen, onClose }: UserInfoModalProps) {
  const [data, setData] = React.useState<ProfileResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/auth/profile', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;
        if (isProfileResponse(payload)) { setData(payload); setError(null); }
        else setError('Không thể tải thông tin người dùng.');
      })
      .catch(() => { if (!cancelled) setError('Không thể tải thông tin người dùng.'); });
    return () => { cancelled = true; };
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Thông tin người dùng"
      footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}
    >
      {error && <p className="text-sm text-status-danger">{error}</p>}
      {!error && !data && <p className="text-sm text-fb-text-secondary">Đang tải...</p>}
      {data && (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-1">
            <h3 className="ui-card-title">Tên</h3>
            <p className="text-sm text-fb-text-primary">{data.user.fullName}</p>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="ui-card-title">Username</h3>
            <p className="text-sm text-fb-text-primary">{data.user.email}</p>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="ui-card-title">Vai trò</h3>
            <p className="text-sm text-fb-text-primary">{ROLE_LABEL[data.user.role]}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="ui-card-title">Thống kê sử dụng (cộng dồn)</h3>
            <div className="grid grid-cols-3 gap-3">
              <UsageStatTile label="Lượt đăng nhập" value={data.usageStats.loginCount} />
              <UsageStatTile label="Lượt dùng chức năng" value={data.usageStats.featureCount} />
              <UsageStatTile label="Lượt dùng dữ liệu" value={data.usageStats.dataCount} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="ui-card-title">Domain</h3>
            <DomainList domains={data.domains} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="ui-card-title">Dự án phụ trách (PM/SM)</h3>
            <ProjectList projects={data.ledProjects} emptyText="Chưa phụ trách dự án nào." />
          </section>

          {data.viewableProjects && (
            <section className="flex flex-col gap-2">
              <h3 className="ui-card-title">Dự án có quyền xem thông tin</h3>
              <p className="text-xs text-fb-text-secondary">Theo domain được gán — dùng cho các trang giám sát Epic.</p>
              <ProjectList projects={data.viewableProjects} emptyText="Chưa có dự án nào trong domain được gán." />
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
