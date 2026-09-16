import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';
import { createAuthorizationCode, resolveOAuthClient } from '@/lib/mcp-oauth-service';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
}

function errorPage(title: string, message: string): NextResponse {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f4f4f2;color:#0e0f0c;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:28px;border-radius:12px;background:#fff;border:1px solid rgb(14 15 12/0.2);text-align:center}
h1{font-size:17px;margin:0 0 8px}p{font-size:14px;color:#454745;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
  return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function redirectWithQuery(baseUrl: string, query: Record<string, string>): NextResponse {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

/** Handles the "Cho phép" / "Từ chối" submit from the consent page — re-validates everything
 * server-side (never trust the hidden fields as-is) before minting a code or bouncing back with
 * an OAuth error, exactly as an authorization server is expected to. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return errorPage('Phiên đăng nhập đã hết hạn', 'Vui lòng đóng cửa sổ này và thử kết nối lại từ ứng dụng AI của bạn.');
  }

  const form = await request.formData();
  const decision = form.get('decision');
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const codeChallenge = String(form.get('code_challenge') ?? '');
  const state = String(form.get('state') ?? '');

  const client = await resolveOAuthClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return errorPage('Yêu cầu không hợp lệ', 'Không thể xác thực lại ứng dụng yêu cầu kết nối. Vui lòng thử lại từ đầu.');
  }

  if (decision !== 'allow') {
    return redirectWithQuery(redirectUri, { error: 'access_denied', state });
  }

  const code = await createAuthorizationCode({
    clientId,
    clientName: client.clientName,
    codeChallenge,
    redirectUri,
    userId: user.id,
  });
  return redirectWithQuery(redirectUri, { code, state });
}
