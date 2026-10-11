import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getTtmDashboard2 } from '@/modules/ttm/public';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const data = await getTtmDashboard2(actor, request.nextUrl.searchParams.get('viewAsUserId'));
    return NextResponse.json(data);
  } catch (error) {
    console.error('TTM Dashboard 2 API error:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải dữ liệu TTM Dashboard 2.' }, { status: 500 });
  }
}
