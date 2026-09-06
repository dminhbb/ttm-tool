import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getActiveBannersForScreen } from '@/lib/info-banner-service';

export const dynamic = 'force-dynamic';

/** Any authenticated user — banners aren't role-gated to view, only to configure (see
 * /api/info-banners). `screenKey` is just the current pathname (e.g. "/epic-alerts-15"); a screen
 * with no banner of its own gets `screenBanner: null` and only the default (if any) shows. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const screenKey = new URL(request.url).searchParams.get('screenKey');
    if (!screenKey) return NextResponse.json({ error: 'Thiếu screenKey' }, { status: 400 });
    return NextResponse.json(await getActiveBannersForScreen(screenKey));
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in info-banners/active route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải Banner thông báo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
