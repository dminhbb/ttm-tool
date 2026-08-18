import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserProfileDetails } from '@/lib/auth-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    const details = await getUserProfileDetails(user.id, user.role);
    return NextResponse.json({ user, ...details });
  } catch (error: unknown) {
    console.error('API Error loading user profile:', error);
    return NextResponse.json({ error: 'Không thể tải thông tin người dùng.' }, { status: 500 });
  }
}
