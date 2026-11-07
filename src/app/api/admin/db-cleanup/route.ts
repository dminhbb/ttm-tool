import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, verifyUserPassword } from '@/lib/auth-service';
import { previewCleanup, runCleanup } from '@/lib/db-cleanup-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền dọn dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function parseRetentionDays(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const retentionDays = parseRetentionDays(new URL(request.url).searchParams.get('retentionDays'));
    if (retentionDays === null) return NextResponse.json({ error: 'Số ngày giữ lại không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await previewCleanup(retentionDays));
  } catch (error: unknown) {
    console.error('API Error in db-cleanup preview:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể xem trước dữ liệu sẽ dọn.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const { retentionDays: rawRetentionDays, limit: rawLimit, password } = body as Record<string, unknown>;
    const retentionDays = Number(rawRetentionDays);
    if (!Number.isInteger(retentionDays)) return NextResponse.json({ error: 'Số ngày giữ lại không hợp lệ.' }, { status: 400 });

    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập mật khẩu để xác nhận dọn dữ liệu.' }, { status: 400 });
    }
    if (!(await verifyUserPassword(actor.id, password))) {
      return NextResponse.json({ error: 'Mật khẩu không đúng.', code: 'WRONG_PASSWORD' }, { status: 403 });
    }

    // Optional: at most this many issue rows (the tab "Dọn lịch sử" cleans in rounds); omitted = everything planned.
    const limit = rawLimit === undefined || rawLimit === null ? null : Number(rawLimit);
    return NextResponse.json(await runCleanup(retentionDays, limit));
  } catch (error: unknown) {
    console.error('API Error in db-cleanup execute:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể dọn dữ liệu.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
