import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getCacheOverview } from '@/lib/daily-cache-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được xem thông tin cache.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

/** "Theo dõi cache" panel on Quản trị nguồn dữ liệu (SUPERADMIN-only, same as that screen). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getCacheOverview());
  } catch (error: unknown) {
    console.error('API Error in admin/data-source/cache-status route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không đọc được thông tin cache.' }, { status: 500 });
  }
}
