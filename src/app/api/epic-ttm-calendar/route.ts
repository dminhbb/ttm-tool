import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { parseCalculatorRequest } from '@/lib/ttm-calculator-request';
import { runTtmCalculator } from '@/lib/ttm-calculator-service';

/**
 * Dữ liệu cho tab "TTM Calendar" của popup "Thông tin Epic". Cùng phép tính với `/api/ttm-calculator` nhưng KHÔNG gắn
 * quyền `ttm_calculator` (API đó bị chặn theo màn hình TTM Calculator): ai xem được popup Epic thì xem được tab này,
 * dù vai trò bị bỏ quyền Xem màn TTM Calculator. Chỉ đọc, không lưu dữ liệu.
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
    console.error('API Error in epic-ttm-calendar POST:', error);
    return NextResponse.json({ error: 'Không thể tính toán các mốc TTM.' }, { status: 500 });
  }
}
