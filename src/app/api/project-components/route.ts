import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createProjectComponent, deleteProjectComponent, listOrphanProjectComponents, listProjectComponents, updateProjectComponent } from '@/lib/master-data-service';
import type { ProjectComponentInput } from '@/lib/master-data-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý Component.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}

function isProjectComponentInput(value: unknown): value is ProjectComponentInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Record<string, unknown>;
  return typeof input.projectKey === 'string' && typeof input.componentName === 'string' && typeof input.isActive === 'boolean';
}

/** Any authenticated role — used by the user-edit popup's component picker and the Components
 * filter on Epic 30/15/in-PO, all of which need the catalog regardless of the viewer's own role.
 * `?orphan=1` restricts to catalog rows not present on any issue's latest known state — SUPERADMIN
 * only, since it's a cleanup diagnostic for the "Quản lý Component" tab, not a filter data source. */
export async function GET(request: NextRequest) {
  try {
    const isOrphanQuery = new URL(request.url).searchParams.get('orphan') === '1';
    if (isOrphanQuery) {
      await requireUser(request, ['SUPERADMIN']);
      return NextResponse.json(await listOrphanProjectComponents());
    }
    await requireUser(request);
    return NextResponse.json(await listProjectComponents());
  } catch (error: unknown) {
    console.error('API Error in project-components route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh mục Components';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const input: unknown = await request.json();
    if (!isProjectComponentInput(input)) return NextResponse.json({ error: 'Dữ liệu Component không hợp lệ.' }, { status: 400 });
    const result = await createProjectComponent(input);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.component, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating project component:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tạo Component.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const input: unknown = await request.json();
    if (!isProjectComponentInput(input) || !('id' in input) || !Number.isInteger((input as { id: unknown }).id) || ((input as { id: number }).id) <= 0) {
      return NextResponse.json({ error: 'Dữ liệu Component không hợp lệ.' }, { status: 400 });
    }
    const { id } = input as ProjectComponentInput & { id: number };
    const result = await updateProjectComponent(id, input);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.component);
  } catch (error: unknown) {
    console.error('API Error updating project component:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể cập nhật Component.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Component ID không hợp lệ.' }, { status: 400 });
    await deleteProjectComponent(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting project component:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể xóa Component.' }, { status: 500 });
  }
}
