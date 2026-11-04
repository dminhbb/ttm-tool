import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, clientIpOf, peekRateLimit, type RateLimitRule } from '@/lib/rate-limit';

/**
 * Per-source limits of the public endpoints (see rate-limit.ts for what they do and do not guarantee).
 *
 * Sized for a company network (review 2026-11-04): the staff reach the app through a few shared egress addresses (NAT /
 * proxy), so "per IP" means "per office". The limits therefore stop a flood, not normal use of many people at once —
 * and login counts only FAILED attempts (LOGIN_FAILURE_LIMITS), so a morning of sign-ins never runs into it.
 */
export const PUBLIC_RATE_LIMITS = {
  captcha: { limit: 120, windowMs: 60_000 },
  passwordReset: { limit: 30, windowMs: 60 * 60_000 },
  register: { limit: 30, windowMs: 60 * 60_000 },
  /** Answered from a 30-second memo: the limit only guards the function itself. */
  registrationDomains: { limit: 300, windowMs: 60_000 },
  /** Every page load of every signed-in user calls it (footer); the database probe is memoized for 10 seconds. */
  systemStatus: { limit: 600, windowMs: 60_000 },
  /** Wrong import-API tokens — a guessing run, not the crawler. */
  importTokenFailures: { limit: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Failed sign-ins only (successful ones never count): one source + username (a guessing run on one account — on top
 * of authenticateLocal's own lockout), and one source overall (a run over many usernames). Checked before the password
 * is hashed, so a refused attempt costs no bcrypt and no database query.
 */
export const LOGIN_FAILURE_LIMITS = {
  perAccount: { limit: 10, windowMs: 15 * 60_000 },
  perSource: { limit: 100, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

function loginFailureKeys(request: NextRequest, username: string): { account: string; source: string } {
  const ip = clientIpOf(request.headers);
  return { account: `loginFail:${ip}|${username.trim().toLowerCase()}`, source: `loginFail:${ip}` };
}

const tooManyRequests = (retryAfterSeconds: number) => NextResponse.json(
  { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
  { headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSeconds) }, status: 429 },
);

/** The 429 answer when this source (or this source + username) already used up its failed sign-ins, else null. Counts nothing. */
export function loginFailureLimitResponse(request: NextRequest, username: string): NextResponse | null {
  const keys = loginFailureKeys(request, username);
  for (const [key, rule] of [[keys.account, LOGIN_FAILURE_LIMITS.perAccount], [keys.source, LOGIN_FAILURE_LIMITS.perSource]] as const) {
    const decision = peekRateLimit(key, rule);
    if (!decision.allowed) return tooManyRequests(decision.retryAfterSeconds);
  }
  return null;
}

/** Counts one failed sign-in of this source and username. */
export function recordLoginFailure(request: NextRequest, username: string): void {
  const keys = loginFailureKeys(request, username);
  checkRateLimit(keys.account, LOGIN_FAILURE_LIMITS.perAccount);
  checkRateLimit(keys.source, LOGIN_FAILURE_LIMITS.perSource);
}

/** null when the request may go on, else the 429 answer (with Retry-After). `scope` separates the counters of endpoints. */
export function rateLimitResponse(request: NextRequest, scope: string, rule: RateLimitRule): NextResponse | null {
  const decision = checkRateLimit(`${scope}:${clientIpOf(request.headers)}`, rule);
  return decision.allowed ? null : tooManyRequests(decision.retryAfterSeconds);
}
