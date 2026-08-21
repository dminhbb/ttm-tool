import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getDashboardData } from '@/lib/dashboard-service';
import { DASHBOARD_MAX_SELECTABLE_PROJECTS, DASHBOARD_MIN_SELECTABLE_PROJECTS } from '@/lib/dashboard-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const projectsParam = new URL(request.url).searchParams.get('projects');
    const selected = projectsParam ? projectsParam.split(',').map((key) => key.trim()).filter(Boolean) : null;
    if (selected && selected.length > DASHBOARD_MAX_SELECTABLE_PROJECTS) {
      return NextResponse.json({ error: `Chỉ được chọn tối đa ${DASHBOARD_MAX_SELECTABLE_PROJECTS} dự án.` }, { status: 400 });
    }
    if (selected !== null && selected.length < DASHBOARD_MIN_SELECTABLE_PROJECTS) {
      return NextResponse.json({ error: 'Vui lòng chọn ít nhất 1 dự án.' }, { status: 400 });
    }
    const data = await getDashboardData(user.id, user.role, selected);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('API Error in dashboard route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dữ liệu Dashboard';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
