import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { importProjectComponentsCsv } from '@/lib/master-data-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản trị Nguồn dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Không tìm thấy file upload' }, { status: 400 });

    const csvText = await file.text();
    const result = await importProjectComponentsCsv(csvText);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error in import-components route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xử lý import file Components';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
