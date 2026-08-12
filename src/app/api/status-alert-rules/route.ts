import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createStatusAlertRule, deleteStatusAlertRule, listStatusAlertRules, updateStatusAlertRule } from '@/lib/status-alert-rule-service';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import type { EpicComplexityType, StatusAlertRuleInput } from '@/lib/status-alert-rule-types';

const MAX_WORKING_DAY_OFFSET = 3650;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý rule cảnh báo.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOffset(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_WORKING_DAY_OFFSET;
}

function parseInput(body: unknown): { error: string } | { value: StatusAlertRuleInput } {
  if (!isRecord(body)) return { error: 'Dữ liệu cấu hình không hợp lệ.' };

  const { epicComplexityType, epicStatus, earlyAlertOffsetDays, lateAlertOffsetDays, isActive } = body;
  if (!EPIC_COMPLEXITY_TYPES.includes(epicComplexityType as EpicComplexityType)) return { error: 'Loại Epic không hợp lệ.' };
  if (typeof epicStatus !== 'string' || !/^[\p{L}\p{N} ._/-]{1,50}$/u.test(epicStatus.trim())) {
    return { error: 'Trạng thái Epic chỉ được chứa chữ, số, khoảng trắng hoặc ký tự . _ / - (tối đa 50 ký tự).' };
  }
  if (!isOffset(earlyAlertOffsetDays) || !isOffset(lateAlertOffsetDays)) {
    return { error: `Offset phải là số nguyên từ 0 đến ${MAX_WORKING_DAY_OFFSET} ngày làm việc.` };
  }
  if (typeof isActive !== 'boolean') return { error: 'Trạng thái active/inactive không hợp lệ.' };
  if (earlyAlertOffsetDays >= lateAlertOffsetDays) {
    return { error: 'Cảnh báo sớm phải nhỏ hơn cảnh báo muộn.' };
  }

  return { value: {
    epicComplexityType: epicComplexityType as EpicComplexityType,
    epicStatus: epicStatus.trim(),
    earlyAlertOffsetDays,
    lateAlertOffsetDays,
    isActive,
  } };
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await listStatusAlertRules());
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading status alert rules:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình cảnh báo.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id <= 0) {
      return NextResponse.json({ error: 'ID rule không hợp lệ.' }, { status: 400 });
    }
    const parsed = parseInput(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const rule = await updateStatusAlertRule(body.id, parsed.value);
    if (!rule) return NextResponse.json({ error: 'Không tìm thấy rule cảnh báo.' }, { status: 404 });
    return NextResponse.json(rule);
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error updating status alert rule:', error);
    return NextResponse.json({ error: 'Không thể lưu cấu hình cảnh báo.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const parsed = parseInput(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json(await createStatusAlertRule(parsed.value), { status: 201 });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error creating status alert rule:', error);
    if (isRecord(error) && error.code === '23505') {
      return NextResponse.json({ error: 'Rule cho Loại Epic và Trạng thái này đã tồn tại.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Không thể tạo cấu hình cảnh báo.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'ID rule không hợp lệ.' }, { status: 400 });
    if (!await deleteStatusAlertRule(id)) return NextResponse.json({ error: 'Không tìm thấy rule cảnh báo.' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    return NextResponse.json({ error: 'Không thể xóa rule cảnh báo.' }, { status: 500 });
  }
}
