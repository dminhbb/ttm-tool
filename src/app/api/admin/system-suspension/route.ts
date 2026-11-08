import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, verifyUserPassword } from '@/lib/auth-service';
import { clientIpOf, checkRateLimit, peekRateLimit } from '@/lib/rate-limit';
import { getSystemSuspension, saveSystemSuspension, SuspensionMessageError } from '@/lib/system-suspension-service';

/** Wrong passwords on this form, per account and source — a stolen SUPERADMIN session must not guess the password here. */
const WRONG_PASSWORD_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Tạm dừng hệ thống.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

/** "Tạm dừng hệ thống" (Quản trị hệ thống) — SUPERADMIN only. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getSystemSuspension({ fresh: true }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading system suspension settings:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình Tạm dừng hệ thống.' }, { status: 500 });
  }
}

/** { isSuspended, messageHtml, allowNewsLetter, allowMcp, password } — the SUPERADMIN's own password confirms the save. */
export async function PUT(request: NextRequest) {
  try {
    // Not in View as (the proxy refuses writes there anyway): the role checked is the real account's.
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json().catch(() => null);
    const { allowMcp, allowNewsLetter, isSuspended, messageHtml, password } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    if (typeof isSuspended !== 'boolean' || typeof allowNewsLetter !== 'boolean' || typeof allowMcp !== 'boolean' || typeof messageHtml !== 'string') {
      return NextResponse.json({ error: 'Dữ liệu cấu hình không hợp lệ.' }, { status: 400 });
    }
    if (typeof password !== 'string' || !password || password.length > 256) {
      return NextResponse.json({ error: 'Vui lòng nhập mật khẩu để xác nhận.' }, { status: 400 });
    }
    const limitKey = `suspensionPassword:${clientIpOf(request.headers)}|${user.id}`;
    const limit = peekRateLimit(limitKey, WRONG_PASSWORD_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    }
    if (!(await verifyUserPassword(user.id, password))) {
      checkRateLimit(limitKey, WRONG_PASSWORD_LIMIT);
      return NextResponse.json({ error: 'Mật khẩu không đúng.', code: 'WRONG_PASSWORD' }, { status: 403 });
    }
    const result = await saveSystemSuspension({ allowMcp, allowNewsLetter, isSuspended, messageHtml }, user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    if (error instanceof SuspensionMessageError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('API Error saving system suspension settings:', error);
    return NextResponse.json({ error: 'Không thể lưu cấu hình Tạm dừng hệ thống.' }, { status: 500 });
  }
}
