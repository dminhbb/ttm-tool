import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';
import { getScoringEngineSettings, setScoringEngineMode } from '@/lib/scoring-mode-service';

// Switching rebuilds the caches in after() (same cost as a post-import refresh).
export const maxDuration = 300;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được đổi chế độ hiển thị.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getScoringEngineSettings());
  } catch (error: unknown) {
    console.error('API Error in admin/scoring/mode GET:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không đọc được chế độ hiển thị.' }, { status: 500 });
  }
}

/** { mode: 'legacy' | 'scoring' } — which engine every Epic screen displays. The caches store
 * display rows, so they're rebuilt in the background right away. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json().catch(() => ({}));
    const mode = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).mode : undefined;
    if (mode !== 'legacy' && mode !== 'scoring') {
      return NextResponse.json({ error: 'Chế độ không hợp lệ — dùng "legacy" hoặc "scoring".' }, { status: 400 });
    }
    await setScoringEngineMode(mode, user.id);
    scheduleDerivedCacheRefresh('scoring-mode');
    return NextResponse.json({ ...(await getScoringEngineSettings()), refreshing: true });
  } catch (error: unknown) {
    console.error('API Error in admin/scoring/mode PUT:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không đổi được chế độ hiển thị.' }, { status: 500 });
  }
}
