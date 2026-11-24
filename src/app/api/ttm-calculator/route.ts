import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { parseCalculatorRequest } from '@/lib/ttm-calculator-request';
import { runTtmCalculator } from '@/lib/ttm-calculator-service';

/**
 * "TTM Calculator": milestones of an imaginary Epic, judged by the live Rule Groups / Bộ ngân sách / holidays.
 * Read-only (no data is stored). Gated by the permission matrix feature `ttm_calculator` (feature-access.ts).
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);
    const parsed = parseCalculatorRequest((await request.json().catch(() => null)) as Record<string, unknown> | null);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { result, holidays, workdays } = await runTtmCalculator(parsed.value);
    return NextResponse.json({ result, holidays, workdays });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in ttm-calculator POST:', error);
    return NextResponse.json({ error: 'Không thể tính toán các mốc TTM.' }, { status: 500 });
  }
}
