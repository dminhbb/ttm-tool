import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listBackupTables } from '@/lib/db-backup-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await listBackupTables());
  } catch (error: unknown) {
    console.error('API Error in db-backup/tables route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải danh sách bảng.' }, { status: 500 });
  }
}
