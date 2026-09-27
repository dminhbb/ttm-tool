import { NextRequest, NextResponse } from 'next/server';
import { getFooterVisitSummary } from '@/lib/visit-counter-service';
import { resolveScreenKeyFromPath } from '@/lib/visit-counter-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const screenKey = resolveScreenKeyFromPath(path);

    const summary = await getFooterVisitSummary(screenKey);

    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('[API visit-counter/footer] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
