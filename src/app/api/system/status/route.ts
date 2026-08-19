import { NextResponse } from 'next/server';
import pool, { resolveDbConnectionTarget } from '@/lib/db';
import { getAppVersion } from '@/lib/version';

// Never cache: this endpoint's entire purpose is to report the CURRENT build/DB status, and a
// GET route with no dynamic API usage (cookies()/headers()) is otherwise eligible for Next.js's
// static route cache — which would freeze whatever version.json/db state was live at build time.
export const dynamic = 'force-dynamic';

/** Public (pre-login) status check — version stamp + which DB profile is active and reachable. */
export async function GET() {
  const dbTarget = resolveDbConnectionTarget();
  let dbStatus: 'fail' | 'pass' = 'pass';
  try {
    await pool.query('SELECT 1');
  } catch {
    dbStatus = 'fail';
  }
  return NextResponse.json({ dbStatus, dbTarget, version: getAppVersion() }, { headers: { 'Cache-Control': 'no-store' } });
}
