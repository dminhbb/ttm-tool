import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { getCurrentUser } from '@/lib/auth-service';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/register', '/api/auth/captcha', '/api/auth/registration-domains', '/api/password-reset-requests'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (hasSessionCookie && await getCurrentUser(request)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
