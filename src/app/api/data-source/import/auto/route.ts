import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processImport } from '@/lib/import-service';
import { ADAPTER_TYPES } from '@/lib/adapters/index';

/**
 * Machine-to-machine counterpart of the "Quản trị nguồn dữ liệu" upload form, for the Python
 * export script to call directly after it finishes writing a CSV — same import pipeline
 * (processImport), same CSV format/adapter, just a different door in:
 * - Auth is a static bearer token (IMPORT_API_TOKEN env var), not a user session — this endpoint
 *   is intentionally separate from POST /api/data-source/import (which stays session+SUPERADMIN-
 *   gated for the UI) so the token can be rotated/revoked without touching interactive admin
 *   access, and so auto-imports are distinguishable in the import history (see processImport's
 *   importType/importedBy params).
 * - aggregatedAt is always "now" (server clock at call time) — the script doesn't pass one; this
 *   matches "the export just finished, import it as of right now."
 * - adapterType is fixed to PY_JIRA_API — this route only ever receives the script's own format.
 */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — comfortably above the script's <500KB exports.

function hashOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison via fixed-length SHA-256 digests, so unequal-length input (e.g. an
 * empty or wildly wrong header) can't throw the length-mismatch error timingSafeEqual raises on
 * differently-sized buffers, and comparison time doesn't leak how many leading bytes matched. */
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
    const result = await processImport(file.name, csvText, new Date(), false, ADAPTER_TYPES.PY_JIRA_API, 'AUTO', 'Python Script (Auto Import)');
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error in auto-import route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xử lý import file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
