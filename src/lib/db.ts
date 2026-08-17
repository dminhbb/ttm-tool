import { readFileSync } from 'fs';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

export type DbConnectionTarget = 'aiven' | 'local' | 'supabase';

/**
 * Which named connection profile to use — 'local' (PGHOST/… or DATABASE_URL_LOCAL, from .env),
 * 'aiven' (DATABASE_URL_AIVEN), or 'supabase' (DATABASE_URL_SUPABASE). Switching only requires
 * changing DB_CONNECTION in .env.local (never committed — see .env.example); the exported `pool`
 * below picks the change up on its next query, no restart needed (see the "quick switch" doc
 * comment further down). Deployed environments (Vercel) set DB_CONNECTION=aiven/supabase directly
 * as a dashboard env var, since a serverless function can never reach a developer's local Postgres.
 */
export function resolveDbConnectionTarget(): DbConnectionTarget {
  const value = (process.env.DB_CONNECTION ?? '').trim().toLowerCase();
  if (value === 'aiven') return 'aiven';
  if (value === 'supabase') return 'supabase';
  return 'local';
}

/**
 * pg-connection-string reads `sslmode=` off the URL and derives its own `ssl` settings from it
 * (current versions treat `require` as an alias for `verify-full`, i.e. "validate against Node's
 * default trusted CA store") — which silently overrides the explicit `ssl` object we pass below,
 * so Aiven's self-signed project CA fails validation even with PGSSLROOTCERT set correctly. We
 * own SSL explicitly via the `ssl` field, so strip `sslmode` from the string to stop it competing.
 */
function stripSslModeParam(connectionString: string): string {
  return connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
}

function aivenPoolConfig(): PoolConfig {
  const rawConnectionString = process.env.DATABASE_URL_AIVEN;
  if (!rawConnectionString) {
    throw new Error('DB_CONNECTION=aiven nhưng thiếu DATABASE_URL_AIVEN (xem .env.example để biết cách lấy giá trị này từ Aiven Console).');
  }
  // Aiven requires TLS. PGSSLROOTCERT (path to the downloaded ca.pem) verifies the cert chain
  // properly; without it we still get an encrypted connection, just without chain validation —
  // acceptable for the free-tier/dev use case this profile is for.
  const ssl: PoolConfig['ssl'] = process.env.PGSSLROOTCERT
    ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
  // Aiven's free tier caps total connections very low (shared across every client hitting it —
  // this app, psql sessions, migrate scripts, …). pg's own default `max` is 10 per Pool, which on
  // its own can exhaust that budget the moment a page fires more than a couple of queries in
  // parallel ("sorry, too many clients already"). Keep this app's own ceiling low so pg queues
  // extra queries instead of opening more physical connections than the plan allows.
  return { connectionString: stripSslModeParam(rawConnectionString), idleTimeoutMillis: 5000, max: 3, ssl };
}

function supabasePoolConfig(): PoolConfig {
  const rawConnectionString = process.env.DATABASE_URL_SUPABASE;
  if (!rawConnectionString) {
    throw new Error('DB_CONNECTION=supabase nhưng thiếu DATABASE_URL_SUPABASE (xem .env.example để biết cách lấy giá trị này từ Supabase Dashboard).');
  }
  // Same reasoning as aivenPoolConfig(): Supabase requires TLS, and its free tier also caps total
  // connections low (worse still if DATABASE_URL_SUPABASE points at the direct connection instead
  // of the pooler — see .env.example). Keep this app's own ceiling low so pg queues extra queries
  // instead of opening more physical connections than the plan allows.
  const ssl: PoolConfig['ssl'] = process.env.PGSSLROOTCERT_SUPABASE
    ? { ca: readFileSync(process.env.PGSSLROOTCERT_SUPABASE, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
  return { connectionString: stripSslModeParam(rawConnectionString), idleTimeoutMillis: 5000, max: 3, ssl };
}

function localPoolConfig(): PoolConfig {
  if (process.env.DATABASE_URL_LOCAL) return { connectionString: process.env.DATABASE_URL_LOCAL };
  return {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

function buildPoolConfig(): PoolConfig {
  const target = resolveDbConnectionTarget();
  if (target === 'aiven') return aivenPoolConfig();
  if (target === 'supabase') return supabasePoolConfig();
  return localPoolConfig();
}

interface PoolState {
  pool: Pool;
  target: DbConnectionTarget;
}

let moduleState: PoolState | undefined;

// Next dev hot-reloads DB_CONNECTION live (it watches .env* files) without restarting the process,
// so a pool built once at first import would silently keep talking to the OLD profile forever —
// this was exactly why switching to DB_CONNECTION=aiven kept authenticating against the stale
// local pool. getPool() re-checks the target on every call and swaps in a fresh Pool when it
// changes, so `pool.query(...)` below always reflects whatever DB_CONNECTION currently says.
function getPool(): Pool {
  const target = resolveDbConnectionTarget();
  const globalWithPool = global as typeof globalThis & { _postgresPoolState?: PoolState };
  const isDev = process.env.NODE_ENV !== 'production';
  const state = isDev ? globalWithPool._postgresPoolState : moduleState;

  if (state && state.target === target) return state.pool;

  if (state) void state.pool.end().catch(() => undefined);
  const nextState: PoolState = { pool: new Pool(buildPoolConfig()), target };
  if (isDev) globalWithPool._postgresPoolState = nextState;
  else moduleState = nextState;
  return nextState.pool;
}

// A stable Proxy so every existing `import pool from '@/lib/db'; pool.query(...)` call site keeps
// working unchanged, while always dispatching to whatever getPool() currently resolves to.
const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const currentPool = getPool();
    const value = Reflect.get(currentPool, prop, currentPool);
    return typeof value === 'function' ? value.bind(currentPool) : value;
  },
});

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params as Parameters<typeof pool.query>[1]);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rowsCount: res.rowCount });
  }
  return res;
};

export const getClient = async () => {
  return await pool.connect();
};

export default pool;
