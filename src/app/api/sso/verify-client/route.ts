import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateSsoClient } from '@/lib/sso-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  if (!clientId) {
    return NextResponse.json({ success: false, error: 'Thiếu tham số client_id.' }, { status: 400 });
  }

  const validation = await validateSsoClient(clientId);
  if (!validation.isValid) {
    return NextResponse.json({ success: false, error: validation.reason }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    client: {
      appName: validation.apiKey.appName,
      keyName: validation.apiKey.keyName,
    },
  });
}
