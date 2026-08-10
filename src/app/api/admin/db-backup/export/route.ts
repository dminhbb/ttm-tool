import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { exportTablesToSql } from '@/lib/db-backup-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('tables' in body) || !isStringArray((body as Record<string, unknown>).tables)) {
      return NextResponse.json({ error: 'Danh sách bảng không hợp lệ.' }, { status: 400 });
    }
    const tables = (body as { tables: string[] }).tables;
    const includeSchema = (body as { includeSchema?: unknown }).includeSchema === true;

    const sql = await exportTablesToSql(tables, includeSchema);
    const fileName = `ttm-monitor-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sql`;

    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error('API Error in db-backup/export route:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể export dữ liệu.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
