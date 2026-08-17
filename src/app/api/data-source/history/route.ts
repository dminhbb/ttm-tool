import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getImportHistory, deleteImportBatch, getBatchValidationDetail } from '@/lib/import-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản trị Nguồn dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const url = new URL(request.url);
    const batchIdStr = url.searchParams.get('batchId');

    if (batchIdStr) {
      const batchId = parseInt(batchIdStr);
      if (isNaN(batchId)) {
        return NextResponse.json({ error: 'Mã đợt (batch ID) không hợp lệ' }, { status: 400 });
      }
      const details = await getBatchValidationDetail(batchId);
      return NextResponse.json(details);
    }

    const history = await getImportHistory();
    return NextResponse.json(history);
  } catch (error: unknown) {
    console.error('API Error in history route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi lấy lịch sử import';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const url = new URL(request.url);
    const batchIdStr = url.searchParams.get('batchId');

    if (!batchIdStr) {
      return NextResponse.json({ error: 'Mã đợt (batch ID) là bắt buộc' }, { status: 400 });
    }

    const batchId = parseInt(batchIdStr);
    if (isNaN(batchId)) {
      return NextResponse.json({ error: 'Mã đợt (batch ID) không hợp lệ' }, { status: 400 });
    }

    await deleteImportBatch(batchId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error in delete batch route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa đợt import';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
