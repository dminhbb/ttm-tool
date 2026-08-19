import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createDomain, deleteDomain, listDomains, updateDomain } from '@/lib/master-data-service';
import type { DomainInput } from '@/lib/master-data-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý Domain.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}

export async function GET(request: NextRequest) {
  try { await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listDomains()); }
  catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi tải danh sách Domain.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as DomainInput;
    if (!body.domainCode?.trim() || !body.domainName?.trim()) return NextResponse.json({ error: 'Domain Code và Tên Domain là bắt buộc.' }, { status: 400 });
    return NextResponse.json(await createDomain(body), { status: 201 });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi tạo Domain.' }, { status: 500 }); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as DomainInput & { id: number };
    if (!Number.isInteger(body.id) || body.id <= 0 || !body.domainCode?.trim() || !body.domainName?.trim()) return NextResponse.json({ error: 'Thiếu dữ liệu Domain bắt buộc.' }, { status: 400 });
    return NextResponse.json(await updateDomain(body.id, body));
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi cập nhật Domain.' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Domain ID không hợp lệ.' }, { status: 400 });
    await deleteDomain(id);
    return NextResponse.json({ success: true });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi xóa Domain.' }, { status: 500 }); }
}
