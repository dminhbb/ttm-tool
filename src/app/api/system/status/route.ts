import { NextResponse } from 'next/server';
import pool, { resolveDbConnectionTarget } from '@/lib/db';
import { getAppVersion } from '@/lib/version';

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
