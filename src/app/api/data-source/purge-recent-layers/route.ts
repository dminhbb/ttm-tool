import { NextRequest, NextResponse } from 'next/server';
import { previewPurgeRecentLayers, purgeRecentLayers } from '@/lib/data-layer-purge-service';

function parseLayerCount(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const layerCount = parseLayerCount(new URL(request.url).searchParams.get('layerCount'));
    if (!layerCount) return NextResponse.json({ error: 'Số lượng lớp dữ liệu không hợp lệ' }, { status: 400 });
    return NextResponse.json(await previewPurgeRecentLayers(layerCount));
  } catch (error: unknown) {
    console.error('API Error previewing recent-layer purge:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xem trước dữ liệu sẽ xóa';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const layerCount = (body as { layerCount?: unknown })?.layerCount;
    if (typeof layerCount !== 'number' || !Number.isInteger(layerCount) || layerCount < 1) {
      return NextResponse.json({ error: 'Số lượng lớp dữ liệu không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json(await purgeRecentLayers(layerCount));
  } catch (error: unknown) {
    console.error('API Error purging recent layers:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa dữ liệu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
