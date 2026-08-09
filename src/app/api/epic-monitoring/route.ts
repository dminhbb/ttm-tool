import { NextRequest, NextResponse } from 'next/server';
import { getEpicMonitoring } from '@/lib/epic-monitoring-service';

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';

    if (!isValidDate(from) || !isValidDate(to)) {
      return NextResponse.json({ error: 'Khoảng ngày (from/to) không hợp lệ' }, { status: 400 });
    }

    const data = await getEpicMonitoring(from, to);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('API Error in epic-monitoring route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Epic Monitoring';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
