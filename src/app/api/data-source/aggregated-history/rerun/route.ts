import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { rerunAggregatedDataLayer } from '@/lib/aggregated-data-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý dữ liệu tổng hợp.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const layerDate = typeof body === 'object' && body !== null && 'layerDate' in body
      ? (body as { layerDate: unknown }).layerDate
      : undefined;
    if (typeof layerDate !== 'string' || Number.isNaN(new Date(layerDate).getTime())) {
      return NextResponse.json({ error: 'layerDate không hợp lệ.' }, { status: 400 });
    }
    await rerunAggregatedDataLayer(layerDate);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error in aggregated-history rerun route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi chạy lại dữ liệu tổng hợp.';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
