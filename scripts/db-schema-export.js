#!/usr/bin/env node
/**
 * Xuất cấu trúc CSDL hiện hành của TTM Monitor từ một DB đã chạy đủ migration (2026-10-20):
 *
 *   db/install/ttm-monitor-schema.sql  — DDL tạo toàn bộ bảng / khoá / index / hàm / trigger trên một DB
 *                                        PostgreSQL MỚI, KHÔNG có dữ liệu nghiệp vụ (chỉ ghi sẵn danh sách
 *                                        migration đã áp dụng vào schema_migrations), kèm phần 7 TUỲ CHỌN: dữ
 *                                        liệu khởi tạo của các bảng cấu hình + 1 SUPERADMIN ban đầu (catalog →
 *                                        `seed`), bật/tắt bằng công tắc ttm_install.seed_data ở đầu file.
 *   docs/database-erd.md               — ERD (Mermaid) theo nhóm nghiệp vụ + từ điển dữ liệu từng bảng.
 *   public/docs/product-guide.html     — thay phần giữa 2 marker <!-- BEGIN GENERATED: db-schema --> …
 *                                        <!-- END GENERATED: db-schema --> của chương 5 (Tài liệu sản phẩm).
 *
 * Cấu trúc (bảng, cột, kiểu, khoá, index, hàm, trigger) luôn ĐỌC TỪ CSDL — không tự suy từ chuỗi migration.
 * Phần chữ viết tay (nhóm nghiệp vụ, vai trò bảng, ghi chú cột) nằm ở scripts/db-schema-catalog.json.
 *
 * Usage:
 *   node scripts/db-schema-export.js                     # DB theo DB_CONNECTION trong .env.local
 *   node scripts/db-schema-export.js --target=supabase   # hoặc --target=local
 *   node scripts/db-schema-export.js --sql-only          # chỉ ghi file SQL
 *   node scripts/db-schema-export.js --docs-only         # chỉ ghi ERD + Tài liệu sản phẩm
 *   node scripts/db-schema-export.js --no-seed           # file SQL không kèm phần 7 (dữ liệu khởi tạo)
 *
 * Chỉ ĐỌC CSDL (SELECT trên catalog). Hàm introspect() nhận một hàm `query` bất kỳ, nên cũng chạy được
 * trên một DB nhúng (vd. PGlite) để kiểm tra file SQL vừa sinh.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_OUT = path.join(ROOT, 'db', 'install', 'ttm-monitor-schema.sql');
const ERD_OUT = path.join(ROOT, 'docs', 'database-erd.md');
const GUIDE = path.join(ROOT, 'public', 'docs', 'product-guide.html');
const CATALOG = path.join(ROOT, 'scripts', 'db-schema-catalog.json');
const GUIDE_BEGIN = '<!-- BEGIN GENERATED: db-schema -->';
const GUIDE_END = '<!-- END GENERATED: db-schema -->';

// ---------------------------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------------------------

/** Every object of schema `public` the app needs, read from the catalog. `query(sql)` → rows. */
async function introspect(query) {
  const tables = await query(`
    SELECT c.oid::int AS oid, c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relname`);
  const columns = await query(`
    SELECT a.attrelid::int AS oid, a.attnum AS num, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS "notNull", pg_get_expr(ad.adbin, ad.adrelid) AS "default", a.attidentity AS identity,
           a.attgenerated AS generated, col_description(a.attrelid, a.attnum) AS comment,
           (SELECT s.relname FROM pg_depend d JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
             WHERE d.refobjid = a.attrelid AND d.refobjsubid = a.attnum AND d.deptype = 'a' LIMIT 1) AS "ownedSequence"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attrelid, a.attnum`);
  const constraints = await query(`
    SELECT con.conrelid::int AS oid, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition,
           con.conkey AS "columnNums", con.confrelid::int AS "refOid", con.confkey AS "refColumnNums",
           con.confdeltype AS "onDelete", con.conindid::int AS "indexOid"
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND con.contype IN ('p', 'u', 'c', 'f', 'x')
    ORDER BY con.conrelid, CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'x' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, con.conname`);
  const indexes = await query(`
    SELECT i.indrelid::int AS oid, ic.relname AS name, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid AND con.contype IN ('p', 'u', 'x'))
    ORDER BY c.relname, ic.relname`);
  const sequences = await query(`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i', 'e'))
    ORDER BY 1`);
  const functions = await query(`
    SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY 1`);
  const triggers = await query(`
    SELECT t.tgname AS name, c.relname AS "table", pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname`);
  const views = await query(`
    SELECT c.relname AS name, c.relkind AS kind, pg_get_viewdef(c.oid, true) AS definition
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') ORDER BY 1`);
  const hasMigrations = (await query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`))[0].ok;
  const migrations = hasMigrations ? (await query('SELECT filename FROM schema_migrations ORDER BY filename')).map((row) => row.filename) : [];
  const version = (await query('SHOW server_version'))[0].server_version;

  const byOid = new Map(tables.map((table) => [table.oid, { ...table, columns: [], constraints: [], indexes: [], triggers: [] }]));
  for (const column of columns) byOid.get(column.oid)?.columns.push(column);
  for (const constraint of constraints) byOid.get(constraint.oid)?.constraints.push(constraint);
  for (const index of indexes) byOid.get(index.oid)?.indexes.push(index);
  const byName = new Map([...byOid.values()].map((table) => [table.name, table]));
  for (const trigger of triggers) byName.get(trigger.table)?.triggers.push(trigger);
  const columnName = (oid, num) => byOid.get(oid)?.columns.find((column) => column.num === num)?.name ?? `#${num}`;
  for (const table of byOid.values()) {
    for (const constraint of table.constraints) {
      constraint.columns = toArray(constraint.columnNums).map((num) => columnName(table.oid, num));
      if (constraint.type === 'f') {
        constraint.refTable = byOid.get(constraint.refOid)?.name ?? '?';
        constraint.refColumns = toArray(constraint.refColumnNums).map((num) => columnName(constraint.refOid, num));
      }
    }
  }
  return { functions, migrations, sequences, tables: [...byOid.values()], version, views };
}

/**
 * Rows of the configuration tables listed in db-schema-catalog.json → `seed`, as SQL tuples whose every
 * value is a typed literal ('…'::type), built by Postgres itself (quote_nullable) so any type round-trips.
 * Foreign keys to `users` become NULL (the new database has none of those users); `resetColumns` replace
 * runtime state (e.g. the cache-rebuild lease) with a clean start value.
 */
async function loadSeedData(query, schema, seedConfig) {
  const byName = new Map(schema.tables.map((table) => [table.name, table]));
  const result = [];
  for (const name of seedConfig.tables) {
    const table = byName.get(name);
    if (!table) continue;
    const userFkColumns = new Set(table.constraints.filter((item) => item.type === 'f' && item.refTable === 'users').flatMap((item) => item.columns));
    const resets = (seedConfig.resetColumns ?? {})[name] ?? {};
    const columns = table.columns.filter((column) => column.generated !== 's');
    const expressions = columns.map((column) => {
      const cast = `::${column.type}`;
      if (Object.prototype.hasOwnProperty.call(resets, column.name)) {
        const value = resets[column.name];
        return sqlString(value === null ? `NULL${cast}` : `${sqlString(value)}${cast}`);
      }
      if (userFkColumns.has(column.name)) return sqlString(`NULL${cast}`);
      return `quote_nullable(${quoteIdent(column.name)}::text) || ${sqlString(cast)}`;
    });
    const pk = table.constraints.find((item) => item.type === 'p');
    const order = pk ? pk.columns.map(quoteIdent).join(', ') : '1';
    const rows = await query(`SELECT '(' || concat_ws(', ', ${expressions.join(', ')}) || ')' AS tuple FROM ${quoteIdent(name)} ORDER BY ${order}`);
    const serial = columns.find((column) => column.ownedSequence && (column.default || '').startsWith('nextval('));
    result.push({ columns: columns.map((column) => column.name), name, serialColumn: serial?.name ?? null, tuples: rows.map((row) => row.tuple) });
  }
  return result;
}

/** int2[] comes back as a JS array from pg, as "{1,2}" text from some drivers. */
function toArray(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') return value.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  return [];
}

/** pg_get_* output qualifies names with the schema — the install file targets whatever schema is current. */
function unqualify(sql) {
  return sql.replace(/\bpublic\./g, '');
}

// ---------------------------------------------------------------------------------------------
// SQL file
// ---------------------------------------------------------------------------------------------

const SERIAL_OF = { bigint: 'BIGSERIAL', integer: 'SERIAL', smallint: 'SMALLSERIAL' };

function columnSql(column) {
  const serialDefault = column.default && column.ownedSequence && column.default.startsWith(`nextval('`) && SERIAL_OF[column.type];
  const parts = [quoteIdent(column.name), serialDefault ? SERIAL_OF[column.type] : column.type];
  if (column.identity === 'a') parts.push('GENERATED ALWAYS AS IDENTITY');
  else if (column.identity === 'd') parts.push('GENERATED BY DEFAULT AS IDENTITY');
  if (column.generated === 's') parts.push(`GENERATED ALWAYS AS (${unqualify(column.default)}) STORED`);
  else if (column.default && !serialDefault && !column.identity) parts.push(`DEFAULT ${unqualify(column.default)}`);
  if (column.notNull && !serialDefault) parts.push('NOT NULL');
  return parts.join(' ');
}

function quoteIdent(name) {
  return /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

const RESERVED = new Set(['user', 'order', 'group', 'table', 'column', 'default', 'check', 'primary', 'references', 'select', 'where', 'from', 'to', 'limit', 'offset', 'end', 'desc', 'asc', 'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'both', 'case', 'cast', 'collate', 'constraint', 'create', 'current_date', 'current_role', 'current_time', 'current_timestamp', 'current_user', 'deferrable', 'distinct', 'do', 'else', 'except', 'false', 'fetch', 'for', 'foreign', 'grant', 'having', 'in', 'initially', 'intersect', 'into', 'lateral', 'leading', 'localtime', 'localtimestamp', 'not', 'null', 'on', 'only', 'or', 'placing', 'returning', 'session_user', 'some', 'symmetric', 'then', 'trailing', 'true', 'union', 'unique', 'using', 'variadic', 'when', 'window', 'with']);

function buildSql(schema, source, seed = null) {
  const lines = [];
  const add = (...items) => lines.push(...items);
  add(
    '-- =============================================================================================',
    '-- TTM Monitor — tạo CSDL mới (chỉ cấu trúc, KHÔNG có dữ liệu nghiệp vụ)',
    `-- Sinh tự động bởi scripts/db-schema-export.js từ ${source} (PostgreSQL ${schema.version}) lúc ${new Date().toISOString()}.`,
    '-- KHÔNG sửa tay: đổi schema bằng một file mới trong db/migrations/ rồi chạy lại script.',
    '--',
    `-- Gồm: ${schema.tables.length} bảng, ${schema.tables.reduce((n, t) => n + t.indexes.length, 0)} index phụ, ${schema.functions.length} hàm, ${schema.tables.reduce((n, t) => n + t.triggers.length, 0)} trigger${schema.views.length ? `, ${schema.views.length} view` : ''}.`,
    '-- Yêu cầu: PostgreSQL 14 trở lên, một database RỖNG (không dùng cho DB đã có bảng — sẽ báo lỗi và không',
    '-- tạo gì vì cả file chạy trong một transaction). Không cần extension nào.',
    '--',
    '-- Cách chạy:  psql "postgres://USER:PASS@HOST:5432/ttm_tool" -v ON_ERROR_STOP=1 -f ttm-monitor-schema.sql',
    '--             (hoặc mở file trong pgAdmin / DBeaver và chạy toàn bộ).',
    '--',
    '-- Cuối file ghi sẵn tên các migration đã gộp vào cấu trúc này vào bảng schema_migrations — đó là sổ',
    '-- theo dõi, không phải dữ liệu nghiệp vụ: nhờ vậy `node scripts/migrate-db.js --target=local` trên DB mới',
    '-- chỉ chạy những migration phát sinh SAU thời điểm sinh file.',
    '--',
    ...(seed ? [
      '-- Phần 7 (cuối file) là DỮ LIỆU KHỞI TẠO TUỲ CHỌN: cấu hình hiện hành của ' + seed.tables.length + ' bảng cấu hình (ma trận phân quyền,',
      '-- tiêu chí TTM, rule cảnh báo, lịch nghỉ, cấu hình Scoring…) + 1 tài khoản SUPERADMIN ban đầu, để ứng dụng chạy được',
      '-- ngay sau khi tạo DB. Bật / tắt bằng CÔNG TẮC ngay bên dưới. Chi tiết: db/install/README.md.',
    ] : ['-- Dữ liệu danh mục / tài khoản đầu tiên: xem db/install/README.md.']),
    '-- =============================================================================================',
    '',
    'BEGIN;',
    '',
  );
  if (seed) {
    add(
      '-- >>> CÔNG TẮC DỮ LIỆU KHỞI TẠO (phần 7) <<<',
      "--     'on'  = tạo cấu trúc VÀ nạp dữ liệu cấu hình ban đầu + tài khoản SUPERADMIN ban đầu (mặc định)",
      "--     'off' = chỉ tạo cấu trúc (bảng trống) — vd. khi sẽ phục hồi dữ liệu từ môi trường khác ngay sau đó",
      "SELECT set_config('ttm_install.seed_data', 'on', false);",
      '',
    );
  }

  if (schema.sequences.length) {
    add('-- Sequence độc lập (không thuộc cột SERIAL nào)');
    for (const sequence of schema.sequences) add(`CREATE SEQUENCE ${quoteIdent(sequence.name)};`);
    add('');
  }

  add('-- ---------------------------------------------------------------------------------------------', '-- 1. Bảng (cột, khoá chính, UNIQUE, CHECK)', '-- ---------------------------------------------------------------------------------------------', '');
  for (const table of schema.tables) {
    const body = table.columns.map((column) => `    ${columnSql(column)}`);
    for (const constraint of table.constraints.filter((item) => item.type !== 'f')) {
      body.push(`    CONSTRAINT ${quoteIdent(constraint.name)} ${unqualify(constraint.definition)}`);
    }
    add(`CREATE TABLE ${quoteIdent(table.name)} (`, body.join(',\n'), ');', '');
  }

  add('-- ---------------------------------------------------------------------------------------------', '-- 2. Index phụ', '-- ---------------------------------------------------------------------------------------------');
  for (const table of schema.tables) for (const index of table.indexes) add(`${unqualify(index.definition)};`);
  add('');

  add('-- ---------------------------------------------------------------------------------------------', '-- 3. Khoá ngoại', '-- ---------------------------------------------------------------------------------------------');
  for (const table of schema.tables) {
    for (const constraint of table.constraints.filter((item) => item.type === 'f')) {
      add(`ALTER TABLE ${quoteIdent(table.name)} ADD CONSTRAINT ${quoteIdent(constraint.name)} ${unqualify(constraint.definition)};`);
    }
  }
  add('');

  if (schema.views.length) {
    add('-- ---------------------------------------------------------------------------------------------', '-- 4. View', '-- ---------------------------------------------------------------------------------------------');
    for (const view of schema.views) add(`CREATE ${view.kind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW'} ${quoteIdent(view.name)} AS`, `${unqualify(view.definition).trim().replace(/;$/, '')};`, '');
  }

  add('-- ---------------------------------------------------------------------------------------------', '-- 5. Hàm & trigger (đồng bộ bảng PMS, sinh project_code)', '-- ---------------------------------------------------------------------------------------------', '');
  for (const fn of schema.functions) add(`${unqualify(fn.definition).trim()};`, '');
  for (const table of schema.tables) for (const trigger of table.triggers) add(`${unqualify(trigger.definition)};`);
  add('');

  const comments = [];
  for (const table of schema.tables) {
    if (table.comment) comments.push(`COMMENT ON TABLE ${quoteIdent(table.name)} IS ${sqlString(table.comment)};`);
    for (const column of table.columns) if (column.comment) comments.push(`COMMENT ON COLUMN ${quoteIdent(table.name)}.${quoteIdent(column.name)} IS ${sqlString(column.comment)};`);
  }
  if (comments.length) add('-- Chú thích', ...comments, '');

  if (schema.migrations.length) {
    add(
      '-- ---------------------------------------------------------------------------------------------',
      `-- 6. Sổ theo dõi migration — ${schema.migrations.length} migration đã gộp vào cấu trúc trên`,
      '-- ---------------------------------------------------------------------------------------------',
      'INSERT INTO schema_migrations (filename) VALUES',
      schema.migrations.map((name) => `    (${sqlString(name)})`).join(',\n') + ';',
      '',
    );
  }
  if (seed) {
    const on = "current_setting('ttm_install.seed_data', true) = 'on'";
    add(
      '-- ---------------------------------------------------------------------------------------------',
      `-- 7. DỮ LIỆU KHỞI TẠO (tuỳ chọn) — chỉ nạp khi công tắc ttm_install.seed_data = 'on' (đầu file)`,
      `--    Cấu hình hiện hành của CSDL ${source} lúc sinh file; khoá ngoại tới users để NULL. Không gồm dữ liệu`,
      '--    nghiệp vụ (domain, dự án, user, Epic, danh sách Black listed / Từ chối import, banner, API key).',
      '-- ---------------------------------------------------------------------------------------------',
      '',
    );
    for (const table of seed.tables) {
      if (table.tuples.length === 0) { add(`-- ${table.name}: không có dòng nào trên CSDL nguồn.`); continue; }
      const columnList = table.columns.map(quoteIdent).join(', ');
      add(
        `-- ${table.name} (${table.tuples.length} dòng)`,
        `INSERT INTO ${quoteIdent(table.name)} (${columnList})`,
        `SELECT * FROM (VALUES`,
        table.tuples.map((tuple) => `    ${tuple}`).join(',\n'),
        `) AS seed (${columnList})`,
        `WHERE ${on};`,
      );
      if (table.serialColumn) add(`SELECT setval(pg_get_serial_sequence('${table.name}', '${table.serialColumn}'), MAX(${quoteIdent(table.serialColumn)})) FROM ${quoteIdent(table.name)} HAVING MAX(${quoteIdent(table.serialColumn)}) IS NOT NULL;`);
      add('');
    }
    const admin = seed.adminAccount;
    if (admin) {
      add(
        '-- Tài khoản SUPERADMIN ban đầu — username đăng nhập: ' + admin.email.split('@')[0] + ' ; mật khẩu ban đầu ghi ở db/install/README.md.',
        '-- Bắt buộc đổi mật khẩu ở lần đăng nhập đầu (must_change_password = TRUE). Đổi mật khẩu ban đầu: thay mã băm bcrypt dưới đây.',
        'INSERT INTO users (email, full_name, password_hash, role, is_active, must_change_password)',
        `SELECT ${sqlString(admin.email)}, ${sqlString(admin.fullName)}, ${sqlString(admin.passwordHash)}, ${sqlString(admin.role)}, TRUE, TRUE`,
        `WHERE ${on};`,
        '',
      );
    }
  }

  add('COMMIT;', '');
  return lines.join('\n');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------------------------
// Documentation (catalog + ERD)
// ---------------------------------------------------------------------------------------------

function loadCatalog(schema) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const known = new Set(catalog.groups.flatMap((group) => group.tables));
  const present = new Set(schema.tables.map((table) => table.name));
  const groups = catalog.groups
    .map((group) => ({ ...group, tables: group.tables.filter((name) => present.has(name)) }))
    .filter((group) => group.tables.length > 0);
  const others = schema.tables.map((table) => table.name).filter((name) => !known.has(name));
  if (others.length) groups.push({ id: 'other', name: 'Khác (chưa phân nhóm trong db-schema-catalog.json)', fill: '#ffffff', ink: '#475569', tables: others });
  const missing = [...known].filter((name) => !present.has(name));
  return { groups, info: catalog.tables, missing, others };
}

function shortType(type) {
  return type
    .replace(/^character varying\((\d+)\)$/, 'varchar($1)').replace(/^character varying$/, 'varchar')
    .replace(/^character\((\d+)\)$/, 'char($1)').replace(/^timestamp with time zone$/, 'timestamptz')
    .replace(/^timestamp without time zone$/, 'timestamp').replace(/^integer$/, 'int');
}

function tableFacts(table) {
  const pk = table.constraints.find((item) => item.type === 'p');
  const fks = table.constraints.filter((item) => item.type === 'f');
  const uniques = table.constraints.filter((item) => item.type === 'u');
  const fkColumns = new Map();
  for (const fk of fks) fk.columns.forEach((column, index) => fkColumns.set(column, `${fk.refTable}(${fk.refColumns[index]})`));
  const uniqueColumns = new Set(uniques.filter((item) => item.columns.length === 1).map((item) => item.columns[0]));
  return { fkColumns, fks, pk, pkColumns: new Set(pk?.columns ?? []), uniqueColumns, uniques };
}

const ON_DELETE = { a: 'NO ACTION', c: 'CASCADE', d: 'SET DEFAULT', n: 'SET NULL', r: 'RESTRICT' };

function htmlToMarkdown(value) {
  return (value || '')
    .replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<(strong|b)>(.*?)<\/\1>/g, '**$2**').replace(/<(em|i)>(.*?)<\/\1>/g, '*$2*')
    .replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mermaidType(type) {
  return shortType(type).replace(/\(.*\)$/, '').replace(/\[\]$/, '_array').replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildErdMarkdown(schema, catalog, source) {
  const byName = new Map(schema.tables.map((table) => [table.name, table]));
  const fkCount = schema.tables.reduce((n, table) => n + tableFacts(table).fks.length, 0);
  const lines = [
    '# TTM Monitor — ERD & từ điển dữ liệu',
    '',
    `> Sinh tự động bởi \`scripts/db-schema-export.js\` từ ${source} (PostgreSQL ${schema.version}), ${new Date().toISOString().slice(0, 10)}.`,
    '> Không sửa tay: cấu trúc đọc từ CSDL, phần mô tả lấy từ `scripts/db-schema-catalog.json`. File cài đặt tương ứng:',
    '> `db/install/ttm-monitor-schema.sql`. Tài liệu sản phẩm chương 5 dùng cùng nguồn.',
    '',
    `**${schema.tables.length} bảng** trong schema \`public\`, **${fkCount} khoá ngoại**, ${schema.functions.length} hàm, ${schema.tables.reduce((n, t) => n + t.triggers.length, 0)} trigger. `
      + 'Sơ đồ Mermaid hiển thị trực tiếp trên GitHub / GitLab / VS Code (Markdown Preview Mermaid). Ký hiệu: `PK` khoá chính, `FK` khoá ngoại, `UK` duy nhất; '
      + 'quan hệ `||--o{` = một – nhiều (FK bắt buộc), `|o--o{` = không/một – nhiều (FK cho phép NULL), `||--o|` = một – một (FK cũng là khoá chính / duy nhất của bảng con).',
    '',
    '## Mục lục',
    '',
    ...catalog.groups.map((group, index) => `${index + 1}. [${group.name}](#${index + 1}-${slug(group.name)}) — ${group.tables.length} bảng`),
    `${catalog.groups.length + 1}. [Danh sách khoá ngoại](#${catalog.groups.length + 1}-danh-sách-khoá-ngoại)`,
    '',
  ];

  catalog.groups.forEach((group, groupIndex) => {
    const inGroup = new Set(group.tables);
    const external = new Set();
    const relations = [];
    for (const name of group.tables) {
      for (const fk of tableFacts(byName.get(name)).fks) {
        if (!inGroup.has(fk.refTable)) external.add(fk.refTable);
        const child = byName.get(name);
        const nullable = fk.columns.some((column) => !child.columns.find((item) => item.name === column)?.notNull);
        const facts = tableFacts(child);
        const oneToOne = (facts.pk && sameSet(facts.pk.columns, fk.columns)) || facts.uniques.some((item) => sameSet(item.columns, fk.columns));
        relations.push(`    ${fk.refTable} ${oneToOne ? '||--o|' : nullable ? '|o--o{' : '||--o{'} ${name} : "${fk.columns.join(', ')}"`);
      }
    }
    lines.push(`## ${groupIndex + 1}. ${group.name}`, '', '```mermaid', 'erDiagram');
    for (const name of group.tables) lines.push(...mermaidEntity(byName.get(name), false));
    for (const name of [...external].sort()) if (byName.has(name)) lines.push(...mermaidEntity(byName.get(name), true));
    lines.push(...relations, '```', '');
    if (external.size) lines.push(`Bảng tham chiếu ngoài nhóm (chỉ vẽ khoá chính): ${[...external].sort().map((name) => `\`${name}\``).join(', ')}.`, '');

    for (const name of group.tables) {
      const table = byName.get(name);
      const info = catalog.info[name] ?? {};
      const facts = tableFacts(table);
      lines.push(`### \`${name}\``, '', htmlToMarkdown(info.description) || '_(chưa có mô tả trong db-schema-catalog.json)_', '');
      lines.push('| Cột | Kiểu | Null | Mặc định | Khoá | Ghi chú |', '|---|---|---|---|---|---|');
      for (const column of table.columns) {
        const keys = [facts.pkColumns.has(column.name) && 'PK', facts.fkColumns.has(column.name) && `FK → ${facts.fkColumns.get(column.name)}`, facts.uniqueColumns.has(column.name) && 'UK'].filter(Boolean).join(', ');
        const serial = column.ownedSequence && (column.default || '').startsWith('nextval(');
        lines.push(`| \`${column.name}\` | ${shortType(column.type)}${serial ? ' (tự tăng)' : ''} | ${column.notNull ? 'không' : 'có'} | ${serial ? '' : htmlToMarkdown(column.default ?? '')} | ${keys} | ${htmlToMarkdown(info.columns?.[column.name] ?? column.comment ?? '')} |`);
      }
      const extras = [
        ...facts.uniques.filter((item) => item.columns.length > 1).map((item) => `UNIQUE (${item.columns.join(', ')})`),
        ...table.constraints.filter((item) => item.type === 'c').map((item) => `\`${item.name}\`: ${htmlToMarkdown(item.definition)}`),
        ...table.indexes.map((item) => `index \`${item.name}\`: ${htmlToMarkdown(unqualify(item.definition).replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING /, '$1'))}`),
        ...table.triggers.map((item) => `trigger \`${item.name}\``),
      ];
      if (extras.length) lines.push('', ...extras.map((item) => `- ${item}`));
      lines.push('');
    }
  });

  lines.push(`## ${catalog.groups.length + 1}. Danh sách khoá ngoại`, '', '| Bảng con | Cột | Tham chiếu | ON DELETE |', '|---|---|---|---|');
  for (const table of schema.tables) {
    for (const fk of tableFacts(table).fks) lines.push(`| \`${table.name}\` | ${fk.columns.join(', ')} | \`${fk.refTable}\`(${fk.refColumns.join(', ')}) | ${ON_DELETE[fk.onDelete] ?? fk.onDelete} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function mermaidEntity(table, keysOnly) {
  const facts = tableFacts(table);
  const lines = [`    ${table.name} {`];
  for (const column of table.columns) {
    const keys = [facts.pkColumns.has(column.name) && 'PK', facts.fkColumns.has(column.name) && 'FK', facts.uniqueColumns.has(column.name) && 'UK'].filter(Boolean);
    if (keysOnly && !facts.pkColumns.has(column.name)) continue;
    lines.push(`        ${mermaidType(column.type)} ${column.name}${keys.length ? ` ${keys.join(', ')}` : ''}`);
  }
  lines.push('    }');
  return lines;
}

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function slug(value) {
  return value.toLowerCase().replace(/[&(),.—–]/g, '').trim().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------------------------
// Product guide (chapter 5)
// ---------------------------------------------------------------------------------------------

function buildGuideHtml(schema, catalog, source) {
  const byName = new Map(schema.tables.map((table) => [table.name, table]));
  const groupOf = new Map(catalog.groups.flatMap((group) => group.tables.map((name) => [name, group])));
  const fkTotal = schema.tables.reduce((n, table) => n + tableFacts(table).fks.length, 0);
  const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
  const out = [];
  out.push(
    '      <p>',
    `        Cơ sở dữ liệu của TTM Monitor dùng <strong>PostgreSQL</strong> (đang chạy ${escapeHtml(schema.version.split(' ')[0])}), gồm <strong>${schema.tables.length} bảng</strong> trong schema <code>public</code>,`,
    `        <strong>${fkTotal} khoá ngoại</strong>, ${schema.functions.length} hàm và ${schema.tables.reduce((n, t) => n + t.triggers.length, 0)} trigger; không dùng view, extension hay Row Level Security.`,
    '        Cấu trúc thay đổi duy nhất qua chuỗi migration <code>db/migrations/*.sql</code> (chạy bằng <code>scripts/migrate-db.js</code>, ghi vào <code>schema_migrations</code>).',
    `        Toàn bộ chương này được sinh từ CSDL ${escapeHtml(source)} ngày ${today} bởi <code>scripts/db-schema-export.js</code> — cùng lần chạy sinh ra`,
    '        file tạo CSDL mới <code>db/install/ttm-monitor-schema.sql</code> (chỉ cấu trúc, không dữ liệu) và tài liệu ERD chi tiết <code>docs/database-erd.md</code> (sơ đồ Mermaid từng nhóm + từ điển dữ liệu).',
    '      </p>',
    '',
    '      <h3>5.1. Sơ đồ thực thể CSDL (ERD Overview)</h3>',
    `      <p>${catalog.groups.length} nhóm nghiệp vụ; mỗi ô liệt kê bảng của nhóm, dòng cuối là các nhóm mà bảng trong ô tham chiếu tới qua khoá ngoại. Sơ đồ quan hệ chi tiết từng bảng (cột, PK/FK, bản số) ở <code>docs/database-erd.md</code>; danh sách đầy đủ khoá ngoại ở cuối mục 5.2.</p>`,
    buildOverviewSvg(schema, catalog, byName, groupOf),
    '',
    `      <h3>5.2. Danh mục ${schema.tables.length} bảng CSDL (đối chiếu CSDL ${escapeHtml(source)} ${today})</h3>`,
    '      <table>',
    '        <thead><tr><th>STT</th><th>Bảng CSDL</th><th>Nhóm</th><th>Khoá chính / Khoá ngoại</th><th>Vai trò nghiệp vụ &amp; Ghi chú</th></tr></thead>',
    '        <tbody>',
  );
  let index = 0;
  for (const group of catalog.groups) {
    for (const name of group.tables) {
      index += 1;
      const facts = tableFacts(byName.get(name));
      const keys = [
        facts.pk ? `<code>${escapeHtml(facts.pk.columns.length > 1 ? `(${facts.pk.columns.join(', ')})` : facts.pk.columns[0])}</code> (PK)` : 'không có PK',
        ...facts.fks.map((fk) => `<code>${escapeHtml(fk.columns.join(', '))}</code> → <code>${escapeHtml(fk.refTable)}</code>`),
      ].join('<br>');
      out.push(`          <tr><td>${index}</td><td><code>${name}</code></td><td>${escapeHtml(group.name)}</td><td>${keys}</td><td>${catalog.info[name]?.description ?? ''}</td></tr>`);
    }
  }
  out.push('        </tbody>', '      </table>', '');

  out.push(
    '      <details style="margin: 16px 0; border: 1px solid #cdd9f7; border-radius: 10px; background: #f8faff; padding: 12px 16px;">',
    '        <summary style="cursor: pointer; font-weight: 700; font-size: 13.5px; color: var(--brand-600); outline: none; user-select: none;">',
    `          🔍 Bấm vào đây để xem chi tiết cột, kiểu dữ liệu, khoá PK/FK, ràng buộc &amp; index của ${schema.tables.length} bảng`,
    '        </summary>',
    '        <div style="margin-top: 16px;">',
  );
  catalog.groups.forEach((group, groupIndex) => {
    out.push(`          <h4 style="color:var(--brand-700); margin:16px 0 6px; font-size:14px;">${groupIndex + 1}. ${escapeHtml(group.name)} (${group.tables.length} bảng)</h4>`);
    group.tables.forEach((name, tableIndex) => {
      const table = byName.get(name);
      const facts = tableFacts(table);
      const notes = catalog.info[name]?.columns ?? {};
      out.push(
        `          <p><strong>${groupIndex + 1}.${tableIndex + 1}. <code>${name}</code></strong></p>`,
        '          <table>',
        '            <thead><tr><th>Cột</th><th>Kiểu dữ liệu</th><th>Khoá / Ràng buộc</th><th>Ghi chú</th></tr></thead>',
        '            <tbody>',
      );
      for (const column of table.columns) {
        const serial = column.ownedSequence && (column.default || '').startsWith('nextval(');
        const type = `${serial ? (SERIAL_OF[column.type] ?? column.type) : shortType(column.type).toUpperCase()}${column.notNull && !serial ? ' NOT NULL' : ''}`;
        const keys = [
          facts.pkColumns.has(column.name) && 'PRIMARY KEY',
          facts.fkColumns.has(column.name) && `FK → ${facts.fkColumns.get(column.name)}`,
          facts.uniqueColumns.has(column.name) && 'UNIQUE',
          !serial && column.default && `DEFAULT ${unqualify(column.default)}`,
        ].filter(Boolean).map(escapeHtml).join('<br>') || '—';
        out.push(`              <tr><td><code>${column.name}</code></td><td><code>${escapeHtml(type)}</code></td><td>${keys}</td><td>${notes[column.name] ?? escapeHtml(column.comment ?? '')}</td></tr>`);
      }
      out.push('            </tbody>', '          </table>');
      const extras = [
        ...facts.uniques.filter((item) => item.columns.length > 1).map((item) => `UNIQUE <code>(${escapeHtml(item.columns.join(', '))})</code>`),
        ...table.constraints.filter((item) => item.type === 'c').map((item) => `<code>${escapeHtml(item.definition)}</code>`),
        ...table.indexes.map((item) => `Index <code>${escapeHtml(item.name)}</code>: <code>${escapeHtml(unqualify(item.definition).replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING /, '$1'))}</code>`),
        ...table.triggers.map((item) => `Trigger <code>${escapeHtml(item.name)}</code>`),
      ];
      if (extras.length) out.push(`          <ul style="font-size:12px; margin:4px 0 12px;">${extras.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    });
  });
  out.push('        </div>', '      </details>', '');

  out.push(
    `      <p><strong>Danh sách ${fkTotal} khoá ngoại</strong> (bảng con → bảng cha):</p>`,
    '      <table>',
    '        <thead><tr><th>Bảng con</th><th>Cột</th><th>Tham chiếu</th><th>ON DELETE</th></tr></thead>',
    '        <tbody>',
  );
  for (const table of schema.tables) {
    for (const fk of tableFacts(table).fks) out.push(`          <tr><td><code>${table.name}</code></td><td><code>${escapeHtml(fk.columns.join(', '))}</code></td><td><code>${fk.refTable}(${escapeHtml(fk.refColumns.join(', '))})</code></td><td>${ON_DELETE[fk.onDelete] ?? fk.onDelete}</td></tr>`);
  }
  out.push('        </tbody>', '      </table>', '');
  return out.join('\n');
}

/** Group boxes in a 3-column grid — table names wrapped inside, then the groups they reference. */
function buildOverviewSvg(schema, catalog, byName, groupOf) {
  const columns = 3;
  const boxWidth = 290;
  const gap = 16;
  const lineHeight = 13;
  const wrap = (names, width) => {
    const rows = [];
    let current = '';
    for (const name of names) {
      const next = current ? `${current}, ${name}` : name;
      if (next.length * 5.4 > width && current) { rows.push(`${current},`); current = name; } else current = next;
    }
    if (current) rows.push(current);
    return rows;
  };
  const boxes = catalog.groups.map((group, index) => {
    const refs = new Set();
    for (const name of group.tables) for (const fk of tableFacts(byName.get(name)).fks) {
      const target = groupOf.get(fk.refTable);
      if (target && target.id !== group.id) refs.add(catalog.groups.indexOf(target) + 1);
    }
    const rows = wrap(group.tables, boxWidth - 24);
    const refRow = refs.size ? `→ tham chiếu nhóm ${[...refs].sort((a, b) => a - b).join(', ')}` : '→ không tham chiếu nhóm khác';
    return { group, index, refRow, rows, height: 34 + rows.length * lineHeight + 20 };
  });
  const rowHeights = [];
  boxes.forEach((box, i) => { const r = Math.floor(i / columns); rowHeights[r] = Math.max(rowHeights[r] ?? 0, box.height); });
  const totalHeight = rowHeights.reduce((sum, h) => sum + h + gap, gap);
  const totalWidth = columns * boxWidth + (columns + 1) * gap;
  const parts = [`      <svg viewBox="0 0 ${totalWidth} ${totalHeight}" role="img" aria-label="Sơ đồ nhóm bảng CSDL TTM Monitor" style="width:100%; height:auto;">`, '        <g font-size="11" fill="#1f2430">'];
  boxes.forEach((box, i) => {
    const r = Math.floor(i / columns);
    const x = gap + (i % columns) * (boxWidth + gap);
    const y = gap + rowHeights.slice(0, r).reduce((sum, h) => sum + h + gap, 0);
    const cx = x + boxWidth / 2;
    parts.push(
      `          <rect x="${x}" y="${y}" width="${boxWidth}" height="${rowHeights[r]}" rx="8" fill="${box.group.fill}" stroke="#c3cce3" />`,
      `          <text x="${cx}" y="${y + 20}" text-anchor="middle" font-weight="700" font-size="12" fill="${box.group.ink}">${box.index + 1}. ${escapeHtml(box.group.name)} (${box.group.tables.length})</text>`,
      ...box.rows.map((row, k) => `          <text x="${cx}" y="${y + 38 + k * lineHeight}" text-anchor="middle" font-size="9.5" fill="#5b6475">${escapeHtml(row)}</text>`),
      `          <text x="${cx}" y="${y + 38 + box.rows.length * lineHeight + 4}" text-anchor="middle" font-size="9" font-style="italic" fill="#8a93a6">${escapeHtml(box.refRow)}</text>`,
    );
  });
  parts.push('        </g>', '      </svg>');
  return parts.join('\n');
}

function spliceGuide(fragment) {
  const html = fs.readFileSync(GUIDE, 'utf8');
  const begin = html.indexOf(GUIDE_BEGIN);
  const end = html.indexOf(GUIDE_END);
  if (begin < 0 || end < begin) throw new Error(`Không thấy cặp marker ${GUIDE_BEGIN} / ${GUIDE_END} trong ${GUIDE}.`);
  const next = `${html.slice(0, begin + GUIDE_BEGIN.length)}\n${fragment}\n      ${html.slice(end)}`;
  fs.writeFileSync(GUIDE, next);
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function poolConfig(target) {
  const strip = (value) => value.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  if (target === 'supabase') {
    if (!process.env.DATABASE_URL_SUPABASE) throw new Error('Thiếu DATABASE_URL_SUPABASE trong .env.local.');
    return { connectionString: strip(process.env.DATABASE_URL_SUPABASE), max: 1, ssl: { rejectUnauthorized: false } };
  }
  if (process.env.DATABASE_URL_LOCAL) return { connectionString: process.env.DATABASE_URL_LOCAL, max: 1 };
  return { database: process.env.PGDATABASE, host: process.env.PGHOST, max: 1, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER };
}

async function main() {
  const { loadEnvConfig } = require('@next/env');
  const { Pool } = require('pg');
  loadEnvConfig(ROOT);
  const args = process.argv.slice(2);
  const targetArg = args.find((arg) => arg.startsWith('--target='));
  const target = (targetArg ? targetArg.split('=')[1] : process.env.DB_CONNECTION || 'local').trim().toLowerCase();
  if (target !== 'local' && target !== 'supabase') throw new Error('--target phải là local hoặc supabase.');
  const pool = new Pool(poolConfig(target));
  const seedConfig = JSON.parse(fs.readFileSync(CATALOG, 'utf8')).seed;
  let schema;
  let seed = null;
  try {
    const query = async (sql) => (await pool.query(sql)).rows;
    schema = await introspect(query);
    if (seedConfig && !args.includes('--no-seed')) seed = { adminAccount: seedConfig.adminAccount, tables: await loadSeedData(query, schema, seedConfig) };
  } finally {
    await pool.end();
  }
  const source = target === 'supabase' ? 'Supabase' : 'local';
  const sqlOnly = args.includes('--sql-only');
  const docsOnly = args.includes('--docs-only');
  if (!docsOnly) {
    fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true });
    fs.writeFileSync(SQL_OUT, buildSql(schema, source, seed));
    console.log(`Đã ghi ${path.relative(ROOT, SQL_OUT)} (${schema.tables.length} bảng, ${schema.migrations.length} migration${seed ? `, dữ liệu khởi tạo ${seed.tables.reduce((n, t) => n + t.tuples.length, 0)} dòng / ${seed.tables.length} bảng + 1 SUPERADMIN` : ''}).`);
  }
  if (!sqlOnly) {
    const catalog = loadCatalog(schema);
    fs.mkdirSync(path.dirname(ERD_OUT), { recursive: true });
    fs.writeFileSync(ERD_OUT, buildErdMarkdown(schema, catalog, source));
    spliceGuide(buildGuideHtml(schema, catalog, source));
    console.log(`Đã ghi ${path.relative(ROOT, ERD_OUT)} và chương 5 của ${path.relative(ROOT, GUIDE)}.`);
    if (catalog.others.length) console.warn(`Bảng chưa phân nhóm (thêm vào scripts/db-schema-catalog.json): ${catalog.others.join(', ')}`);
    if (catalog.missing.length) console.warn(`Bảng có trong catalog nhưng không còn trên CSDL: ${catalog.missing.join(', ')}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Xuất schema thất bại:', error.message);
    process.exit(1);
  });
}

module.exports = { buildSql, introspect, loadSeedData };
