import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exchangeCodeForUser } from '@/lib/sso-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, apiKey } = body;

    if (!code || !apiKey) {
      return NextResponse.json({ success: false, error: 'Thiếu mã code hoặc apiKey.' }, { status: 400 });
    }

    const result = await exchangeCodeForUser(code, apiKey);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      appName: result.appName,
      user: result.user,
      accessToken: `ttm_at_demo_${Date.now()}_${result.user.id}`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi xử lý demo callback.' }, { status: 500 });
  }
}
