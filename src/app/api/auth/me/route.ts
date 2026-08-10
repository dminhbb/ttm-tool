import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    return NextResponse.json({ user });
  } catch (error: unknown) {
    console.error('Authentication profile lookup failed:', error);
    return NextResponse.json({ error: 'Không thể tải thông tin phiên đăng nhập.' }, { status: 500 });
  }
}
