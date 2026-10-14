import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getDashboardViewSettings, setLeadViewForAllUsers } from '@/lib/dashboard-view-settings-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Dashboard.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

/** "Dashboard Lead view cho tất cả user" toggle (Quản trị hệ thống). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getDashboardViewSettings());
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading dashboard view settings:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình Dashboard.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json().catch(() => null);
    const enabled = typeof body === 'object' && body !== null && typeof (body as { leadViewForAllUsers?: unknown }).leadViewForAllUsers === 'boolean'
      ? (body as { leadViewForAllUsers: boolean }).leadViewForAllUsers
      : null;
    if (enabled === null) return NextResponse.json({ error: 'Thiếu leadViewForAllUsers.' }, { status: 400 });
    return NextResponse.json(await setLeadViewForAllUsers(enabled, user.id));
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error updating dashboard view settings:', error);
    return NextResponse.json({ error: 'Không thể cập nhật cấu hình Dashboard.' }, { status: 500 });
  }
}
