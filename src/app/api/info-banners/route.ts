import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createInfoBanner, deleteInfoBanner, listInfoBanners, updateInfoBanner } from '@/lib/info-banner-service';
import { sanitizeAdPopupHtml, stripHtmlToText } from '@/lib/sanitize-html';
import type { InfoBannerInput } from '@/lib/info-banner-types';

// SUPERADMIN only for every method — this screen is configuration, not just viewing (per the
// business rule: "chỉ cho superadmin thực hiện cấu hình"), same rule as ad-popups' own route.
const ALLOWED_ROLES = ['SUPERADMIN'] as const;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Banner thông báo.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function validate(body: InfoBannerInput): string | null {
  if (!body.name?.trim()) return 'Tên banner là bắt buộc';
  if (!body.message || !stripHtmlToText(body.message)) return 'Nội dung banner là bắt buộc';
  if (body.bannerType === 'PER_SCREEN' && !body.screenKey) return 'Chọn màn hình áp dụng cho banner theo màn hình';
  if (!body.startDate) return 'Ngày bắt đầu là bắt buộc';
  if (body.endDate && new Date(body.endDate).getTime() < new Date(body.startDate).getTime()) return 'Ngày kết thúc phải lớn hơn hoặc bằng Ngày bắt đầu';
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    return NextResponse.json(await listInfoBanners());
  } catch (error: unknown) {
    console.error('API Error in info-banners route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Banner thông báo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as InfoBannerInput;
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const banner = await createInfoBanner({ ...body, message: sanitizeAdPopupHtml(body.message) });
    return NextResponse.json(banner, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating info-banner:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Banner thông báo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as InfoBannerInput & { id: number };
    if (!body.id) return NextResponse.json({ error: 'Banner ID là bắt buộc' }, { status: 400 });
    const validationError = validate(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const banner = await updateInfoBanner(body.id, { ...body, message: sanitizeAdPopupHtml(body.message) });
    if (!banner) return NextResponse.json({ error: 'Không tìm thấy Banner thông báo' }, { status: 404 });
    return NextResponse.json(banner);
  } catch (error: unknown) {
    console.error('API Error updating info-banner:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Banner thông báo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const idStr = new URL(request.url).searchParams.get('id');
    const id = idStr ? parseInt(idStr, 10) : NaN;
    if (Number.isNaN(id)) return NextResponse.json({ error: 'Banner ID không hợp lệ' }, { status: 400 });
    const result = await deleteInfoBanner(id);
    if (result === 'NOT_FOUND') return NextResponse.json({ error: 'Không tìm thấy Banner thông báo' }, { status: 404 });
    if (result === 'IS_DEFAULT') return NextResponse.json({ error: 'Không thể xóa banner mặc định — hãy đổi loại banner này sang "Theo màn hình" trước.' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting info-banner:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Banner thông báo';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
