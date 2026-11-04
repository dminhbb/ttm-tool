import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getEarlyStartReportPage, getLatestEarlyStartSummary } from '@/modules/ttm/public';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04), within the viewer's report scope.
 *   GET                 → widgets (today's cache entry, built on the first visit of the day) + the table (live)
 *   GET ?summary=latest → only the newest cached widgets, never built here — the header widget "TTM-CNTT (SỚM)"
 *                         of TTM Dashboard 2 / Quản trị Epic; { summary: null } while the report was never opened.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser(request);
    if (request.nextUrl.searchParams.get('summary') === 'latest') {
      return NextResponse.json({ success: true, summary: await getLatestEarlyStartSummary(user) });
    }
    return NextResponse.json({ success: true, ...(await getEarlyStartReportPage(user)) });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem Báo cáo.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    const message = error instanceof Error ? error.message : 'Không thể tải Báo cáo Epic start sớm.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
