import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';
import { recordScreenView } from '@/lib/visit-counter-service';
import { ScreenKey, TRACKED_SCREEN_KEYS } from '@/lib/visit-counter-types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    let body: { screenKey?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const screenKey = body?.screenKey as ScreenKey;
    if (!screenKey || !TRACKED_SCREEN_KEYS.includes(screenKey)) {
      return NextResponse.json(
        { error: `Invalid screenKey. Must be one of: ${TRACKED_SCREEN_KEYS.join(', ')}` },
        { status: 400 }
      );
    }

    // proxy.ts already rejects requests without a valid session; this is defense in depth so the
    // route never records an anonymous (user_id NULL) view if it's ever made public.
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    await recordScreenView(user.id, screenKey);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[API visit-counter/track] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
