import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { deleteAggregatedDataLayer, listAggregatedDataLayers } from '@/lib/aggregated-data-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý dữ liệu tổng hợp.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const layers = await listAggregatedDataLayers();
    return NextResponse.json(layers);
  } catch (error: unknown) {
    console.error('API Error in aggregated-history route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi lấy danh sách lớp dữ liệu tổng hợp.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const layerDate = new URL(request.url).searchParams.get('layerDate');
    if (!layerDate || Number.isNaN(new Date(layerDate).getTime())) {
      return NextResponse.json({ error: 'layerDate không hợp lệ.' }, { status: 400 });
    }
    await deleteAggregatedDataLayer(layerDate);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error in aggregated-history delete route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi xóa lớp dữ liệu tổng hợp.' }, { status: 500 });
  }
}
