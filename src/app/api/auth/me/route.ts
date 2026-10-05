import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';
import { getViewDeniedFeatureKeys } from '@/lib/permission-matrix-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    // Permission-matrix features whose "Xem" is unticked for this role — the left panel hides their
    // menu items. Fails open (nothing hidden): a matrix lookup problem must not break sign-in, and
    // the menu's hardcoded role gates still apply regardless.
    const hiddenFeatureKeys = await getViewDeniedFeatureKeys(user.role).catch((error: unknown) => {
      console.error('Permission matrix lookup failed:', error);
      return [] as string[];
    });
    return NextResponse.json({ hiddenFeatureKeys, user });
  } catch (error: unknown) {
    console.error('Authentication profile lookup failed:', error);
    return NextResponse.json({ error: 'Không thể tải thông tin phiên đăng nhập.' }, { status: 500 });
  }
}
