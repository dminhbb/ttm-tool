import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicBrowserChildren, getEpicBrowserRoot } from '@/lib/epic-browser-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Shared by every screen that embeds the Epic Browser (Quản lý Epic 15/30, Nguồn dữ liệu) —
    // any authenticated role, matching whichever of those screens the caller already got past.
    await requireUser(request);
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
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải dữ liệu Epic Browser.' }, { status: 500 });
  }
}
