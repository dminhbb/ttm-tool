import { NextRequest, NextResponse } from 'next/server';
import { AuthError, currentSessionKey, requireUser } from '@/lib/auth-service';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { buildAccessScopeClause } from '@/lib/epic-alert-row-cache-query-service';
import { countAssignedTodoEpics } from '@/lib/epic-mark-service';

/**
 * Login notice "My assigned epics": how many Epics are assigned to the signed-in user (PM/SM of an Epic with a
 * comment) and still have "Giao việc" = To do — the very number on the "My assigned epics" quick filter.
 * `loginKey` identifies this login (its session), so the browser can show the notice once per login.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const scope = await resolveAccessScope(user.id, user.role);
    const params: unknown[] = [];
    const count = await countAssignedTodoEpics(buildAccessScopeClause(scope, params), params, user.id);
    return NextResponse.json({ count, loginKey: await currentSessionKey(request) });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error loading assigned epics notice:', error);
    return NextResponse.json({ error: 'Không thể tải thông báo Epic được giao.' }, { status: 500 });
  }
}
