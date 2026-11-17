import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import {
  generateImportApiToken,
  getImportApiTokenSettings,
  ImportApiTokenError,
  saveImportApiToken,
} from '@/lib/import-api-token-service';

/** Quản trị hệ thống → "Token import tự động" (SUPERADMIN): the token of POST /api/data-source/import/auto. */

const NO_STORE = { 'Cache-Control': 'no-store' };

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình token import tự động.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  if (error instanceof ImportApiTokenError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(`API Error (import API token): ${fallback}`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getImportApiTokenSettings(), { headers: NO_STORE });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể tải token import tự động.');
  }
}

/** { token: string } sets the given token, { generate: true } a new random one, { token: null } clears it. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json().catch(() => null);
    const record = (typeof body === 'object' && body !== null ? body : {}) as { generate?: unknown; token?: unknown };
    let token: string | null;
    if (record.generate === true) token = generateImportApiToken();
    else if (record.token === null) token = null;
    else if (typeof record.token === 'string') token = record.token;
    else return NextResponse.json({ error: 'Thiếu token.' }, { status: 400 });
    return NextResponse.json(await saveImportApiToken(token, user.id), { headers: NO_STORE });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể lưu token import tự động.');
  }
}
