import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { evaluateComplianceRequest } from '@/lib/epic-compliance-service';
import { COMPLIANCE_ISSUE_TYPES } from '@/lib/epic-compliance-types';
import type { ComplianceIssueInput, ComplianceIssueType } from '@/lib/epic-compliance-types';
import type { EpicComplexity } from '@/lib/ttm-rules';

const MAX_ITEMS_PER_REQUEST = 500;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_COMPLEXITIES: EpicComplexity[] = ['SIMPLE', 'COMPLEX'];

function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isDateString(value) ? value : undefined;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' && value.trim().length <= 100 ? value.trim() : undefined;
}

function parseIssue(value: unknown): ComplianceIssueInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as Record<string, unknown>;
  const issueType = payload.issueType;
  const issueKey = payload.issueKey;
  const status = payload.status;
  if (!COMPLIANCE_ISSUE_TYPES.includes(issueType as ComplianceIssueType)
    || typeof issueKey !== 'string' || issueKey.trim().length === 0 || issueKey.length > 100
    || typeof status !== 'string' || status.trim().length === 0 || status.length > 100) return null;

  const fields = ['dueDate', 'ideaApprovedDate', 'r4gDate', 'startDate'] as const;
  const dates = Object.fromEntries(fields.map((field) => [field, nullableDate(payload[field])])) as Record<(typeof fields)[number], string | null | undefined>;
  if (fields.some((field) => payload[field] !== undefined && dates[field] === undefined)) return null;
  const complexity = payload.epicComplexityType;
  if (complexity !== undefined && complexity !== null && !VALID_COMPLEXITIES.includes(complexity as EpicComplexity)) return null;
  const textFields = ['epicKey', 'parentKey'] as const;
  const text = Object.fromEntries(textFields.map((field) => [field, optionalText(payload[field])])) as Record<(typeof textFields)[number], string | null | undefined>;
  if (textFields.some((field) => payload[field] !== undefined && text[field] === undefined)) return null;

  return {
    dueDate: dates.dueDate,
    epicComplexityType: complexity as EpicComplexity | null | undefined,
    epicKey: text.epicKey,
    ideaApprovedDate: dates.ideaApprovedDate,
    issueKey: issueKey.trim(),
    issueType: issueType as ComplianceIssueType,
    parentKey: text.parentKey,
    r4gDate: dates.r4gDate,
    startDate: dates.startDate,
    status: status.trim(),
  };
}

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền sử dụng API đánh giá tuân thủ.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('items' in body)) return NextResponse.json({ error: 'Payload phải chứa danh sách items.' }, { status: 400 });
    const payload = body as Record<string, unknown>;
    if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > MAX_ITEMS_PER_REQUEST) {
      return NextResponse.json({ error: `Danh sách items phải có từ 1 đến ${MAX_ITEMS_PER_REQUEST} phần tử.` }, { status: 400 });
    }
    const items = payload.items.map(parseIssue);
    if (items.some((item) => item === null)) return NextResponse.json({ error: 'Thông tin Epic, Story hoặc Subtask không hợp lệ.' }, { status: 400 });
    const evaluatedAt = payload.evaluatedAt === undefined ? new Date() : isDateString(payload.evaluatedAt) ? new Date(`${payload.evaluatedAt}T00:00:00`) : null;
    if (!evaluatedAt) return NextResponse.json({ error: 'evaluatedAt phải có định dạng YYYY-MM-DD.' }, { status: 400 });
    return NextResponse.json(await evaluateComplianceRequest(items as ComplianceIssueInput[], evaluatedAt));
  } catch (error: unknown) {
    console.error('Epic compliance evaluation failed', { errorType: error instanceof Error ? error.name : 'UNKNOWN' });
    return authError(error) ?? NextResponse.json({ error: 'Không thể đánh giá cảnh báo và tuân thủ.' }, { status: 500 });
  }
}
