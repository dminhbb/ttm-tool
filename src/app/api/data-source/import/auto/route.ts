import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ADAPTER_TYPES, executeImport } from '@/modules/integration/public';

/**
 * Machine-to-machine counterpart of the UI upload. The public Integration facade deliberately
 * preserves the same synchronous legacy pipeline in this architecture wave.
 */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function hashOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function isValidToken(provided: string, expected: string): boolean {
  return timingSafeEqual(hashOf(provided), hashOf(expected));
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.IMPORT_API_TOKEN;
  if (!expectedToken) {
    console.error('POST /api/data-source/import/auto: IMPORT_API_TOKEN is not configured.');
    return NextResponse.json({ error: 'Chức năng import tự động chưa được cấu hình trên server.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!providedToken || !isValidToken(providedToken, expectedToken)) {
    return NextResponse.json({ error: 'Token không hợp lệ.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file upload (field "file").' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `File vượt quá giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` }, { status: 413 });
    }

    const csvText = await file.text();
    const result = await executeImport(file.name, csvText, new Date(), false, ADAPTER_TYPES.PY_JIRA_API, 'AUTO', 'Python Script (Auto Import)');
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error in auto-import route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xử lý import file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
