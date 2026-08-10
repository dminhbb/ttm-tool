import { NextRequest, NextResponse } from 'next/server';
import { createStatusAlertRule, listStatusAlertRules, updateStatusAlertRule } from '@/lib/status-alert-rule-service';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import type { EpicComplexityType, StatusAlertRuleInput } from '@/lib/status-alert-rule-types';

const MAX_WORKING_DAY_OFFSET = 3650;

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

  const { epicComplexityType, epicStatus, earlyAlertOffsetDays, lateAlertOffsetDays, failOffsetDays, isActive } = body;
  if (!EPIC_COMPLEXITY_TYPES.includes(epicComplexityType as EpicComplexityType)) return { error: 'Loại Epic không hợp lệ.' };
  if (typeof epicStatus !== 'string' || !/^[\p{L}\p{N} ._/-]{1,50}$/u.test(epicStatus.trim())) {
    return { error: 'Trạng thái Epic chỉ được chứa chữ, số, khoảng trắng hoặc ký tự . _ / - (tối đa 50 ký tự).' };
  }
  if (!isOffset(earlyAlertOffsetDays) || !isOffset(lateAlertOffsetDays) || !isOffset(failOffsetDays)) {
    return { error: `Offset phải là số nguyên từ 0 đến ${MAX_WORKING_DAY_OFFSET} ngày làm việc.` };
  }
  if (typeof isActive !== 'boolean') return { error: 'Trạng thái active/inactive không hợp lệ.' };
  if (earlyAlertOffsetDays >= lateAlertOffsetDays || lateAlertOffsetDays >= failOffsetDays) {
    return { error: 'Cảnh báo sớm phải nhỏ hơn cảnh báo muộn và cảnh báo muộn phải nhỏ hơn mốc Fail TTM-CNTT.' };
  }

  return { value: {
    epicComplexityType: epicComplexityType as EpicComplexityType,
    epicStatus: epicStatus.trim(),
    earlyAlertOffsetDays,
    lateAlertOffsetDays,
    failOffsetDays,
    isActive,
  } };
}

export async function GET() {
  try {
    return NextResponse.json(await listStatusAlertRules());
  } catch (error: unknown) {
    console.error('API Error loading status alert rules:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình cảnh báo.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
    console.error('API Error updating status alert rule:', error);
    return NextResponse.json({ error: 'Không thể lưu cấu hình cảnh báo.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseInput(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json(await createStatusAlertRule(parsed.value), { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating status alert rule:', error);
    if (isRecord(error) && error.code === '23505') {
      return NextResponse.json({ error: 'Rule cho Loại Epic và Trạng thái này đã tồn tại.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Không thể tạo cấu hình cảnh báo.' }, { status: 500 });
  }
}
