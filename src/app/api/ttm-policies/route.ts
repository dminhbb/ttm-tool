import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createTtmPolicy, deleteTtmPolicy, listTtmPolicies, updateTtmPolicy } from '@/lib/ttm-policy-service';
import { TTM_TYPES } from '@/lib/ttm-policy-types';
import type { TtmPolicyInput, TtmType } from '@/lib/ttm-policy-types';
import type { EpicComplexity } from '@/lib/ttm-rules';

const MAX_WORKING_DAYS = 3650;
const COMPLEXITIES: EpicComplexity[] = ['SIMPLE', 'COMPLEX'];

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý tiêu chí Time to Market.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}
function parseInput(value: unknown): TtmPolicyInput | null {
  if (!isRecord(value)) return null;
  const { ttmType, epicComplexityType, fromTtmField, toTtmField, workingDays, isActive } = value;
  if (!TTM_TYPES.includes(ttmType as TtmType) || !COMPLEXITIES.includes(epicComplexityType as EpicComplexity)
    || typeof fromTtmField !== 'string' || fromTtmField.trim().length === 0 || fromTtmField.trim().length > 100
    || typeof toTtmField !== 'string' || toTtmField.trim().length === 0 || toTtmField.trim().length > 100
    || typeof workingDays !== 'number' || !Number.isInteger(workingDays) || workingDays <= 0 || workingDays > MAX_WORKING_DAYS
    || typeof isActive !== 'boolean') return null;
  return { ttmType: ttmType as TtmType, epicComplexityType: epicComplexityType as EpicComplexity, fromTtmField: fromTtmField.trim(), toTtmField: toTtmField.trim(), workingDays, isActive };
}

export async function GET(request: NextRequest) {
  try { await requireUser(request, ['SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listTtmPolicies()); }
  catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể tải tiêu chí Time to Market.' }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']); const input = parseInput(await request.json());
    if (!input) return NextResponse.json({ error: 'Tiêu chí Time to Market không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await createTtmPolicy(input), { status: 201 });
  } catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể thêm tiêu chí Time to Market.' }, { status: 500 }); }
}
export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']); const body: unknown = await request.json(); const input = parseInput(body);
    if (!isRecord(body) || typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id <= 0 || !input) return NextResponse.json({ error: 'Tiêu chí Time to Market không hợp lệ.' }, { status: 400 });
    const policy = await updateTtmPolicy(body.id, input); if (!policy) return NextResponse.json({ error: 'Không tìm thấy tiêu chí Time to Market.' }, { status: 404 }); return NextResponse.json(policy);
  } catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể sửa tiêu chí Time to Market.' }, { status: 500 }); }
}
export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']); const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'ID tiêu chí không hợp lệ.' }, { status: 400 });
    return NextResponse.json({ deleted: await deleteTtmPolicy(id) });
  } catch (error: unknown) { return authError(error) ?? NextResponse.json({ error: 'Không thể xóa tiêu chí Time to Market.' }, { status: 500 }); }
}
