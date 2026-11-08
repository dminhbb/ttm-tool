import { PRODUCT_GUIDE_HTML } from '@/lib/product-guide-content';

export const dynamic = 'force-static';

export function GET() {
  return new Response(PRODUCT_GUIDE_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
