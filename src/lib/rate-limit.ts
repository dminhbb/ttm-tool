/**
 * Fixed-window request limiter, in memory — the cheap guard for the PUBLIC endpoints (login, register, password
 * reset, captcha, status…) on a free tier: a flood must not turn into database queries and function minutes.
 *
 * Honest limits: the counters live in ONE server instance. On Vercel each warm instance has its own, so this stops a
 * burst from one source (which keeps hitting the same warm instance) but is not a global quota — the per-account
 * lockout of authenticateLocal and the platform's own firewall remain the other layers. No database writes, no
 * migration. Pure (no Next.js import): the response helper is api-rate-limit.ts.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Most distinct keys kept — bounds the memory a flood of different sources can take. */
export const MAX_RATE_LIMIT_KEYS = 5_000;

const buckets = new Map<string, Bucket>();

function evict(now: number): void {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size < MAX_RATE_LIMIT_KEYS) return;
  // Still full of live windows: drop the oldest tenth (Map keeps insertion order).
  let toDrop = Math.ceil(MAX_RATE_LIMIT_KEYS / 10);
  for (const key of buckets.keys()) {
    if (toDrop-- <= 0) break;
    buckets.delete(key);
  }
}

/** Counts one request of `key` against `rule`. The request that exceeds the limit is refused (and not counted twice). */
export function checkRateLimit(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitDecision {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (!existing && buckets.size >= MAX_RATE_LIMIT_KEYS) evict(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= rule.limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** For tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** The caller's address from the proxy headers (first hop of x-forwarded-for, else x-real-ip); 'unknown' groups the rest. */
export function clientIpOf(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** A result kept for `ttlMs` — so a public endpoint that reads the database answers a burst from one read. */
export function createTtlMemo<T>(ttlMs: number): (load: () => Promise<T>) => Promise<T> {
  let memo: { at: number; value: Promise<T> } | null = null;
  return (load) => {
    if (memo && Date.now() - memo.at < ttlMs) return memo.value;
    const value = load();
    const entry = { at: Date.now(), value };
    memo = entry;
    // A failed load must not stay cached.
    value.catch(() => { if (memo === entry) memo = null; });
    return value;
  };
}
