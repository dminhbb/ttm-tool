import { NextRequest, NextResponse } from 'next/server';
import { getDataReviewEpics } from '@/lib/data-review-service';

const MAX_FILTER_LENGTH = 120;

class InvalidDataReviewRequestError extends Error {}

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
    return NextResponse.json({ error: 'Không thể tải dữ liệu duyệt.' }, { status: 500 });
  }
}
