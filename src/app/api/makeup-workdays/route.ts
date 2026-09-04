import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createMakeupWorkday, deleteMakeupWorkday, listMakeupWorkdays, updateMakeupWorkday } from '@/lib/master-data-service';
import type { MakeupWorkdayInput } from '@/lib/master-data-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý ngày làm bù.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function validate(body: MakeupWorkdayInput): string | null {
  if (!body.workDate) return 'Ngày làm bù là bắt buộc';
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']);
    const yearParam = new URL(request.url).searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : undefined;
    const workdays = await listMakeupWorkdays(Number.isNaN(year) ? undefined : year);
    return NextResponse.json(workdays);
  } catch (error: unknown) {
    console.error('API Error in makeup-workdays route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Ngày làm bù';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as MakeupWorkdayInput;
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { error, workday } = await createMakeupWorkday(body);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json(workday, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating makeup workday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Ngày làm bù';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as MakeupWorkdayInput & { id: number };
    if (!body.id) return NextResponse.json({ error: 'Ngày làm bù ID là bắt buộc' }, { status: 400 });
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const { error, workday } = await updateMakeupWorkday(body.id, body);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json(workday);
  } catch (error: unknown) {
    console.error('API Error updating makeup workday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Ngày làm bù';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const url = new URL(request.url);
    const idStr = url.searchParams.get('id');
    const id = idStr ? parseInt(idStr) : NaN;
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Ngày làm bù ID không hợp lệ' }, { status: 400 });
    }
    await deleteMakeupWorkday(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting makeup workday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Ngày làm bù';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
