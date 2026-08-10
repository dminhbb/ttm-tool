import { NextRequest, NextResponse } from 'next/server';
import { authenticateLocal, createSession, SESSION_COOKIE_NAME } from '@/lib/auth-service';

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isLoginAllowed(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= Date.now()) return true;
  return entry.count < MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const entry = attempts.get(ip);
  const now = Date.now();
  if (!entry || entry.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else attempts.set(ip, { ...entry, count: entry.count + 1 });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!isLoginAllowed(ip)) return NextResponse.json({ error: 'Đăng nhập tạm thời bị giới hạn. Vui lòng thử lại sau.' }, { status: 429 });
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('username' in body) || !('password' in body) || !('remember' in body)
      || typeof body.username !== 'string' || typeof body.password !== 'string' || typeof body.remember !== 'boolean'
      || body.username.trim().length === 0 || body.username.length > 255 || body.password.length === 0 || body.password.length > 256) {
      return NextResponse.json({ error: 'Thông tin đăng nhập không hợp lệ.' }, { status: 400 });
    }
    const user = await authenticateLocal(body.username, body.password);
    if (!user) {
      recordFailure(ip);
      return NextResponse.json({ error: 'Sai username hoặc mật khẩu.' }, { status: 401 });
    }
    attempts.delete(ip);
    const session = await createSession(user.id, body.remember);
    const response = NextResponse.json({ user });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: session.expiresAt,
      path: '/',
    });
    return response;
  } catch (error: unknown) {
    console.error('Authentication login failed:', error);
    return NextResponse.json({ error: 'Không thể đăng nhập. Vui lòng thử lại.' }, { status: 500 });
  }
}
