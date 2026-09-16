import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { getCurrentUser } from '@/lib/auth-service';

// '/api/data-source/import/auto' and '/api/mcp' are "public" only from this proxy's point of
// view — each has its own bearer-token check inside the route itself (IMPORT_API_TOKEN for the
// Python export script, a Personal Access Token for MCP clients), since neither caller carries a
// browser session cookie to present here.
//
// The '/api/mcp/oauth/*' and '.well-known' entries back the OAuth 2.1 front door in front of
// /api/mcp (see mcp-oauth-service.ts): 'register' and 'token' are called machine-to-machine by
// the MCP client's own backend (never a browser, so never a session cookie); 'authorize' is opened
// in a real browser popup but must reach its own handler even when signed out, since that handler
// does the getCurrentUser() check itself and redirects to /login with `next` pointing right back
// here — same outcome this proxy gives every other page, just done one layer in; 'consent' is the
// form POST off that page, always carrying a real session cookie by the time it fires, but is kept
// public too so an expired-mid-flow session gets this route's own friendly HTML error instead of
// this proxy's generic JSON 401. The two '.well-known/oauth-*' paths are plain metadata GETs an
// OAuth client fetches before a user is ever involved.
const PUBLIC_PATHS = [
  '/login', '/api/auth/login', '/api/auth/logout', '/api/auth/register', '/api/auth/captcha',
  '/api/auth/registration-domains', '/api/password-reset-requests', '/api/system/status',
  '/api/data-source/import/auto', '/api/mcp',
  '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource',
  '/api/mcp/oauth/register', '/api/mcp/oauth/authorize', '/api/mcp/oauth/consent', '/api/mcp/oauth/token',
];

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
