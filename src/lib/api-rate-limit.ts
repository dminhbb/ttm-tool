import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIpOf, type RateLimitRule } from '@/lib/rate-limit';

/** Per-source limits of the public endpoints (see rate-limit.ts for what they do and do not guarantee). */
export const PUBLIC_RATE_LIMITS = {
  captcha: { limit: 30, windowMs: 60_000 },
  /** Per source address; the per-account lockout of authenticateLocal is the other layer. */
  login: { limit: 30, windowMs: 5 * 60_000 },
  passwordReset: { limit: 10, windowMs: 60 * 60_000 },
  register: { limit: 10, windowMs: 60 * 60_000 },
  registrationDomains: { limit: 60, windowMs: 60_000 },
  systemStatus: { limit: 60, windowMs: 60_000 },
  /** Wrong import-API tokens — a guessing run, not the crawler. */
  importTokenFailures: { limit: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** null when the request may go on, else the 429 answer (with Retry-After). `scope` separates the counters of endpoints. */
export function rateLimitResponse(request: NextRequest, scope: string, rule: RateLimitRule): NextResponse | null {
  const decision = checkRateLimit(`${scope}:${clientIpOf(request.headers)}`, rule);
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
    { headers: { 'Cache-Control': 'no-store', 'Retry-After': String(decision.retryAfterSeconds) }, status: 429 },
  );
}
