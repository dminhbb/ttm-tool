import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getTtmDashboard2Rows } from '@/modules/ttm/public';

/**
 * The funnel fields of every Epic in the viewer's scope (or the previewed user's) — TTM Dashboard 2
 * fetches this only once a toolbar filter is applied, then recomputes the funnel in the browser.
 * Authentication remains at the transport boundary; IAM/TTM orchestration lives in the use case.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const data = await getTtmDashboard2Rows(actor, request.nextUrl.searchParams.get('viewAsUserId'));
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    console.error('TTM Dashboard 2 rows API error:', error);
    return NextResponse.json({ error: 'Không thể tải dữ liệu Epic cho bộ lọc.' }, { status: 500 });
  }
}
