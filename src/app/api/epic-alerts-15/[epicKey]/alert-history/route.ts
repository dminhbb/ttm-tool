import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listEpicCnttAlertRuns } from '@/lib/epic-alert-timeline-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/** "Epic History": Cảnh báo muộn/Fail TTM-CNTT runs (from epic_alert_timeline) for one Epic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ epicKey: string }> }) {
  try {
    await requireUser(request);
    const { epicKey } = await params;
    const alerts = await listEpicCnttAlertRuns(epicKey);
    return NextResponse.json({ epicKey, alerts });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts alert-history route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải lịch sử Epic';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
