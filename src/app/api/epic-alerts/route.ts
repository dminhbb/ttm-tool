import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRows } from '@/lib/epic-alert-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const data = await getEpicAlertRows(user.id, user.role);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('API Error in epic-alerts route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu cảnh báo Epic';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
