import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { getCurrentUser } from '@/lib/auth-service';

// '/api/data-source/import/auto' is "public" only from this proxy's point of view — it has its
// own bearer-token check (IMPORT_API_TOKEN) inside the route itself, for the Python export
// script's machine-to-machine calls, which never have a user session cookie to present here.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/register', '/api/auth/captcha', '/api/auth/registration-domains', '/api/password-reset-requests', '/api/system/status', '/api/data-source/import/auto'];

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
