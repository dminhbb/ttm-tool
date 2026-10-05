import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { getCurrentUser } from '@/lib/auth-service';
import { apiFeatureKey, fallbackPathFor, pageFeatureKey } from '@/lib/feature-access';
import { getViewDeniedFeatureKeySet } from '@/lib/permission-matrix-service';

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
  const user = hasSessionCookie ? await getCurrentUser(request) : null;
  if (user) return enforceViewPermission(request, user.role);
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  const loginUrl = new URL('/login', request.url);
  // Keep the query string too — deep links like /epic-alerts-15?alert=FAIL&projects=WM would
  // otherwise land back on the screen with every filter dropped after signing in.
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

/**
 * Ma trận phân quyền — "Xem" unticked for the role blocks the page (redirect to the first landing
 * page still allowed) and its page-exclusive data API (403); see feature-access.ts. Only narrows:
 * the hardcoded role checks still apply after this. If the matrix can't be read, access is left to
 * those role checks rather than locking every user out.
 */
async function enforceViewPermission(request: NextRequest, role: Parameters<typeof getViewDeniedFeatureKeySet>[0]): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const featureKey = isApi ? apiFeatureKey(pathname) : pageFeatureKey(pathname);
  if (!featureKey) return NextResponse.next();
  const denied = await getViewDeniedFeatureKeySet(role).catch((error: unknown) => {
    console.error('Permission matrix lookup failed in proxy — falling back to role checks only:', error);
    return null;
  });
  if (!denied?.has(featureKey)) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: 'Bạn không có quyền xem chức năng này (Ma trận phân quyền).' }, { status: 403 });
  const target = new URL(fallbackPathFor(denied, pathname), request.url);
  target.searchParams.set('denied', featureKey);
  return NextResponse.redirect(target);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
