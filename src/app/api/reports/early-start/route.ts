import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getEarlyStartReport, getReportAccessScope } from '@/modules/ttm/public';

/** "Báo cáo Epic start sớm" (owner 2026-11-04) — read from the Epic row cache, within the viewer's report scope. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser(request);
    const scope = await getReportAccessScope(user);
    const report = await getEarlyStartReport(scope);
    return NextResponse.json({ success: true, ...report });
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
