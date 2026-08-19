import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from '@/lib/master-data-service';
import type { HolidayInput } from '@/lib/master-data-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý ngày nghỉ.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function validate(body: HolidayInput): string | null {
  if (!body.name || !body.startDate) return 'Tên ngày nghỉ và Ngày bắt đầu là bắt buộc';
  if (body.isMultiDay) {
    if (!body.endDate) return 'Ngày kết thúc là bắt buộc khi bật Nhiều ngày';
    if (new Date(body.endDate).getTime() < new Date(body.startDate).getTime()) {
      return 'Ngày kết thúc phải lớn hơn hoặc bằng Ngày bắt đầu';
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']);
    const holidays = await listHolidays();
    return NextResponse.json(holidays);
  } catch (error: unknown) {
    console.error('API Error in holidays route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Holiday';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as HolidayInput;
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const holiday = await createHoliday(body);
    return NextResponse.json(holiday, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating holiday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Holiday';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as HolidayInput & { id: number };
    if (!body.id) return NextResponse.json({ error: 'Holiday ID là bắt buộc' }, { status: 400 });
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const holiday = await updateHoliday(body.id, body);
    return NextResponse.json(holiday);
  } catch (error: unknown) {
    console.error('API Error updating holiday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Holiday';
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
      return NextResponse.json({ error: 'Holiday ID không hợp lệ' }, { status: 400 });
    }
    await deleteHoliday(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting holiday:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Holiday';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
