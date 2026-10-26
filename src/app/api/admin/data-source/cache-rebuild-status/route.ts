import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getCacheRebuildStatus } from '@/lib/daily-cache-service';

/**
 * Whether the derived caches were built with an older configuration (getCacheRebuildStatus) — the unread dot of
 * the "Theo dõi cache dữ liệu" tab and of the "Nguồn dữ liệu" menu item (SUPERADMIN, who runs "Tạo lại cache").
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getCacheRebuildStatus());
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    }
    console.error('API Error in cache-rebuild-status:', error);
    return NextResponse.json({ error: 'Không thể kiểm tra trạng thái cache.' }, { status: 500 });
  }
}
