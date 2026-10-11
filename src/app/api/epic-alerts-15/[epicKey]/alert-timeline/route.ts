import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listEpicAlertTimelineOlder, listEpicAlertTimelineWindow } from '@/lib/epic-alert-timeline-service';

const TIMELINE_WINDOW_DAYS = 21;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/**
 * Transition-based alert timeline for one Epic (Fail TTM-CNTT/E2E, thiếu Start Date, dữ liệu bất
 * thường) — see epic-alert-timeline-service.ts. No `before` param returns the visible 3-week
 * window (still-open runs plus anything that closed within it); `before=<YYYY-MM-DD>` lazy-loads
 * runs that closed entirely earlier than that date.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ epicKey: string }> }) {
  try {
    await requireUser(request);
    const { epicKey } = await params;
    const before = request.nextUrl.searchParams.get('before');

    if (before) {
      const { entries, hasMore } = await listEpicAlertTimelineOlder(epicKey, before);
      return NextResponse.json({ entries, hasMore });
    }

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - TIMELINE_WINDOW_DAYS);
    const entries = await listEpicAlertTimelineWindow(epicKey, windowStart.toISOString().slice(0, 10));
    return NextResponse.json({ entries, hasMore: true });
  } catch (error: unknown) {
    console.error('API Error in epic-alerts alert-timeline route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải dòng thời gian cảnh báo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
