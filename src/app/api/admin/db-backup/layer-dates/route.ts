import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listLayerDatesDescending } from '@/lib/data-layer-purge-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/** Every distinct data-layer date (descending) — populates the Start/End Data Layer dropdowns on the export screen. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const dates = await listLayerDatesDescending();
    return NextResponse.json({ dates });
  } catch (error: unknown) {
    console.error('API Error in db-backup/layer-dates route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải danh sách lớp dữ liệu.' }, { status: 500 });
  }
}
