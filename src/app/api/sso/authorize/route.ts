import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authenticateLocal, getCurrentUser } from '@/lib/auth-service';
import { generateAuthorizationCode, validateSsoClient } from '@/lib/sso-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { clientId, redirectUri, state, username, password, confirmExistingSession } = body;

    if (!clientId || !redirectUri) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin clientId hoặc redirectUri.' }, { status: 400 });
    }

    const validation = await validateSsoClient(clientId);
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.reason }, { status: 400 });
    }

    let authenticatedUserId: number | null = null;

    if (confirmExistingSession) {
      const currentUser = await getCurrentUser(request);
      if (currentUser) {
        authenticatedUserId = currentUser.id;
      }
    }

    if (!authenticatedUserId) {
      if (!username || !password) {
        return NextResponse.json({ success: false, error: 'Vui lòng nhập Tên đăng nhập và Mật khẩu.' }, { status: 400 });
      }

      const authRes = await authenticateLocal(username, password);
      if ('error' in authRes) {
        if (authRes.error === 'INACTIVE') {
          return NextResponse.json({ success: false, error: 'Tài khoản của bạn đang bị khóa.' }, { status: 401 });
        }
        return NextResponse.json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, { status: 401 });
      }
      authenticatedUserId = authRes.user.id;
    }

    const code = await generateAuthorizationCode(validation.apiKey.id, authenticatedUserId, redirectUri);

    const redirectUrlObj = new URL(redirectUri);
    redirectUrlObj.searchParams.set('code', code);
    if (state) {
      redirectUrlObj.searchParams.set('state', state);
    }

    return NextResponse.json({
      success: true,
      redirectUrl: redirectUrlObj.toString(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi xử lý xác thực SSO.' }, { status: 500 });
  }
}
