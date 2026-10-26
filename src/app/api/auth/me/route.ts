import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, updateUserBadgeDesignStyle } from '@/lib/auth-service';
import { isBadgeDesignStyle } from '@/lib/badge-design';
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    const badgeDesignStyle =
      typeof body === 'object' && body !== null && 'badgeDesignStyle' in body
        ? (body as { badgeDesignStyle?: unknown }).badgeDesignStyle
        : undefined;
    if (!isBadgeDesignStyle(badgeDesignStyle)) {
      return NextResponse.json({ error: 'Thiết kế Badge không hợp lệ.' }, { status: 400 });
    }
    await updateUserBadgeDesignStyle(user.id, badgeDesignStyle);
    return NextResponse.json({ ok: true, badgeDesignStyle });
  } catch (error: unknown) {
    console.error('Badge design preference update failed:', error);
    return NextResponse.json({ error: 'Không thể lưu tùy chọn Thiết kế Badge.' }, { status: 500 });
  }
}
