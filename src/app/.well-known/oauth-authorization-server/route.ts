import { NextRequest, NextResponse } from 'next/server';

/** RFC 8414 Authorization Server Metadata — this app acts as its own OAuth authorization server
 * for the MCP endpoint (no separate identity provider), reusing the existing ttm-tool session for
 * the actual sign-in step at /api/mcp/oauth/authorize. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  });
}
