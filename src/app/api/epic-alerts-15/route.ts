import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { parseEpicAlertFiltersFromSearchParams } from '@/lib/epic-alert-filter-params';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const filters = parseEpicAlertFiltersFromSearchParams(request.nextUrl.searchParams);
    // ttmIndexGlobal is a cheap cached read (see ttm-index-global-cache-service.ts) — it never
    // re-runs the company-wide, permission-unscoped Epic query on this (very frequently viewed)
    // request; it's only ever recomputed once per CSV import.
    const [data, ttmIndexGlobal] = await Promise.all([
      getEpicAlertRowsPhased(user.id, user.role, filters),
      getTtmIndexGlobalCache(),
    ]);
    return NextResponse.json({ ...data, ttmIndexGlobal });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts-15 route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Quản lý Epic 15';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
