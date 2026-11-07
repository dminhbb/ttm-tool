import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getEarlyStartReportPage } from '@/modules/ttm/public';

/**
 * "Báo cáo Epic start sớm" (owner 2026-11-04), within the viewer's report scope.
 *   GET → widgets (the cache entry written by the last cache rebuild) + the table (live). The header widget
 *         "TTM-CNTT (SỚM)" no longer calls this: it reads the company-wide numbers from /api/ttm-index-global.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser(request);
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
