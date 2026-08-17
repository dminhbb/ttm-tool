import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { previewPurgeRecentLayers, purgeRecentLayers } from '@/lib/data-layer-purge-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản trị Nguồn dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function parseLayerCount(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const layerCount = parseLayerCount(new URL(request.url).searchParams.get('layerCount'));
    if (!layerCount) return NextResponse.json({ error: 'Số lượng lớp dữ liệu không hợp lệ' }, { status: 400 });
    return NextResponse.json(await previewPurgeRecentLayers(layerCount));
  } catch (error: unknown) {
    console.error('API Error previewing recent-layer purge:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xem trước dữ liệu sẽ xóa';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const layerCount = (body as { layerCount?: unknown })?.layerCount;
    if (typeof layerCount !== 'number' || !Number.isInteger(layerCount) || layerCount < 1) {
      return NextResponse.json({ error: 'Số lượng lớp dữ liệu không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json(await purgeRecentLayers(layerCount));
  } catch (error: unknown) {
    console.error('API Error purging recent layers:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa dữ liệu';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
