import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { readNewsLetterImage } from '@/lib/news-letter/service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * One image of "Bản tin" — only for a viewer who may read its article (or who uploaded it and hasn't saved it yet).
 * An image never changes once stored (a new upload gets a new id), so the browser keeps it for a year. The headers keep
 * the browser from treating the bytes as anything but the image type the server detected.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const image = await readNewsLetterImage(viewerOf(user), (await context.params).id);
    if (!image) return NextResponse.json({ error: 'Không tìm thấy ảnh.' }, { status: 404 });
    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.data.byteLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải ảnh.');
  }
}
