import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { suggestEpicsForViewGrant } from '@/lib/user-view-grants-service';

/** "Quyền xem Epic" input: GET ?q=&limit= → the closest Epics (key, name). ADMIN / SUPERADMIN, who configure the grants; an ADMIN is offered only the Epics of their own data scope. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const query = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
    const limit = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '3') || 3));
    const scope = user.role === 'ADMIN' ? await resolveAccessScope(user.id, user.role) : undefined;
    return NextResponse.json(await suggestEpicsForViewGrant(query, limit, scope));
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý user.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    }
    console.error('API Error suggesting epics:', error);
    return NextResponse.json({ error: 'Không thể gợi ý Epic.' }, { status: 500 });
  }
}
