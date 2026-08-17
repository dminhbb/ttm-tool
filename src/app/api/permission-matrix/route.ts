import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getPermissionMatrix, saveRoleFeaturePermissions } from '@/lib/permission-matrix-service';
import type { RoleFeaturePermission } from '@/lib/permission-matrix-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý ma trận phân quyền.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPermissionRow(value: unknown): value is RoleFeaturePermission {
  return isRecord(value)
    && typeof value.featureKey === 'string' && value.featureKey.length > 0
    && (value.role === 'ADMIN' || value.role === 'USER')
    && typeof value.canView === 'boolean'
    && typeof value.canAdd === 'boolean'
    && typeof value.canEdit === 'boolean'
    && typeof value.canDelete === 'boolean';
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getPermissionMatrix());
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading permission matrix:', error);
    return NextResponse.json({ error: 'Không thể tải ma trận phân quyền.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.permissions) || !body.permissions.every(isPermissionRow)) {
      return NextResponse.json({ error: 'Dữ liệu ma trận phân quyền không hợp lệ.' }, { status: 400 });
    }
    const updates = body.permissions as RoleFeaturePermission[];

    const { features } = await getPermissionMatrix();
    const featuresByKey = new Map(features.map((feature) => [feature.featureKey, feature]));
    for (const update of updates) {
      const feature = featuresByKey.get(update.featureKey);
      if (!feature) return NextResponse.json({ error: `Chức năng "${update.featureKey}" không tồn tại.` }, { status: 400 });
      if (feature.category === 'VIEW_ONLY' && (update.canAdd || update.canEdit || update.canDelete)) {
        return NextResponse.json({ error: `"${feature.featureName}" chỉ có quyền Xem, không có Thêm/Sửa/Xóa.` }, { status: 400 });
      }
    }

    await saveRoleFeaturePermissions(updates);
    return NextResponse.json(await getPermissionMatrix());
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error saving permission matrix:', error);
    return NextResponse.json({ error: 'Không thể lưu ma trận phân quyền.' }, { status: 500 });
  }
}
