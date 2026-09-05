import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createAdPopup, deleteAdPopup, listAdPopups, updateAdPopup } from '@/lib/ad-popup-service';
import type { AdPopupInput } from '@/lib/ad-popup-types';

// SUPERADMIN only for every method — this screen is configuration, not just viewing (per the
// business rule: "chỉ cho superadmin thực hiện cấu hình"), so unlike most admin CRUD in this app
// there's no separate ADMIN/SUPERVISOR read access here.
const ALLOWED_ROLES = ['SUPERADMIN'] as const;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Popup quảng cáo.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function validate(body: AdPopupInput): string | null {
  if (!body.campaignName?.trim()) return 'Tên campaign là bắt buộc';
  if (!body.message?.trim()) return 'Nội dung thông điệp là bắt buộc';
  if (!body.startDate || !body.endDate) return 'Ngày bắt đầu và Ngày kết thúc là bắt buộc';
  if (new Date(body.endDate).getTime() < new Date(body.startDate).getTime()) return 'Ngày kết thúc phải lớn hơn hoặc bằng Ngày bắt đầu';
  if (!Number.isInteger(body.maxImpressions) || body.maxImpressions < 1) return 'Số lần hiện tối đa phải là số nguyên lớn hơn 0';
  if (!Number.isInteger(body.timeoutSeconds) || body.timeoutSeconds < 1) return 'Thời gian timeout phải là số nguyên lớn hơn 0';
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    return NextResponse.json(await listAdPopups());
  } catch (error: unknown) {
    console.error('API Error in ad-popups route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Popup quảng cáo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as AdPopupInput;
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const popup = await createAdPopup(body);
    return NextResponse.json(popup, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating ad-popup:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Popup quảng cáo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as AdPopupInput & { id: number };
    if (!body.id) return NextResponse.json({ error: 'Popup ID là bắt buộc' }, { status: 400 });
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const popup = await updateAdPopup(body.id, body);
    if (!popup) return NextResponse.json({ error: 'Không tìm thấy Popup quảng cáo' }, { status: 404 });
    return NextResponse.json(popup);
  } catch (error: unknown) {
    console.error('API Error updating ad-popup:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Popup quảng cáo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const idStr = new URL(request.url).searchParams.get('id');
    const id = idStr ? parseInt(idStr, 10) : NaN;
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Popup ID không hợp lệ' }, { status: 400 });
    await deleteAdPopup(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting ad-popup:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Popup quảng cáo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
