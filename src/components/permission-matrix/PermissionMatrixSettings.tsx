'use client';

import { useEffect, useMemo, useState } from 'react';
import { FloppyDisk } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { UserRole } from '@/lib/auth-types';
import type { PermissionFeature, PermissionMatrix, RoleFeaturePermission } from '@/lib/permission-matrix-types';

interface Notice { text: string; type: 'error' | 'success'; }

const EDITABLE_ROLES: UserRole[] = ['ADMIN', 'USER'];
const ROLE_LABEL: Record<UserRole, string> = { SUPERADMIN: 'Superadmin', ADMIN: 'Admin', USER: 'User' };
const ACTIONS: { key: keyof Pick<RoleFeaturePermission, 'canView' | 'canAdd' | 'canEdit' | 'canDelete'>; label: string }[] = [
  { key: 'canView', label: 'Xem' },
  { key: 'canAdd', label: 'Thêm' },
  { key: 'canEdit', label: 'Sửa' },
  { key: 'canDelete', label: 'Xóa' },
];

const readError = (value: unknown, fallback: string) =>
  typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : fallback;

function permissionKey(featureKey: string, role: UserRole): string {
  return `${featureKey}::${role}`;
}

export function PermissionMatrixSettings() {
  const [features, setFeatures] = useState<PermissionFeature[]>([]);
  const [permissions, setPermissions] = useState<Map<string, RoleFeaturePermission>>(new Map());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/permission-matrix', { cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể tải ma trận phân quyền.'));
      const data = payload as PermissionMatrix;
      setFeatures(data.features);
      setPermissions(new Map(data.permissions.map((permission) => [permissionKey(permission.featureKey, permission.role), permission])));
      setDirty(false);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể tải ma trận phân quyền.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const toggle = (feature: PermissionFeature, role: UserRole, action: (typeof ACTIONS)[number]['key']) => {
    setPermissions((current) => {
      const key = permissionKey(feature.featureKey, role);
      const existing = current.get(key) ?? { featureKey: feature.featureKey, role, canView: false, canAdd: false, canEdit: false, canDelete: false };
      const next = new Map(current);
      const updated = { ...existing, [action]: !existing[action] };
      // Non-admin features only carry a meaningful "Xem" — add/edit/delete never apply.
      if (feature.category === 'VIEW_ONLY') { updated.canAdd = false; updated.canEdit = false; updated.canDelete = false; }
      next.set(key, updated);
      return next;
    });
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { permissions: features.flatMap((feature) => EDITABLE_ROLES.map((role) => permissions.get(permissionKey(feature.featureKey, role)) ?? { featureKey: feature.featureKey, role, canView: false, canAdd: false, canEdit: false, canDelete: false })) };
      const response = await fetch('/api/permission-matrix', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể lưu ma trận phân quyền.'));
      const data = payload as PermissionMatrix;
      setFeatures(data.features);
      setPermissions(new Map(data.permissions.map((permission) => [permissionKey(permission.featureKey, permission.role), permission])));
      setDirty(false);
      setNotice({ text: 'Đã lưu ma trận phân quyền.', type: 'success' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu ma trận phân quyền.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const adminFeatures = useMemo(() => features.filter((feature) => feature.category === 'ADMIN'), [features]);
  const viewOnlyFeatures = useMemo(() => features.filter((feature) => feature.category === 'VIEW_ONLY'), [features]);

  const renderCell = (feature: PermissionFeature, role: UserRole, action: (typeof ACTIONS)[number]['key']) => {
    if (role === 'SUPERADMIN') return <input type="checkbox" checked disabled aria-label={`${ROLE_LABEL[role]} luôn có quyền ${action}`} />;
    if (feature.category === 'VIEW_ONLY' && action !== 'canView') return <span className="text-fb-text-placeholder">—</span>;
    const value = permissions.get(permissionKey(feature.featureKey, role))?.[action] ?? false;
    return (
      <input
        type="checkbox"
        checked={value}
        onChange={() => toggle(feature, role, action)}
        aria-label={`${feature.featureName} — ${ROLE_LABEL[role]} — ${action}`}
      />
    );
  };

  const renderSection = (title: string, description: string, rows: PermissionFeature[]) => rows.length === 0 ? null : (
    <div>
      <p className="mb-2 text-sm font-bold text-fb-text-primary">{title}</p>
      <p className="mb-3 text-xs text-fb-text-secondary">{description}</p>
      <TableContainer>
        <Table className="min-w-[960px]">
          <THead>
            <TR>
              <TH rowSpan={2} className="align-bottom">Chức năng</TH>
              {(['SUPERADMIN', 'ADMIN', 'USER'] as UserRole[]).map((role) => (
                <TH key={role} colSpan={4} className="text-center border-l border-fb-border">{ROLE_LABEL[role]}</TH>
              ))}
            </TR>
            <TR>
              {(['SUPERADMIN', 'ADMIN', 'USER'] as UserRole[]).map((role) => ACTIONS.map((action, index) => (
                <TH key={`${role}-${action.key}`} className={`text-center text-[10px] font-medium text-fb-text-secondary ${index === 0 ? 'border-l border-fb-border' : ''}`}>{action.label}</TH>
              )))}
            </TR>
          </THead>
          <TBody>
            {rows.map((feature) => (
              <TR key={feature.featureKey}>
                <TD className="font-semibold text-fb-text-primary">{feature.featureName}</TD>
                {(['SUPERADMIN', 'ADMIN', 'USER'] as UserRole[]).map((role) => ACTIONS.map((action, index) => (
                  <TD key={`${role}-${action.key}`} className={`text-center ${index === 0 ? 'border-l border-fb-border' : ''}`}>{renderCell(feature, role, action.key)}</TD>
                )))}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert title={notice.type === 'success' ? 'Thành công' : 'Lỗi'} variant={notice.type === 'success' ? 'success' : 'error'}>{notice.text}</Alert>}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ma trận phân quyền</CardTitle>
            <p className="mt-1 text-fb-text-secondary">Superadmin luôn có đầy đủ quyền Xem/Thêm/Sửa/Xóa trên mọi chức năng. Các chức năng mới bổ sung sau sẽ được cập nhật vào ma trận theo yêu cầu riêng.</p>
          </div>
          <Button icon={<FloppyDisk className="size-4" weight="bold" />} isLoading={saving} disabled={!dirty} onClick={() => void save()} size="sm">Lưu ma trận</Button>
        </CardHeader>
        <CardBody className="flex flex-col gap-6">
          {loading ? <TableSkeleton rows={6} /> : (
            <>
              {renderSection('Chức năng quản trị', 'Cho phép chỉnh sửa từng quyền Xem/Thêm/Sửa/Xóa theo vai trò.', adminFeatures)}
              {renderSection('Chức năng khác', 'Màn hình theo dõi Epic, popup hướng dẫn và tài liệu sản phẩm — chỉ có quyền Xem.', viewOnlyFeatures)}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
