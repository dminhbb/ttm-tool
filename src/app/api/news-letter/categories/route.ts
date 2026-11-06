import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { createNewsLetterCategory, listNewsLetterCategories } from '@/lib/news-letter/service';

/** Categories of "Bản tin" (A→Z, with how many articles use each) — managed by SUPERADMIN from the editor. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json({ categories: await listNewsLetterCategories() });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải danh sách phân loại.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    await createNewsLetterCategory(viewerOf(user), body.name);
    return NextResponse.json({ categories: await listNewsLetterCategories() }, { status: 201 });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể thêm phân loại.');
  }
}
