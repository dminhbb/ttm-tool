import { NextRequest, NextResponse } from 'next/server';
import { getEpicBrowserChildren, getEpicBrowserRoot } from '@/lib/epic-browser-service';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const epicKey = url.searchParams.get('epicKey');
    const parentIdParam = url.searchParams.get('parentId');
    const level = url.searchParams.get('level');

    if (epicKey) {
      const root = await getEpicBrowserRoot(epicKey.trim());
      if (!root) return NextResponse.json({ error: `Không tìm thấy Epic ${epicKey}.` }, { status: 404 });
      return NextResponse.json(root);
    }

    if (parentIdParam || level) {
      if (!parentIdParam || (level !== 'stories' && level !== 'subtasks')) {
        return NextResponse.json({ error: 'Yêu cầu tải nhánh dữ liệu không hợp lệ.' }, { status: 400 });
      }
      const parentId = Number(parentIdParam);
      if (!Number.isInteger(parentId) || parentId < 1) {
        return NextResponse.json({ error: 'Mã issue cha không hợp lệ.' }, { status: 400 });
      }
      return NextResponse.json(await getEpicBrowserChildren(parentId, level));
    }

    return NextResponse.json({ error: 'Thiếu tham số epicKey hoặc parentId.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Epic Browser request failed.', error);
    return NextResponse.json({ error: 'Không thể tải dữ liệu Epic Browser.' }, { status: 500 });
  }
}
