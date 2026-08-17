import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getDataReviewEpics } from '@/lib/data-review-service';

const MAX_FILTER_LENGTH = 120;

class InvalidDataReviewRequestError extends Error {}

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem Nguồn dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function parsePositiveInteger(value: string | null, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new InvalidDataReviewRequestError(`${label} không hợp lệ.`);
  }
  return numberValue;
}

function parseFilter(value: string | null, label: string): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length > MAX_FILTER_LENGTH) {
    throw new InvalidDataReviewRequestError(`${label} quá dài.`);
  }
  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const url = new URL(request.url);
    const batchId = parsePositiveInteger(url.searchParams.get('batchId'), 'Mã lớp dữ liệu');
    const page = parsePositiveInteger(url.searchParams.get('page') ?? '1', 'Trang');
    const result = await getDataReviewEpics(
      batchId,
      {
        component: parseFilter(url.searchParams.get('component'), 'Component/s'),
        issueType: parseFilter(url.searchParams.get('issueType'), 'Issue type'),
        project: parseFilter(url.searchParams.get('project'), 'Project'),
        status: parseFilter(url.searchParams.get('status'), 'Status'),
      },
      page,
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof InvalidDataReviewRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Data review request failed.', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải dữ liệu duyệt.' }, { status: 500 });
  }
}
