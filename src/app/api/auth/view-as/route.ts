import { NextRequest, NextResponse } from 'next/server';
import { AuthError, listViewAsCandidates, requireUser, setSessionViewAs, startViewAs, verifyUserPassword } from '@/lib/auth-service';
import type { AuthUser } from '@/lib/auth-types';

/**
 * "View as" — SUPERADMIN only (also while already viewing as someone: the real account is read from the session).
 *   GET     → the active users that can be picked
 *   POST    → { userId, password }: confirm the SUPERADMIN's own password, then view as that user (audit_logs: VIEW_AS)
 *   DELETE  → back to the normal mode
 * Kept open by the proxy's read-only rule (view-as.ts) because it is how the mode is started and left.
 */
function actorIdOf(user: AuthUser): number {
  if (user.viewAs) return user.viewAs.actorId;
  if (user.role === 'SUPERADMIN') return user.id;
  throw new AuthError('FORBIDDEN');
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới được dùng View as.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ users: await listViewAsCandidates(actorIdOf(user)) });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể tải danh sách user.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const actorId = actorIdOf(user);
    const body: unknown = await request.json().catch(() => null);
    const { userId, password } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    if (typeof password !== 'string' || !password) return NextResponse.json({ error: 'Vui lòng nhập mật khẩu để xác nhận.' }, { status: 400 });
    if (typeof userId !== 'number' || !Number.isInteger(userId) || userId === actorId) return NextResponse.json({ error: 'User không hợp lệ.' }, { status: 400 });
    if (!(await verifyUserPassword(actorId, password))) return NextResponse.json({ error: 'Mật khẩu không đúng.', code: 'WRONG_PASSWORD' }, { status: 403 });
    const started = await startViewAs(request, actorId, userId);
    if (!started) return NextResponse.json({ error: 'Chỉ chọn được user đang hoạt động.' }, { status: 400 });
    return NextResponse.json({ success: true, username: started.username });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể bật chế độ View as.');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    actorIdOf(user);
    await setSessionViewAs(request, null);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể thoát chế độ View as.');
  }
}
