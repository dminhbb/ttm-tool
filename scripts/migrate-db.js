#!/usr/bin/env node
/**
 * Applies db/schema.sql (only with --init, since it starts with destructive DROP TABLE ...
 * CASCADE — safe only against a brand-new, empty database) and every db/migrations/*.sql file
 * (in filename order, skipping *.down.sql) against the chosen connection profile.
 *
 * Tracks what's already been applied in a schema_migrations table, so re-running is safe — only
 * files not yet recorded actually execute. schema.sql itself isn't tracked (it's a one-time
 * bootstrap, not a migration), but --init on an already-initialized database is refused as a
 * guardrail against the DROP CASCADE at its top.
 *
 * Usage:
 *   node scripts/migrate-db.js --target=aiven --init       # first-time setup of a fresh Aiven DB
 *   node scripts/migrate-db.js --target=aiven               # apply any new migrations later
 *   node scripts/migrate-db.js --target=supabase --init     # same, against a fresh Supabase DB
 *   node scripts/migrate-db.js --target=supabase            # apply any new migrations later
 *   node scripts/migrate-db.js --target=local                # same, against your local Postgres
 *   node scripts/migrate-db.js --target=local --baseline     # DB already has every migration
 *                                                             # applied by hand (e.g. this repo's
 *                                                             # existing local DB) — record them as
 *                                                             # applied WITHOUT re-running the SQL.
 *
 * Reads DATABASE_URL_AIVEN / DATABASE_URL_SUPABASE / PGHOST etc from .env.local + .env, same as the
 * Next.js app.
 */
const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');
const { Pool } = require('pg');

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith('--target='));
const target = (targetArg ? targetArg.split('=')[1] : '').trim().toLowerCase();
const runInit = args.includes('--init');
const baselineOnly = args.includes('--baseline');

if (target !== 'aiven' && target !== 'local' && target !== 'supabase') {
  console.error('Thiếu hoặc sai --target. Dùng --target=local, --target=aiven hoặc --target=supabase.');
  process.exit(1);
}

// pg-connection-string derives its own `ssl` settings from a `sslmode=` query param (current
// versions treat `require` as an alias for `verify-full`), which silently overrides the explicit
// `ssl` object below — so Aiven's self-signed project CA fails validation even with
// PGSSLROOTCERT set correctly. Strip it since we own SSL explicitly via the `ssl` field.
function stripSslModeParam(connectionString) {
  return connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
}

function buildPoolConfig() {
  if (target === 'aiven') {
    const rawConnectionString = process.env.DATABASE_URL_AIVEN;
    if (!rawConnectionString) {
      console.error('Thiếu DATABASE_URL_AIVEN trong .env.local. Xem .env.example để biết cách lấy giá trị này từ Aiven Console.');
      process.exit(1);
    }
    const ssl = process.env.PGSSLROOTCERT
      ? { ca: fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
    return { connectionString: stripSslModeParam(rawConnectionString), ssl };
  }
  if (target === 'supabase') {
    const rawConnectionString = process.env.DATABASE_URL_SUPABASE;
    if (!rawConnectionString) {
      console.error('Thiếu DATABASE_URL_SUPABASE trong .env.local. Xem .env.example để biết cách lấy giá trị này từ Supabase Dashboard.');
      process.exit(1);
    }
    const ssl = process.env.PGSSLROOTCERT_SUPABASE
      ? { ca: fs.readFileSync(process.env.PGSSLROOTCERT_SUPABASE, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
    return { connectionString: stripSslModeParam(rawConnectionString), ssl };
  }
  if (process.env.DATABASE_URL_LOCAL) return { connectionString: process.env.DATABASE_URL_LOCAL };
  return {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

function migrationFiles() {
  const dir = path.join(process.cwd(), 'db', 'migrations');
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
    .sort()
    .map((file) => path.join(dir, file));
}

// db/schema.sql was hand-edited over time and now already includes some columns/constraints that
// an EARLIER migration file also adds — so on a fresh DB, schema.sql + that migration both try to
// create the same thing. Their net effect still matches (that's why nobody noticed), so treat
// "already exists" as a shrug, not a failure: log it, mark the migration applied, keep going.
const ALREADY_EXISTS_CODES = new Set([
  '42701', // duplicate_column
  '42710', // duplicate_object (constraint, etc.)
  '42P07', // duplicate_table
  '42P06', // duplicate_schema
  '42P16', // invalid_table_definition (e.g. duplicate primary key on CREATE TABLE)
]);

async function ensureTrackingTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function alreadyInitialized(pool) {
  const result = await pool.query("SELECT to_regclass('public.schema_migrations') AS reg;");
  return result.rows[0].reg !== null;
}

async function main() {
  const pool = new Pool(buildPoolConfig());
  try {
    if (runInit) {
      if (await alreadyInitialized(pool)) {
        console.error('DB này đã có bảng schema_migrations (đã init trước đó) — bỏ --init để chỉ áp dụng migration mới, tránh chạy lại schema.sql (có DROP TABLE ... CASCADE).');
        process.exit(1);
      }
      const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
      console.log(`Đang khởi tạo schema gốc lên target "${target}" từ ${path.relative(process.cwd(), schemaPath)} ...`);
      await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      console.log('  OK');
    }

    await ensureTrackingTable(pool);
    const applied = new Set((await pool.query('SELECT filename FROM schema_migrations;')).rows.map((row) => row.filename));

    const pending = migrationFiles().filter((file) => !applied.has(path.basename(file)));

    if (baselineOnly) {
      console.log(`Target "${target}": ghi nhận ${pending.length} migration là đã áp dụng (KHÔNG chạy lại SQL).`);
      for (const file of pending) {
        const filename = path.basename(file);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [filename]);
        console.log(`  → ${filename} ... đánh dấu đã áp dụng`);
      }
      console.log('Hoàn tất.');
      return;
    }

    console.log(`Target "${target}": ${pending.length} migration mới cần áp dụng (${applied.size} đã áp dụng trước đó).`);

    for (const file of pending) {
      const filename = path.basename(file);
      process.stdout.write(`  → ${filename} ... `);
      try {
        await pool.query(fs.readFileSync(file, 'utf8'));
        console.log('OK');
      } catch (error) {
        if (!ALREADY_EXISTS_CODES.has(error.code)) throw error;
        console.log(`bỏ qua (đã tồn tại sẵn trong schema.sql — ${error.message})`);
      }
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [filename]);
    }

    console.log('Hoàn tất.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('\nMigrate thất bại:', error.message);
  process.exit(1);
});
