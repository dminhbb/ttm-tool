import { Pool } from 'pg';

let pool: Pool;

if (process.env.NODE_ENV === 'production') {
  pool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
} else {
  // Prevent multiple pools from being created in development hot-reloading
  const globalWithPool = global as typeof globalThis & {
    _postgresPool?: Pool;
  };
  if (!globalWithPool._postgresPool) {
    globalWithPool._postgresPool = new Pool({
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    });
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
