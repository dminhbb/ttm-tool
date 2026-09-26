import { after, NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { claimDailyCacheRun, getDailyCacheStatus, runDailyCacheRefresh } from '@/lib/daily-cache-service';

// The rebuild itself runs in after() — past the response — so it needs the function kept alive
// well beyond a normal request (one full unscoped recompute + cache rewrite, ~10-20s today).
export const maxDuration = 300;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  return null;
}

/** Cheap status read — polled by DailyCacheWarmer while today's run is in progress. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json(await getDailyCacheStatus());
  } catch (error: unknown) {
    console.error('API Error in system/daily-cache GET:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không đọc được trạng thái cache.' }, { status: 500 });
  }
}

/**
 * "First signed-in page load of the day" trigger (see daily-cache-service.ts). Only the one caller
 * that wins claimDailyCacheRun starts the rebuild; everyone else just gets the current state back.
 * Responds immediately (`started: true`) and rebuilds in after(), so no page waits on it.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const status = await getDailyCacheStatus();
    if (status.state !== 'STALE') return NextResponse.json({ ...status, started: false });

    const runDate = await claimDailyCacheRun(user.id);
    if (!runDate) return NextResponse.json({ ...(await getDailyCacheStatus()), started: false });

    after(() => runDailyCacheRefresh(runDate));
    return NextResponse.json({ ...status, state: 'RUNNING', started: true });
  } catch (error: unknown) {
    console.error('API Error in system/daily-cache POST:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không khởi động được tạo cache trong ngày.' }, { status: 500 });
  }
}
