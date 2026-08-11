import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
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
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const retentionDays = typeof body === 'object' && body !== null && 'retentionDays' in body ? Number((body as { retentionDays: unknown }).retentionDays) : NaN;
    if (!Number.isInteger(retentionDays)) return NextResponse.json({ error: 'Số ngày giữ lại không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await runCleanup(retentionDays));
  } catch (error: unknown) {
    console.error('API Error in db-cleanup execute:', error);
    const authErr = authError(error);
    if (authErr) return authErr;
    const message = error instanceof Error ? error.message : 'Không thể dọn dữ liệu.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
