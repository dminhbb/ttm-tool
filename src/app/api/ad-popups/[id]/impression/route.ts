import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { recordAdPopupImpression } from '@/lib/ad-popup-service';

/** Called by the display component the instant a popup is actually shown to the current user —
 * see recordAdPopupImpression's doc comment for why this fires on display, not on dismiss/click. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const popupId = parseInt(id, 10);
    if (Number.isNaN(popupId)) return NextResponse.json({ error: 'Popup ID không hợp lệ' }, { status: 400 });
    await recordAdPopupImpression(popupId, user.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in ad-popups impression route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi ghi nhận lượt hiện Popup';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
