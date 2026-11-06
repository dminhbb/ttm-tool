import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, positiveInt, viewerOf } from '@/lib/news-letter/http';
import { canWriteNewsLetter, getNewsLetterToc, listNewsLetterTocItems } from '@/lib/news-letter/service';
import { NEWS_LETTER_GROUP_PAGE, NEWS_LETTER_LATEST_PAGE, type NewsLetterTocPayload } from '@/lib/news-letter/types';

/**
 * Contents of "Bản tin":
 *   GET                              → the whole column: "Mới nhất" (10) + every category group (5 each) + canPost
 *   GET ?offset=N                    → more of "Mới nhất" (10 per call, "Xem thêm")
 *   GET ?categoryId=X|none&offset=N  → more of one category group (5 per call, "....")
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const viewer = viewerOf(user);
    const params = request.nextUrl.searchParams;
    if (!params.has('offset')) {
      const payload: NewsLetterTocPayload = { toc: await getNewsLetterToc(viewer), canPost: canWriteNewsLetter(viewer) };
      return NextResponse.json(payload);
    }
    const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
    const rawCategory = params.get('categoryId');
    if (rawCategory === null) {
      return NextResponse.json({ items: await listNewsLetterTocItems(viewer, { offset, limit: NEWS_LETTER_LATEST_PAGE }) });
    }
    const categoryId = rawCategory === 'none' ? null : positiveInt(rawCategory);
    if (rawCategory !== 'none' && categoryId === null) return NextResponse.json({ error: 'Phân loại không hợp lệ.' }, { status: 400 });
    return NextResponse.json({ items: await listNewsLetterTocItems(viewer, { categoryId, offset, limit: NEWS_LETTER_GROUP_PAGE }) });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải mục lục Bản tin.');
  }
}
