import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEligibleAdPopupsForUser } from '@/lib/ad-popup-service';

export const dynamic = 'force-dynamic';

/** Any authenticated user — the popups themselves aren't role-gated, only whether SUPERADMIN can
 * configure them (see /api/ad-popups). Returns only what's eligible for THIS user right now
 * (active, in date range, under their own per-popup impression cap). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    // View as is read-only (no impression can be recorded), so no popup is shown while it is on.
    if (user.viewAs) return NextResponse.json([]);
    return NextResponse.json(await getEligibleAdPopupsForUser(user.id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in ad-popups/active route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải Popup quảng cáo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
