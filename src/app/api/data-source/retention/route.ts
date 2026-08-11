import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getDataRetentionConfig, isValidRawImportRetentionDays, updateDataRetentionConfig } from '@/lib/data-retention-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình thời hạn lưu dữ liệu raw.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getDataRetentionConfig());
  } catch (error: unknown) {
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải cấu hình lưu trữ dữ liệu.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const retentionDays = typeof body === 'object' && body !== null && 'rawImportRetentionDays' in body
      ? (body as { rawImportRetentionDays: unknown }).rawImportRetentionDays
      : undefined;
    if (!isValidRawImportRetentionDays(retentionDays)) {
      return NextResponse.json({ error: 'Số ngày giữ dữ liệu raw phải là số nguyên từ 7 đến 3650.' }, { status: 400 });
    }
    return NextResponse.json(await updateDataRetentionConfig(retentionDays));
  } catch (error: unknown) {
    return authError(error) ?? NextResponse.json({ error: 'Không thể cập nhật cấu hình lưu trữ dữ liệu.' }, { status: 500 });
  }
}
