import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, verifyUserPassword } from '@/lib/auth-service';
import { exportSmartSurfaceToSql } from '@/lib/db-backup-service';
import { DEFAULT_SMART_EXPORT_SCOPE, isSmartExportScope } from '@/lib/db-backup-tables';
import { withSlowLog } from '@/lib/slow-operation';

// Reads every surface issue plus ~45 config tables of a large database — same budget as ./import.
export const maxDuration = 300;

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
    const actor = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const { layerDate, includeSchema, password, scope } = body as Record<string, unknown>;
    if (scope !== undefined && !isSmartExportScope(scope)) {
      return NextResponse.json({ error: 'Phạm vi Smart export không hợp lệ.' }, { status: 400 });
    }
    // The file carries every user with their password hash: the signed-in SUPERADMIN confirms with their own password.
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập mật khẩu để xác nhận export.' }, { status: 400 });
    }
    if (!(await verifyUserPassword(actor.id, password))) {
      return NextResponse.json({ error: 'Mật khẩu không đúng.', code: 'WRONG_PASSWORD' }, { status: 403 });
    }
    if (typeof layerDate !== 'string' || !layerDate) {
      return NextResponse.json({ error: 'Vui lòng chọn ngày mốc lớp dữ liệu.' }, { status: 400 });
    }

    const sql = await withSlowLog('Smart export', () => exportSmartSurfaceToSql({
      layerDate,
      includeSchema: includeSchema === true,
      scope: isSmartExportScope(scope) ? scope : DEFAULT_SMART_EXPORT_SCOPE,
    }));
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
