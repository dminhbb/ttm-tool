import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem thống kê này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/**
 * Company-wide TTM-CNTT (QLDA) / TTM-CNTT (QA) / TTM-E2E ratios — same cached singleton row
 * `dashboard-new`'s own API embeds in its heavier payload (ttm-index-global-cache-service.ts), but
 * exposed standalone so other screens (Quản trị Epic's header banner) can show the same 3 widgets
 * without loading the whole company's Epic row set just for this.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const ttmIndexGlobal = await getTtmIndexGlobalCache();
    return NextResponse.json({ ttmIndexGlobal });
  } catch (error) {
    console.error('TTM index global API error:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải chỉ số TTM toàn công ty.' }, { status: 500 });
  }
}
