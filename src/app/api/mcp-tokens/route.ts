import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createPersonalAccessToken, listPersonalAccessTokens, revokePersonalAccessToken } from '@/lib/mcp-service';

const MAX_TOKEN_NAME_LENGTH = 255;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(await listPersonalAccessTokens(user.id));
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error listing MCP tokens:', error);
    return NextResponse.json({ error: 'Không thể tải danh sách Personal Access Token.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body: unknown = await request.json();
    const tokenName = isRecord(body) && typeof body.tokenName === 'string' ? body.tokenName.trim() : '';
    if (!tokenName || tokenName.length > MAX_TOKEN_NAME_LENGTH) {
      return NextResponse.json({ error: 'Tên token không hợp lệ.' }, { status: 400 });
    }
    const created = await createPersonalAccessToken(user.id, tokenName);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error creating MCP token:', error);
    return NextResponse.json({ error: 'Không thể tạo Personal Access Token.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Thiếu id token.' }, { status: 400 });
    }
    const revoked = await revokePersonalAccessToken(user.id, id);
    if (!revoked) {
      return NextResponse.json({ error: 'Không tìm thấy token hoặc đã bị thu hồi trước đó.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error revoking MCP token:', error);
    return NextResponse.json({ error: 'Không thể thu hồi token.' }, { status: 500 });
  }
}
