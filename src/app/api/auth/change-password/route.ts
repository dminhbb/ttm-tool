import { NextRequest, NextResponse } from 'next/server';
import { changeUserPassword, requireUser, verifyUserPassword } from '@/lib/auth-service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body: unknown = await request.json();

    if (!isRecord(body) || typeof body.action !== 'string') {
      return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
    }

    if (body.action === 'verify') {
      if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
        return NextResponse.json({ error: 'Vui lòng nhập mật khẩu hiện tại.' }, { status: 400 });
      }
      const isValid = await verifyUserPassword(user.id, body.currentPassword);
      if (!isValid) {
        return NextResponse.json({ error: 'Mật khẩu hiện tại không chính xác.' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'change') {
      if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
        return NextResponse.json({ error: 'Thông tin đổi mật khẩu không hợp lệ.' }, { status: 400 });
      }
      const result = await changeUserPassword(user.id, body.currentPassword, body.newPassword);
      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Không thể đổi mật khẩu.' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }
    console.error('Error changing password:', error);
    return NextResponse.json({ error: 'Không thể xử lý yêu cầu đổi mật khẩu.' }, { status: 500 });
  }
}
