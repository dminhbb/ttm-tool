import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listProjectComponents } from '@/lib/master-data-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  return null;
}

/** Any authenticated role — used by the user-edit popup's component picker and the Components
 * filter on Epic 30/15/in-PO, all of which need the catalog regardless of the viewer's own role. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json(await listProjectComponents());
  } catch (error: unknown) {
    console.error('API Error in project-components route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh mục Components';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
