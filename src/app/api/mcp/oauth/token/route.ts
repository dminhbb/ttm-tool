import { NextRequest, NextResponse } from 'next/server';
import { createPersonalAccessToken } from '@/lib/mcp-service';
import { consumeAuthorizationCode } from '@/lib/mcp-oauth-service';

function oauthError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readTokenRequestBody(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json().catch(() => ({}));
    return typeof body === 'object' && body !== null ? (body as Record<string, string>) : {};
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

/**
 * Token endpoint — exchanges a consumed authorization code (see /oauth/consent) plus its PKCE
 * verifier for a bearer access token. That token is nothing special: it's a normal Personal
 * Access Token minted through the exact same createPersonalAccessToken() a user's own "Thông tin
 * người dùng" panel calls, just labeled with the OAuth client's name — /api/mcp never needs to
 * know or care whether a token came from the manual PAT flow or this OAuth flow.
 */
export async function POST(request: NextRequest) {
  const body = await readTokenRequestBody(request);
  if (body.grant_type !== 'authorization_code') {
    return oauthError('unsupported_grant_type');
  }
  if (!body.code || !body.redirect_uri || !body.client_id || !body.code_verifier) {
    return oauthError('invalid_request');
  }

  const result = await consumeAuthorizationCode({
    clientId: body.client_id,
    code: body.code,
    codeVerifier: body.code_verifier,
    redirectUri: body.redirect_uri,
  });
  if ('error' in result) {
    return oauthError(result.error);
  }

  const token = await createPersonalAccessToken(result.userId, `OAuth: ${result.clientName}`);
  return NextResponse.json(
    { access_token: token.token, token_type: 'Bearer' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
