import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_RATE_LIMITS, rateLimitResponse } from '@/lib/api-rate-limit';
import { issueCaptcha } from '@/lib/captcha-service';

export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request, 'captcha', PUBLIC_RATE_LIMITS.captcha);
  if (limited) return limited;
  return NextResponse.json(issueCaptcha(), { headers: { 'Cache-Control': 'no-store' } });
}
