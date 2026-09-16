import { NextRequest, NextResponse } from 'next/server';
import { registerOAuthClient } from '@/lib/mcp-oauth-service';

const MAX_REDIRECT_URIS = 10;

function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** RFC 7591 Dynamic Client Registration — the "No client ID — register one automatically" option
 * in claude.ai's "Add custom connector" dialog calls this once per connector. Public clients only
 * (PKCE is the actual proof of possession), so no client_secret is ever issued. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0 || body.redirect_uris.length > MAX_REDIRECT_URIS) {
    return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'redirect_uris là bắt buộc.' }, { status: 400 });
  }
  if (!body.redirect_uris.every(isAbsoluteHttpUrl)) {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 });
  }
  const clientName = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 255) : 'Ứng dụng AI chưa đặt tên';

  const client = await registerOAuthClient(clientName, body.redirect_uris as string[]);
  return NextResponse.json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  }, { status: 201 });
}
