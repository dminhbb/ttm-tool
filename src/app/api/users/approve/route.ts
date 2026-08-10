import { NextRequest, NextResponse } from 'next/server';
import { approveInactiveUsers, ApprovalError, AuthError, requireUser } from '@/lib/auth-service';

function isIdList(value: unknown): value is number[] { return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((id) => Number.isInteger(id) && id > 0); }
function isDatabaseError(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('ids' in body)) return NextResponse.json({ error: 'Danh sách user hoặc Domain không hợp lệ.' }, { status: 400 });
    const payload = body as Record<string, unknown>;
    const domainId = payload.domainId;
    if (!isIdList(payload.ids) || new Set(payload.ids).size !== payload.ids.length || (domainId !== undefined && (!Number.isInteger(domainId) || (domainId as number) <= 0))) return NextResponse.json({ error: 'Danh sách user hoặc Domain không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await approveInactiveUsers(payload.ids, typeof domainId === 'number' ? domainId : undefined));
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền duyệt đăng ký.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    if (error instanceof Error && error.message === 'DOMAIN_REQUIRED') return NextResponse.json({ error: 'Các user được chọn chưa có Domain. Hãy chọn một Domain active.' }, { status: 400 });
    if (error instanceof Error && error.message === 'INVALID_DOMAIN') return NextResponse.json({ error: 'Domain không tồn tại hoặc đã ngừng hoạt động.' }, { status: 400 });
    if (error instanceof Error && error.message === 'INVALID_USERS') return NextResponse.json({ error: 'Có user không còn ở trạng thái chờ duyệt.' }, { status: 409 });
    if (isDatabaseError(error, '23505')) return NextResponse.json({ error: 'Không thể gán Domain do dữ liệu phân quyền bị trùng lặp. Vui lòng tải lại danh sách và thử lại.' }, { status: 409 });
    if (error instanceof ApprovalError) return NextResponse.json({ error: error.stage === 'ASSIGN_DOMAIN' ? 'Không thể gán Domain cho user. Vui lòng kiểm tra lại dữ liệu Domain.' : 'Không thể kích hoạt user sau khi gán Domain.' }, { status: 500 });
    return NextResponse.json({ error: 'Không thể duyệt đăng ký.' }, { status: 500 });
  }
}
