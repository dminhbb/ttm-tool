import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { CALCULATOR_LEVELS, CALCULATOR_REQUEST_TYPES, isRealDate } from '@/lib/ttm-calculator-text';
import { runTtmCalculator } from '@/lib/ttm-calculator-service';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIsoDate(value: unknown): value is string {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  return Boolean(match && isRealDate(Number(match[1]), Number(match[2]), Number(match[3])));
}

/**
 * Trả về một ngày tuỳ chọn đã được kiểm tra tính hợp lệ: `{ ok: true, value: null }` khi không nhập (được phép bỏ qua),
 * `{ ok: true, value }` khi hợp lệ, `{ ok: false }` khi có giá trị nhưng sai định dạng / không tồn tại trong lịch.
 * Dùng discriminated union (không phải sentinel `undefined`) để phân biệt rõ "bỏ trống" với "nhập sai".
 */
function optionalDate(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  return validIsoDate(value) ? { ok: true, value } : { ok: false };
}

/**
 * "TTM Calculator": milestones of an imaginary Epic, judged by the live Rule Groups / Bộ ngân sách / holidays.
 * Read-only (no data is stored). Gated by the permission matrix feature `ttm_calculator` (feature-access.ts).
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const requestType = body?.requestType;
    const level = body?.requirementLevel;
    const createdDate = optionalDate(body?.createdDate);
    const ideaApprovedDate = optionalDate(body?.ideaApprovedDate);
    if (typeof requestType !== 'string' || !(CALCULATOR_REQUEST_TYPES as readonly string[]).includes(requestType)) {
      return NextResponse.json({ error: 'Loại yêu cầu không hợp lệ.' }, { status: 400 });
    }
    if (typeof level !== 'string' || !(CALCULATOR_LEVELS as readonly string[]).includes(level)) {
      return NextResponse.json({ error: 'Requirement level phải là 1, 2, 3 hoặc 4.' }, { status: 400 });
    }
    if (!validIsoDate(body?.startDate)) return NextResponse.json({ error: 'Start date không hợp lệ.' }, { status: 400 });
    if (!createdDate.ok || !ideaApprovedDate.ok) return NextResponse.json({ error: 'Created date / Ngày duyệt ý tưởng không hợp lệ.' }, { status: 400 });

    const { result, holidays, workdays } = await runTtmCalculator({ createdDate: createdDate.value, ideaApprovedDate: ideaApprovedDate.value, requestType, requirementLevel: level, startDate: body.startDate as string });
    return NextResponse.json({ result, holidays, workdays });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in ttm-calculator POST:', error);
    return NextResponse.json({ error: 'Không thể tính toán các mốc TTM.' }, { status: 500 });
  }
}
