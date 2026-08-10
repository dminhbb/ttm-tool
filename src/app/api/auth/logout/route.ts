import { NextRequest, NextResponse } from 'next/server';
import { deleteCurrentSession, SESSION_COOKIE_NAME } from '@/lib/auth-service';

export async function POST(request: NextRequest) {
  try {
    await deleteCurrentSession(request);
    const response = NextResponse.json({ success: true });
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: '', path: '/', maxAge: 0 });
    return response;
  } catch (error: unknown) {
    console.error('Authentication logout failed:', error);
    return NextResponse.json({ error: 'Không thể đăng xuất.' }, { status: 500 });
  }
}
