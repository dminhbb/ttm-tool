import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { uploadNewsLetterImage } from '@/lib/news-letter/service';
import { NEWS_LETTER_MAX_IMAGE_BYTES, newsLetterImageUrl } from '@/lib/news-letter/types';

/**
 * POST multipart (file, kind = HEADER | INLINE) — SUPERADMIN. The browser already resized / re-encoded the image; the
 * server still checks the size and the real file type from its bytes (PNG / JPEG / WebP / GIF only, never SVG).
 * The image stays unattached until the article using it is saved (unsaved uploads are purged after a day).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const form = await request.formData();
    const file = form.get('file');
    const kind = form.get('kind') === 'HEADER' ? 'HEADER' : 'INLINE';
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Thiếu file ảnh.' }, { status: 400 });
    if (file.size > NEWS_LETTER_MAX_IMAGE_BYTES) return NextResponse.json({ error: 'Ảnh quá lớn.' }, { status: 400 });
    const id = await uploadNewsLetterImage(viewerOf(user), kind, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ id, url: newsLetterImageUrl(id) }, { status: 201 });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải ảnh lên.');
  }
}
