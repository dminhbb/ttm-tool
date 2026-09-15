import { NextRequest, NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildMcpServer } from '@/lib/mcp-server';
import { getMcpSettings, verifyMcpAccessToken } from '@/lib/mcp-service';

export const runtime = 'nodejs';

function unauthorized(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
}

/**
 * Single entry point for every MCP client (Claude, ChatGPT, Gemini, Copilot, ...): one
 * WebStandardStreamableHTTPServerTransport + McpServer is built fresh per HTTP request (stateless
 * mode — no sessionIdGenerator) since Vercel functions don't keep a process alive between calls,
 * and different requests can belong to different users' Personal Access Tokens anyway.
 */
async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const settings = await getMcpSettings();
  if (!settings.isEnabled) {
    return NextResponse.json({ error: 'MCP Server hiện đang tắt. Liên hệ SUPERADMIN để bật trong Quản trị hệ thống.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return unauthorized('Thiếu hoặc sai định dạng Authorization: Bearer <token>.');
  }

  const resolved = await verifyMcpAccessToken(token);
  if (!resolved) {
    return unauthorized('Personal Access Token không hợp lệ hoặc đã bị thu hồi.');
  }

  const server = buildMcpServer(resolved.user, resolved.tokenId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request);
}
