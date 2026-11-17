import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { FloatMessageInputError, validateFloatMessageInput } from '@/lib/float-message';
import { getFloatMessageSettings, saveFloatMessageSettings } from '@/lib/float-message-service';

/** Quản trị hệ thống → "Float message" (SUPERADMIN) — spec docs/superpowers/specs/2026-11-17-float-message-design.md. */

const NO_STORE = { 'Cache-Control': 'no-store' };

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Float message.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  if (error instanceof FloatMessageInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  // 42P01: migration 20261129 not applied on this database.
  if ((error as { code?: string }).code === '42P01') {
    return NextResponse.json({ error: 'CSDL chưa có bảng float_message_settings — cần chạy migration 20261129_create_float_message_settings.' }, { status: 503 });
  }
  console.error(`API Error (float message): ${fallback}`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getFloatMessageSettings({ fresh: true }), { headers: NO_STORE });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể tải cấu hình Float message.');
  }
}

/** { messageText, isActive, startDate, endDate, autoHideSeconds, dismissible, position } → the saved settings. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const input = validateFloatMessageInput(await request.json().catch(() => null));
    return NextResponse.json(await saveFloatMessageSettings(input, user.id), { headers: NO_STORE });
  } catch (error: unknown) {
    return errorResponse(error, 'Không thể lưu cấu hình Float message.');
  }
}
