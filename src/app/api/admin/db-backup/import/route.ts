import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { importSqlFile, previewImportFile } from '@/lib/db-backup-service';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Chỉ chấp nhận file .sql tối đa ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` }, { status: 400 });
    }

    const sqlText = await file.text();
    const isDryRun = new URL(request.url).searchParams.get('dryRun') === '1';

    if (isDryRun) {
      const result = previewImportFile(sqlText);
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result.preview);
    }

    const result = await importSqlFile(sqlText);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error: unknown) {
    console.error('API Error in db-backup/import route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể import dữ liệu.' }, { status: 500 });
  }
}
