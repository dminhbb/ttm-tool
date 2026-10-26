import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createTtmPolicySet, deleteTtmPolicySet, listTtmPolicySets } from '@/lib/ttm-policy-service';

/** "Bộ ngân sách" (spec 2026-10-25 §17): named sets of Tiêu chí Time to Market rows. The rows themselves go through /api/ttm-policies. */

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý tiêu chí Time to Market.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}

export async function GET(request: NextRequest) {
  try { await requireUser(request, ['SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listTtmPolicySets()); }
  catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể tải bộ ngân sách.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const key = isRecord(body) && typeof body.key === 'string' ? body.key.trim() : '';
    const name = isRecord(body) && typeof body.name === 'string' ? body.name.trim() : '';
    const note = isRecord(body) && typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key) || key.toUpperCase() === 'DEFAULT' || !name || name.length > 100) {
      return NextResponse.json({ error: 'Mã bộ chỉ gồm chữ, số, "-" hoặc "_" (tối đa 40 ký tự, khác "DEFAULT"); tên bộ tối đa 100 ký tự.' }, { status: 400 });
    }
    return NextResponse.json(await createTtmPolicySet({ key, name, note }), { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'Mã bộ ngân sách đã tồn tại.' }, { status: 409 });
    return authError(error) ?? NextResponse.json({ error: 'Không thể thêm bộ ngân sách.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const outcome = await deleteTtmPolicySet(key);
    if (outcome === 'protected') return NextResponse.json({ error: 'Không xoá được bộ Mặc định hoặc bộ đang được một rule trong code sử dụng.' }, { status: 409 });
    if (outcome === 'not_found') return NextResponse.json({ error: 'Không tìm thấy bộ ngân sách.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể xoá bộ ngân sách.' }, { status: 500 }); }
}
