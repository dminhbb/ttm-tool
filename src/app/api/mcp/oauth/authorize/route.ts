import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-service';
import { resolveOAuthClient } from '@/lib/mcp-oauth-service';

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

function consentPage(params: { clientName: string; hidden: Record<string, string> }): NextResponse {
  const hiddenFields = Object.entries(params.hidden)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('\n');

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cho phép kết nối MCP</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f4f4f2;color:#0e0f0c;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
  .card{max-width:440px;width:100%;padding:28px;border-radius:14px;background:#fff;border:1px solid rgb(14 15 12/0.15);box-shadow:0 8px 24px rgb(14 15 12/0.08)}
  h1{font-size:18px;margin:0 0 6px;font-weight:700}
  p{font-size:14px;color:#454745;line-height:1.5;margin:0 0 20px}
  strong{color:#0e0f0c}
  .actions{display:flex;gap:10px;justify-content:flex-end}
  button{font:inherit;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;cursor:pointer;border:1px solid transparent}
  .allow{background:#1c6e2e;color:#fff}
  .allow:hover{background:#175b26}
  .deny{background:#fff;color:#454745;border-color:rgb(14 15 12/0.2)}
  .deny:hover{background:#f4f4f2}
  .badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.02em;color:#1c6e2e;background:#e8f5ea;border-radius:999px;padding:3px 10px;margin-bottom:12px}
</style></head>
<body>
  <div class="card">
    <span class="badge">ttm-tool · MCP</span>
    <h1>Cho phép <strong>${escapeHtml(params.clientName)}</strong> kết nối?</h1>
    <p>Ứng dụng này sẽ có thể tra cứu dữ liệu epic, cảnh báo TTM, dashboard, dự án... trong phạm vi quyền hạn tài khoản của bạn trên ttm-tool. Bạn có thể thu hồi quyền này bất cứ lúc nào trong mục "Thông tin người dùng".</p>
    <form method="post" action="/api/mcp/oauth/consent">
      ${hiddenFields}
      <div class="actions">
        <button class="deny" type="submit" name="decision" value="deny">Từ chối</button>
        <button class="allow" type="submit" name="decision" value="allow">Cho phép</button>
      </div>
    </form>
  </div>
</body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Browser-facing step of the OAuth flow — opened by the MCP client (claude.ai etc.) in a popup.
 * Reuses the ordinary ttm-tool session cookie instead of asking for a separate login: if the user
 * is already signed in, they only see the consent screen below; otherwise they're bounced through
 * the normal /login page and land back here with the exact same query string. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const responseType = searchParams.get('response_type');
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const state = searchParams.get('state') ?? '';
  const resource = searchParams.get('resource') ?? '';
  const scope = searchParams.get('scope') ?? '';

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    return errorPage('Yêu cầu không hợp lệ', 'Thiếu tham số OAuth bắt buộc hoặc code_challenge_method không được hỗ trợ (chỉ hỗ trợ S256).');
  }

  const client = await resolveOAuthClient(clientId);
  if (!client) {
    return errorPage('Không nhận diện được ứng dụng', 'client_id không hợp lệ hoặc không thể tải thông tin ứng dụng.');
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return errorPage('redirect_uri không khớp', 'redirect_uri không nằm trong danh sách đã đăng ký của ứng dụng này.');
  }

  const user = await getCurrentUser(request);
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return consentPage({
    clientName: client.clientName,
    hidden: {
      client_id: clientId,
      client_name: client.clientName,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state,
      resource,
      scope,
    },
  });
}
