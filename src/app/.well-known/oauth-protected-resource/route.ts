import { NextRequest, NextResponse } from 'next/server';

/** RFC 9728 Protected Resource Metadata — pointed at from the WWW-Authenticate header on /api/mcp's
 * 401 responses (resource_metadata parameter), so an MCP client that speaks the spec can discover
 * this app's own authorization server without any prior configuration. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
  });
}
