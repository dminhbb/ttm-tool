import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { exportSmartSurfaceToSql } from '@/lib/db-backup-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
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
    const { layerDate, includeSchema } = body as Record<string, unknown>;
    if (typeof layerDate !== 'string' || !layerDate) {
      return NextResponse.json({ error: 'Vui lòng chọn ngày mốc lớp dữ liệu.' }, { status: 400 });
    }

    const sql = await exportSmartSurfaceToSql({
      layerDate,
      includeSchema: includeSchema === true,
    });
    const fileName = `ttm-monitor-smart-export-${layerDate}.sql`;

    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error('API Error in db-backup/export-smart route:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể thực hiện Smart Export.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
