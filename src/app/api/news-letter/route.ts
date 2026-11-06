import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, positiveInt, viewerOf } from '@/lib/news-letter/http';
import { getNewsLetterPage } from '@/lib/news-letter/service';

/** "Bản tin" reading page: GET ?articleId= (omitted = the newest published article) → article, neighbours, contents. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const raw = request.nextUrl.searchParams.get('articleId');
    const articleId = raw === null ? null : positiveInt(raw);
    if (raw !== null && articleId === null) return NextResponse.json({ error: 'Mã bài viết không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await getNewsLetterPage(viewerOf(user), articleId));
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải Bản tin.');
  }
}
