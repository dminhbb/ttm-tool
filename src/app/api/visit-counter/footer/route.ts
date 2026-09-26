import { NextRequest, NextResponse } from 'next/server';
import { getFooterVisitSummary } from '@/lib/visit-counter-service';
import type { ScreenKey } from '@/lib/visit-counter-types';

export const dynamic = 'force-dynamic';

/**
 * Resolves a given URL path to its corresponding ScreenKey if it is one of the 4 tracked screens:
 * - `/dashboard-new` or `/dashboard` -> 'dashboard'
 * - `/epic-alerts-15` or `/epic-alerts` -> 'epic_alerts'
 * - `/reports` -> 'epic_reports'
 * - `/epic-in-po` -> 'epic_in_po'
 * - Any other path -> null
 */
export function resolveScreenKeyFromPath(rawPath?: string | null): ScreenKey | null {
  if (!rawPath) return null;
  const pathWithoutQuery = rawPath.split('?')[0].split('#')[0].trim();
  const cleanPath = pathWithoutQuery.replace(/\/+$/, '');
  const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  if (normalized === '/dashboard-new' || normalized === '/dashboard') {
    return 'dashboard';
  }
  if (normalized === '/epic-alerts-15' || normalized === '/epic-alerts') {
    return 'epic_alerts';
  }
  if (normalized === '/reports') {
    return 'epic_reports';
  }
  if (normalized === '/epic-in-po') {
    return 'epic_in_po';
  }
  return null;
}

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
