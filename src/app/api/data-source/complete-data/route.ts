import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';
import {
  completeMissingData,
  countOrphanEpicCandidates,
  countOrphanStoryCandidates,
  listOrphanEpicCandidates,
  listOrphanStoryCandidates,
} from '@/lib/data-completion-service';

export async function GET(request: NextRequest) {
  try {
    const countOnly = new URL(request.url).searchParams.get('countOnly') === 'true';
    if (countOnly) {
      const [epicCount, storyCount] = await Promise.all([countOrphanEpicCandidates(), countOrphanStoryCandidates()]);
      return NextResponse.json({ epicCount, storyCount });
    }
    const [epics, stories] = await Promise.all([listOrphanEpicCandidates(), listOrphanStoryCandidates()]);
    return NextResponse.json({ epics, stories });
  } catch (error: unknown) {
    console.error('API Error listing data-completion candidates:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách dữ liệu thiếu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const epicKeys = (body as { epicKeys?: unknown })?.epicKeys;
    const storyKeys = (body as { storyKeys?: unknown })?.storyKeys;
    const startDateStr = (body as { startDate?: unknown })?.startDate;

    const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
    const safeEpicKeys = isStringArray(epicKeys) ? epicKeys : [];
    const safeStoryKeys = isStringArray(storyKeys) ? storyKeys : [];
    if (safeEpicKeys.length === 0 && safeStoryKeys.length === 0) {
      return NextResponse.json({ error: 'Chưa chọn Epic hoặc Story nào để tạo' }, { status: 400 });
    }

    const startDate = typeof startDateStr === 'string' ? new Date(startDateStr) : new Date();
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Ngày bắt đầu (Start Date) không hợp lệ' }, { status: 400 });
    }

    const user = await getCurrentUser(request);
    const result = await completeMissingData(safeEpicKeys, safeStoryKeys, user?.fullName ?? 'System', startDate);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Error completing missing data:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi hoàn thiện dữ liệu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
