import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { hasUnreadNewsLetter } from '@/lib/news-letter/service';

/** Red dot on the menu entry "Bản tin": { unread } — a published article for the viewer they haven't opened yet. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ unread: await hasUnreadNewsLetter(viewerOf(user)) });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể kiểm tra Bản tin mới.');
  }
}
