import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { getCurrentUser } from '@/lib/auth-service';

// '/api/data-source/import/auto' and '/api/mcp' are "public" only from this proxy's point of
// view — each has its own bearer-token check inside the route itself (IMPORT_API_TOKEN for the
// Python export script, a Personal Access Token for MCP clients), since neither caller carries a
// browser session cookie to present here.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/auth/register', '/api/auth/captcha', '/api/auth/registration-domains', '/api/password-reset-requests', '/api/system/status', '/api/data-source/import/auto', '/api/mcp'];

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
