import { NextRequest, NextResponse } from 'next/server';
import { AuthError, getUserRolesByIds, requireUser } from '@/lib/auth-service';
import { canManageUserWithRole } from '@/lib/auth-types';
import { parseUserViewGrantsInput, roleUsesViewGrants } from '@/lib/user-view-grants';
import { findGrantsOutsideScope, getUserViewGrants, saveUserViewGrants } from '@/lib/user-view-grants-service';

/**
 * Tab "Quyền xem" of the user popup (owner 2026-11-01): GET ?userId= reads a user's view grants, PUT { userId,
 * projects, epicKeys, createdAfter, startAfter } replaces them. Only for USER / ADMIN targets; ADMIN and SUPERADMIN
 * configure (SUPERVISOR may read, like the rest of the user screen). Grants only change which Epics Quản trị Epic
 * lists, never a cached verdict — so nothing is marked stale.
 */

function errorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý user.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']);
    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: 'ID user không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await getUserViewGrants(userId));
  } catch (error: unknown) {
    console.error('API Error loading view grants:', error);
    return errorResponse(error) ?? NextResponse.json({ error: 'Không thể tải quyền xem.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body: unknown = await request.json().catch(() => null);
    const userId = Number((body as { userId?: unknown } | null)?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: 'ID user không hợp lệ.' }, { status: 400 });
    const parsed = parseUserViewGrantsInput(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const targetRole = (await getUserRolesByIds([userId])).get(userId);
    if (!targetRole) return NextResponse.json({ error: 'Không tìm thấy user.' }, { status: 404 });
    if (!canManageUserWithRole(actor.role, targetRole)) {
      return NextResponse.json({ error: 'Bạn không có quyền thao tác trên user có role ngang hoặc cao hơn role của bạn.' }, { status: 403 });
    }
    if (!roleUsesViewGrants(targetRole)) {
      return NextResponse.json({ error: 'Quyền xem chỉ áp dụng cho user role USER hoặc ADMIN.' }, { status: 400 });
    }
    // An ADMIN hands out only what lies in their own data scope (new grants; what the user already has stays).
    const outside = await findGrantsOutsideScope(actor, userId, parsed.value);
    if (outside.length > 0) {
      return NextResponse.json({ error: `Bạn chỉ cấp quyền xem trong phạm vi dữ liệu của mình. Ngoài phạm vi: ${outside.slice(0, 5).join(', ')}${outside.length > 5 ? `… (+${outside.length - 5})` : ''}.` }, { status: 403 });
    }
    await saveUserViewGrants(userId, parsed.value, actor.id);
    return NextResponse.json(await getUserViewGrants(userId));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'ERR_UNKNOWN_PROJECT') return NextResponse.json({ error: 'Một hoặc nhiều Dự án không tồn tại.' }, { status: 400 });
    console.error('API Error saving view grants:', error);
    return errorResponse(error) ?? NextResponse.json({ error: 'Không thể lưu quyền xem.' }, { status: 500 });
  }
}
