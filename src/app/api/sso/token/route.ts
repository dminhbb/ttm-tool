import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exchangeCodeForUser } from '@/lib/sso-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const headerApiKey = request.headers.get('x-api-key');

    const code = body.code || '';
    const apiKey = body.api_key || body.client_id || headerApiKey || '';

    if (!code || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_PARAMETERS',
          message: 'Yêu cầu truyền đủ code và api_key (hoặc client_id / Header X-API-Key).',
        },
        { status: 400 }
      );
    }

    const result = await exchangeCodeForUser(code, apiKey);

    if (!result.success) {
      const messages: Record<string, string> = {
        INVALID_API_KEY: 'API Key (client_id) không chính xác.',
        CODE_NOT_FOUND: 'Mã authorization code không tồn tại.',
        CODE_ALREADY_USED: 'Mã authorization code đã được sử dụng trước đó (chỉ dùng 1 lần).',
        CODE_EXPIRED: 'Mã authorization code đã hết hạn sử dụng (quá 5 phút).',
        USER_INACTIVE: 'Tài khoản người dùng đang bị khóa.',
        CLIENT_INACTIVE: 'API Key (client_id) đang tạm ngưng hoạt động.',
      };

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: messages[result.error] || 'Xác thực thất bại.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      appName: result.appName,
      user: result.user,
      accessToken: `ttm_at_${Date.now()}_${result.user.id}`,
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: error?.message || 'Lỗi xử lý hệ thống.',
      },
      { status: 500 }
    );
  }
}
