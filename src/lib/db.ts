import { readFileSync } from 'fs';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

export type DbConnectionTarget = 'aiven' | 'local';

/**
 * Which named connection profile to use — 'local' (PGHOST/… or DATABASE_URL_LOCAL, from .env) or
 * 'aiven' (DATABASE_URL_AIVEN). Switching only requires changing DB_CONNECTION in .env.local (never
 * committed — see .env.example) and restarting `next dev`; no code change needed. Deployed
 * environments (Vercel) set DB_CONNECTION=aiven directly as a dashboard env var, since a serverless
 * function can never reach a developer's local Postgres.
 */
export function resolveDbConnectionTarget(): DbConnectionTarget {
  return (process.env.DB_CONNECTION ?? '').trim().toLowerCase() === 'aiven' ? 'aiven' : 'local';
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
  return { connectionString: stripSslModeParam(rawConnectionString), ssl };
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
  return resolveDbConnectionTarget() === 'aiven' ? aivenPoolConfig() : localPoolConfig();
}

let pool: Pool;

if (process.env.NODE_ENV === 'production') {
  pool = new Pool(buildPoolConfig());
} else {
  // Prevent multiple pools from being created in development hot-reloading
  const globalWithPool = global as typeof globalThis & {
    _postgresPool?: Pool;
  };
  if (!globalWithPool._postgresPool) {
    globalWithPool._postgresPool = new Pool(buildPoolConfig());
  }
  pool = globalWithPool._postgresPool;
}

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
