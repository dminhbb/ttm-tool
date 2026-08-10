import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRows } from '@/lib/epic-alert-service';

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!isValidDate(from) || !isValidDate(to)) {
      return NextResponse.json({ error: 'Khoảng ngày (from/to) không hợp lệ' }, { status: 400 });
    }
    const data = await getEpicAlertRows(user.id, user.role, from, to);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('API Error in epic-alerts route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu cảnh báo Epic';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
