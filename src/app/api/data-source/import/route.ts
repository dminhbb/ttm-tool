import { NextRequest, NextResponse } from 'next/server';
import { processImport } from '@/lib/import-service';
import { DEFAULT_ADAPTER, type AdapterType } from '@/lib/adapters/index';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const aggregatedAtStr = formData.get('aggregatedAt') as string | null;
    const validateOnly = formData.get('validateOnly') === 'true';
    const adapterType = (formData.get('adapterType') as AdapterType | null) ?? DEFAULT_ADAPTER;

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file upload' }, { status: 400 });
    }

    if (!aggregatedAtStr) {
      return NextResponse.json({ error: 'Thời gian tổng hợp dữ liệu là bắt buộc' }, { status: 400 });
    }

    const aggregatedAt = new Date(aggregatedAtStr);
    if (isNaN(aggregatedAt.getTime())) {
      return NextResponse.json({ error: 'Định dạng ngày giờ tổng hợp không hợp lệ' }, { status: 400 });
    }

    const csvText = await file.text();
    const fileName = file.name;

    const result = await processImport(fileName, csvText, aggregatedAt, validateOnly, adapterType);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error in import route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xử lý import file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
