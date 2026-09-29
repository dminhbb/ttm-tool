import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listParityRuns, runParityForDate } from '@/lib/scoring-run-service';
import { vnToday } from '@/lib/scoring-context-service';

// A manual run recomputes the whole legacy row set plus every scorecard (same cost as a cache rebuild).
export const maxDuration = 300;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được đối chiếu Scoring Service.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

/** Recent Scoring Service ↔ legacy engine comparisons (scoring_parity_runs). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json({ today: vnToday(), runs: await listParityRuns(10) });
  } catch (error: unknown) {
    console.error('API Error in admin/scoring/parity GET:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không đọc được kết quả đối chiếu.' }, { status: 500 });
  }
}

/** Runs a comparison for `asOf` ("YYYY-MM-DD", today or earlier; default today). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json().catch(() => ({}));
    const asOfInput = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).asOf : undefined;
    const today = vnToday();
    const asOf = typeof asOfInput === 'string' && asOfInput ? asOfInput : today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > today) {
      return NextResponse.json({ error: 'Ngày đối chiếu không hợp lệ — dùng YYYY-MM-DD, không sau hôm nay.' }, { status: 400 });
    }
    return NextResponse.json(await runParityForDate(asOf, user.id));
  } catch (error: unknown) {
    console.error('API Error in admin/scoring/parity POST:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi đối chiếu.';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
