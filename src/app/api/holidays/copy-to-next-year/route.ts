import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { copyHolidayDataToNextYear } from '@/lib/master-data-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý ngày nghỉ.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

/** Copies every Holiday + Ngày làm bù recorded in `year` into `year + 1` (see master-data-service.ts's copyHolidayDataToNextYear). */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as { year?: number };
    const year = Number(body.year);
    if (!Number.isInteger(year)) return NextResponse.json({ error: 'Năm không hợp lệ' }, { status: 400 });
    const result = await copyHolidayDataToNextYear(year);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error copying holiday data to next year:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi copy sang năm sau';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
