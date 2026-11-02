import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listReadRegistrationIds, markRegistrationsRead } from '@/lib/user-admin-report-service';

/** "Đã đọc" of tab "Duyệt đăng ký mới" — each admin's own read state (who may open Quản lý user). */
const ROLES = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'] as const;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền thực hiện thao tác này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, [...ROLES]);
    return NextResponse.json({ readIds: await listReadRegistrationIds(user.id) });
  } catch (error: unknown) {
    console.error('API Error loading registration reads:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải trạng thái đã đọc.' }, { status: 500 });
  }
}

/** Body { ids: number[] } (1–100 pending registrations) — marks them read for the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, [...ROLES]);
    const ids = ((await request.json().catch(() => null)) as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((id) => Number.isSafeInteger(id) && (id as number) > 0)) {
      return NextResponse.json({ error: 'Danh sách đăng ký không hợp lệ.' }, { status: 400 });
    }
    const marked = await markRegistrationsRead(user.id, ids as number[]);
    return NextResponse.json({ marked, readIds: await listReadRegistrationIds(user.id) });
  } catch (error: unknown) {
    console.error('API Error marking registrations read:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể đánh dấu đã đọc.' }, { status: 500 });
  }
}
