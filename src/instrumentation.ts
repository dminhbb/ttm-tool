import pool, { resolveDbConnectionTarget } from '@/lib/db';

/** Verify the configured database as soon as each Node.js server process starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const target = resolveDbConnectionTarget();
  try {
    await pool.query('SELECT 1');
    console.info('[db] startup connection successful', {
      target,
      host: process.env.PGHOST,
      port: process.env.PGPORT || '5432',
      database: process.env.PGDATABASE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[db] startup connection failed', { target, message });
  }
}
