import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { loadTtmDashboard2Rows } from '@/lib/ttm-dashboard-2-cache-service';
import { resolveViewAsTarget, VIEW_AS_ALLOWED_ROLES } from '@/lib/view-as-user-service';

/**
 * The funnel fields of every Epic in the viewer's scope (or the previewed user's) — TTM Dashboard 2
 * fetches this only once a toolbar filter is applied, then recomputes the funnel in the browser
 * (ttm-funnel-summary.ts). The unfiltered numbers come from the cache via the parent route.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    if (!VIEW_AS_ALLOWED_ROLES.includes(actor.role)) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập chức năng này (Yêu cầu role Supervisor trở lên).' }, { status: 403 });
    }
    const target = await resolveViewAsTarget(actor, request.nextUrl.searchParams.get('viewAsUserId'));
    return NextResponse.json({ rows: await loadTtmDashboard2Rows(target.userId, target.role) });
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
