import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_RATE_LIMITS, rateLimitResponse } from '@/lib/api-rate-limit';
import pool, { resolveDbConnectionTarget } from '@/lib/db';
import { createTtlMemo } from '@/lib/rate-limit';
import { getAppVersion } from '@/lib/version';

// Never cache: this endpoint's entire purpose is to report the CURRENT build/DB status, and a
// GET route with no dynamic API usage (cookies()/headers()) is otherwise eligible for Next.js's
// static route cache — which would freeze whatever version.json/db state was live at build time.
export const dynamic = 'force-dynamic';

// The database probe is kept for a few seconds: this public endpoint must not turn every hit into a query
// (and a wake-up of a sleeping free-tier database) — a burst is answered from one probe.
const probeDatabase = createTtlMemo<'fail' | 'pass'>(10_000);

/** Public (pre-login) status check — version stamp + which DB profile is active and reachable. */
export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request, 'systemStatus', PUBLIC_RATE_LIMITS.systemStatus);
  if (limited) return limited;
  const dbTarget = resolveDbConnectionTarget();
  const dbStatus = await probeDatabase(() => pool.query('SELECT 1').then(() => 'pass' as const, () => 'fail' as const));
  return NextResponse.json({ dbStatus, dbTarget, version: getAppVersion() }, { headers: { 'Cache-Control': 'no-store' } });
}
