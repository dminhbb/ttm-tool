import { NextRequest, NextResponse } from 'next/server';
import { authenticateLocal, createSession, SESSION_COOKIE_NAME } from '@/lib/auth-service';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('username' in body) || !('password' in body) || !('remember' in body)
      || typeof body.username !== 'string' || typeof body.password !== 'string' || typeof body.remember !== 'boolean'
      || body.username.trim().length === 0 || body.username.length > 255 || body.password.length === 0 || body.password.length > 256
      || ('captchaId' in body && typeof body.captchaId !== 'string') || ('captcha' in body && typeof body.captcha !== 'string')) {
      return NextResponse.json({ error: 'Thông tin đăng nhập không hợp lệ.' }, { status: 400 });
    }
    const captchaId = 'captchaId' in body && typeof body.captchaId === 'string' ? body.captchaId : undefined;
    const captcha = 'captcha' in body && typeof body.captcha === 'string' ? body.captcha : undefined;
    const authResult = await authenticateLocal(body.username, body.password, captchaId, captcha);
    if ('error' in authResult) {
      if (authResult.error === 'INACTIVE') {
        return NextResponse.json({ error: 'User chưa kích hoạt, liên hệ admin hoặc domain lead để hỗ trợ.' }, { status: 403 });
      }
      if (authResult.error === 'LOCKED') {
        return NextResponse.json({ error: 'Tài khoản đã bị tạm khóa do nhập sai mật khẩu quá nhiều lần. Hệ thống đã tự tạo yêu cầu cấp lại mật khẩu — vui lòng chờ quản trị viên xử lý.' }, { status: 403 });
      }
      if (authResult.error === 'CAPTCHA_REQUIRED') {
        return NextResponse.json({ error: 'Vui lòng nhập đúng mã CAPTCHA để tiếp tục đăng nhập.', requiresCaptcha: true }, { status: 401 });
      }
      return NextResponse.json({
        error: 'Sai username hoặc mật khẩu.',
        requiresCaptcha: authResult.requiresCaptcha,
        warning: authResult.showWarning ? 'Bạn đã nhập sai nhiều lần. Vui lòng kiểm tra kỹ lại thông tin đăng nhập.' : undefined,
      }, { status: 401 });
    }
    const user = authResult.user;
    const session = await createSession(user.id, body.remember);
    const response = NextResponse.json({ user });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: session.expiresAt,
      path: '/',
    });
    return response;
  } catch (error: unknown) {
    console.error('Authentication login failed:', error);
    return NextResponse.json({ error: 'Không thể đăng nhập. Vui lòng thử lại.' }, { status: 500 });
  }
}
