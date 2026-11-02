import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getUserReport } from '@/lib/user-admin-report-service';

/** Tab "Báo cáo user" of Quản lý user — same roles as the user list itself (GET /api/users). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']);
    return NextResponse.json({ rows: await getUserReport() });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem báo cáo user.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    }
    console.error('API Error loading user report:', error);
    return NextResponse.json({ error: 'Không thể tải báo cáo user.' }, { status: 500 });
  }
}
