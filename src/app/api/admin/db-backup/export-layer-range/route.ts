import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { exportDataLayerRangeToSql } from '@/lib/db-backup-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const { startDate, endDate, includeRawData, includeSchema } = body as Record<string, unknown>;
    if (typeof startDate !== 'string' || typeof endDate !== 'string' || !startDate || !endDate) {
      return NextResponse.json({ error: 'Vui lòng chọn Start Data Layer và End Data Layer.' }, { status: 400 });
    }

    const sql = await exportDataLayerRangeToSql({
      startDate,
      endDate,
      includeRawData: includeRawData === true,
      includeSchema: includeSchema === true,
    });
    const fileName = `ttm-monitor-layer-export-${startDate}_to_${endDate}.sql`;

    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error('API Error in db-backup/export-layer-range route:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể export dữ liệu theo lớp dữ liệu.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
