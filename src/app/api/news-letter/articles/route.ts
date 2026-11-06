import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { createNewsLetterArticle } from '@/lib/news-letter/service';
import type { NewsLetterArticleInput } from '@/lib/news-letter/types';

/** POST: a new article (SUPERADMIN) → { id }. The HTML is sanitized on the server before it is stored. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = (await request.json().catch(() => ({}))) as NewsLetterArticleInput;
    return NextResponse.json({ id: await createNewsLetterArticle(viewerOf(user), body) }, { status: 201 });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể lưu bài viết.');
  }
}
