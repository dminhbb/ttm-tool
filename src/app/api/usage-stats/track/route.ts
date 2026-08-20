import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { recordUsageEvent } from '@/lib/usage-stats-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body: unknown = await request.json().catch(() => null);
    const kind = typeof body === 'object' && body !== null && 'kind' in body ? body.kind : null;
    if (kind !== 'feature' && kind !== 'data') return NextResponse.json({ error: 'Loại thống kê không hợp lệ.' }, { status: 400 });
    await recordUsageEvent(user.id, kind);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error recording usage stat:', error);
    return NextResponse.json({ error: 'Không thể ghi nhận thống kê sử dụng.' }, { status: 500 });
  }
}
