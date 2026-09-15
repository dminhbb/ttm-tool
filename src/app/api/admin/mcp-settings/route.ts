import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getMcpSettings, getMcpUsageSummary, setMcpEnabled } from '@/lib/mcp-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình MCP Server.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const [settings, usage] = await Promise.all([getMcpSettings(), getMcpUsageSummary()]);
    return NextResponse.json({ settings, usage });
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading MCP settings:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình MCP Server.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const isEnabled = isRecord(body) && typeof body.isEnabled === 'boolean' ? body.isEnabled : null;
    if (isEnabled === null) {
      return NextResponse.json({ error: 'Thiếu isEnabled.' }, { status: 400 });
    }
    return NextResponse.json(await setMcpEnabled(isEnabled, user.id));
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error updating MCP settings:', error);
    return NextResponse.json({ error: 'Không thể cập nhật cấu hình MCP Server.' }, { status: 500 });
  }
}
