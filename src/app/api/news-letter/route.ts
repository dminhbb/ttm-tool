import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { getNewsLetterPageByRef } from '@/lib/news-letter/service';

/** "Bản tin" reading page: GET ?ref= (a numeric id or a slug; omitted = the newest published article) → article, neighbours, contents. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const raw = request.nextUrl.searchParams.get('ref');
    const ref = raw === null ? null : raw;
    return NextResponse.json(await getNewsLetterPageByRef(viewerOf(user), ref));
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải Bản tin.');
  }
}
