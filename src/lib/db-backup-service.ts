import pool, { getClient } from '@/lib/db';
import type { BackupTableInfo, ImportResult, ImportTableResult } from '@/lib/db-backup-types';

export const EXPORT_SIGNATURE = '-- TTM_MONITOR_SQL_EXPORT v1';
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_STATEMENTS = 200_000;

// Allowlist of business tables that can be exported/imported. Session/reset-token
// tables are intentionally excluded — they are ephemeral and meaningless to restore.
export const EXPORTABLE_TABLES: { label: string; tableName: string }[] = [
  { label: 'Người dùng (users)', tableName: 'users' },
  { label: 'Domain nghiệp vụ', tableName: 'domains' },
  { label: 'Dự án', tableName: 'projects' },
  { label: 'User ↔ Domain', tableName: 'user_domains' },
  { label: 'User ↔ Dự án (PM/SM)', tableName: 'user_projects' },
  { label: 'Component dự án', tableName: 'project_components' },
  { label: 'Holiday', tableName: 'holidays' },
  { label: 'Cấu hình cảnh báo Status', tableName: 'epic_status_alert_rules' },
  { label: 'Đợt import dữ liệu', tableName: 'import_batches' },
  { label: 'Dòng dữ liệu import (raw)', tableName: 'import_rows' },
  { label: 'Issues (Epic/Story/Subtask)', tableName: 'issues' },
  { label: 'Epic TTM Snapshot (lịch sử tổng hợp)', tableName: 'epic_ttm_snapshots' },
  { label: 'Audit log', tableName: 'audit_logs' },
];

const ALLOWED_TABLE_NAMES = new Set(EXPORTABLE_TABLES.map((table) => table.tableName));

function assertAllowedTable(tableName: string): void {
  if (!ALLOWED_TABLE_NAMES.has(tableName)) throw new Error(`Bảng "${tableName}" không nằm trong danh sách cho phép export/import.`);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isTemporalType(dataType: string): boolean {
  return dataType === 'date' || dataType.startsWith('timestamp') || dataType.startsWith('time');
}

/** Builds the `{elem1,elem2,...}` Postgres array-literal body, quoting elements that need it (per array-literal syntax, not SQL string syntax — that escaping is applied by the caller). */
function formatPgArrayLiteral(values: unknown[]): string {
  const elements = values.map((item) => {
    if (item === null || item === undefined) return 'NULL';
    const str = String(item);
    const needsQuoting = str === '' || str.toUpperCase() === 'NULL' || /[,\s"\\{}]/.test(str);
    if (!needsQuoting) return str;
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  return `{${elements.join(',')}}`;
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  // Dates are selected as ::text upstream (see isTemporalType), so this only guards against
  // a driver returning a Date object unexpectedly rather than being the normal code path.
  if (value instanceof Date) return `'${value.toISOString()}'`;
  // Array columns (e.g. issues.epic_stories) come back from node-pg as real JS arrays — without
  // this branch they fell into the plain-string case below, where String(array) joins elements
  // with bare commas and no braces, producing a value Postgres rejects as a malformed array
  // literal on re-import.
  if (Array.isArray(value)) return `'${formatPgArrayLiteral(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function listBackupTables(): Promise<BackupTableInfo[]> {
  const results = await Promise.all(EXPORTABLE_TABLES.map(async (table) => {
    const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteIdent(table.tableName)};`);
    return { approxRowCount: Number(result.rows[0]?.count ?? 0), label: table.label, tableName: table.tableName };
  }));
  return results;
}

interface ColumnInfo {
  columnDefault: string | null;
  columnName: string;
  dataType: string;
  fullType: string;
  isNullable: boolean;
}

// information_schema.columns.data_type reports every array column as the bare string 'ARRAY' —
// no element type, no dimension — which isn't valid standalone SQL (hence "syntax error at or
// near ARRAY" when that string was used as-is in a CREATE TABLE). udt_name carries the actual
// element type instead, prefixed with an underscore (Postgres' internal array-type naming, e.g.
// '_text' for text[]); map the ones this schema actually uses back to a real SQL type name.
const ARRAY_ELEMENT_SQL_TYPES: Record<string, string> = {
  _bool: 'BOOLEAN',
  _date: 'DATE',
  _int4: 'INTEGER',
  _int8: 'BIGINT',
  _numeric: 'NUMERIC',
  _text: 'TEXT',
  _timestamptz: 'TIMESTAMPTZ',
  _varchar: 'VARCHAR',
};

async function getColumns(tableName: string): Promise<ColumnInfo[]> {
  const result = await pool.query<{
    characterMaximumLength: number | null;
    columnDefault: string | null;
    columnName: string;
    dataType: string;
    isNullable: string;
    numericPrecision: number | null;
    numericScale: number | null;
    udtName: string;
  }>(`
    SELECT column_name AS "columnName", data_type AS "dataType", is_nullable AS "isNullable",
      column_default AS "columnDefault", character_maximum_length AS "characterMaximumLength",
      numeric_precision AS "numericPrecision", numeric_scale AS "numericScale", udt_name AS "udtName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);

  return result.rows.map((row) => {
    let fullType = row.dataType;
    if (row.dataType === 'ARRAY') fullType = `${ARRAY_ELEMENT_SQL_TYPES[row.udtName] ?? row.udtName.replace(/^_/, '').toUpperCase()}[]`;
    else if (row.dataType === 'character varying' && row.characterMaximumLength) fullType = `VARCHAR(${row.characterMaximumLength})`;
    else if (row.dataType === 'character' && row.characterMaximumLength) fullType = `CHAR(${row.characterMaximumLength})`;
    else if (row.dataType === 'numeric' && row.numericPrecision) fullType = `NUMERIC(${row.numericPrecision}${row.numericScale ? `,${row.numericScale}` : ''})`;
    else if (row.dataType === 'timestamp with time zone') fullType = 'TIMESTAMPTZ';
    else if (row.dataType === 'integer') fullType = 'INTEGER';
    else if (row.dataType === 'boolean') fullType = 'BOOLEAN';
    else if (row.dataType === 'text') fullType = 'TEXT';
    else if (row.dataType === 'date') fullType = 'DATE';
    return {
      columnDefault: row.columnDefault,
      columnName: row.columnName,
      dataType: row.dataType,
      fullType,
      isNullable: row.isNullable === 'YES',
    };
  });
}

async function getPrimaryKeyColumns(tableName: string): Promise<string[]> {
  const result = await pool.query<{ columnName: string }>(`
    SELECT kcu.column_name AS "columnName"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position;
  `, [tableName]);
  return result.rows.map((row) => row.columnName);
}

/**
 * Best-effort structural export (columns + primary key only, no foreign keys/checks).
 * Meant for spinning up a fresh empty database, not as a replacement for db/migrations.
 * Always generated as CREATE TABLE IF NOT EXISTS so re-running it against an existing
 * database is a no-op rather than a schema-destroying operation.
 */
async function buildCreateTableStatement(tableName: string): Promise<string> {
  const [columns, primaryKeyColumns] = await Promise.all([getColumns(tableName), getPrimaryKeyColumns(tableName)]);
  const columnLines = columns.map((column) => {
    const parts = [quoteIdent(column.columnName), column.fullType];
    if (!column.isNullable) parts.push('NOT NULL');
    if (column.columnDefault && !column.columnDefault.startsWith('nextval(')) parts.push(`DEFAULT ${column.columnDefault}`);
    return `  ${parts.join(' ')}`;
  });
  if (primaryKeyColumns.length > 0) columnLines.push(`  PRIMARY KEY (${primaryKeyColumns.map(quoteIdent).join(', ')})`);
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n${columnLines.join(',\n')}\n);`;
}

/**
 * Conflict clause for one table's exported INSERTs — an upsert keyed on the table's own primary
 * key: a row whose PK matches an existing one on import OVERWRITES it with the file's data (every
 * other column set to EXCLUDED.<col>), rather than being silently skipped. This is what makes
 * re-importing an export of `users`/`domains`/etc. actually pick up detail-field edits (name,
 * role, dates, …) instead of a no-op whenever the PK already exists on the target DB. Every
 * exportable table has a real PRIMARY KEY (verified against schema.sql — SERIAL id, or a composite
 * key for join tables like user_domains), so the "no PK" fallback below is only a defensive guard.
 */
function buildConflictClause(tableName: string, columnNames: string[], primaryKeyColumns: string[]): string {
  if (primaryKeyColumns.length === 0) return 'ON CONFLICT DO NOTHING';
  const conflictTarget = primaryKeyColumns.map(quoteIdent).join(', ');
  const updatableColumns = columnNames.filter((name) => !primaryKeyColumns.includes(name));
  if (updatableColumns.length === 0) return `ON CONFLICT (${conflictTarget}) DO NOTHING`;
  const setClause = updatableColumns.map((name) => `${quoteIdent(name)} = EXCLUDED.${quoteIdent(name)}`).join(', ');
  return `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${setClause}`;
}

export async function exportTablesToSql(tableNames: string[], includeSchema: boolean): Promise<string> {
  const uniqueTableNames = [...new Set(tableNames)];
  if (uniqueTableNames.length === 0) throw new Error('Vui lòng chọn ít nhất một bảng để export.');
  for (const tableName of uniqueTableNames) assertAllowedTable(tableName);

  const lines: string[] = [
    EXPORT_SIGNATURE,
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Tables: ${uniqueTableNames.join(', ')}`,
    `-- Includes schema: ${includeSchema ? 'yes (CREATE TABLE IF NOT EXISTS, columns + primary key only)' : 'no (data only)'}`,
    '-- Import behavior: rows whose primary key already exists on the target DB are OVERWRITTEN (upsert), not skipped.',
    '',
  ];

  for (const tableName of uniqueTableNames) {
    lines.push(`-- Table: ${tableName}`);
    if (includeSchema) {
      lines.push(await buildCreateTableStatement(tableName));
      lines.push('');
    }

    const [columns, primaryKeyColumns] = await Promise.all([getColumns(tableName), getPrimaryKeyColumns(tableName)]);
    const columnNames = columns.map((column) => column.columnName);
    const quotedColumns = columnNames.map(quoteIdent).join(', ');
    const conflictClause = buildConflictClause(tableName, columnNames, primaryKeyColumns);
    // Date/timestamp columns are selected as ::text so node-postgres never round-trips them
    // through a JS Date (which would shift the calendar date by the server's UTC offset).
    const selectList = columns
      .map((column) => (isTemporalType(column.dataType) ? `${quoteIdent(column.columnName)}::text AS ${quoteIdent(column.columnName)}` : quoteIdent(column.columnName)))
      .join(', ');
    const result = await pool.query(`SELECT ${selectList} FROM ${quoteIdent(tableName)} ORDER BY 1;`);

    for (const row of result.rows) {
      const values = columnNames.map((columnName) => formatSqlValue((row as Record<string, unknown>)[columnName]));
      lines.push(`INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES (${values.join(', ')}) ${conflictClause};`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

interface ParsedStatement {
  /** Only set for type INSERT — the column list exactly as written, e.g. `"id", "email"`. Every
   * INSERT statement for one table shares an identical column list (exportTablesToSql always
   * writes the same list for a table), which is what makes batching them together below safe. */
  columns?: string;
  /** Only set for type INSERT — the ON CONFLICT clause exactly as written, e.g.
   * `ON CONFLICT ("id") DO UPDATE SET "email" = EXCLUDED."email", ...` (current exports, an
   * upsert) or `ON CONFLICT DO NOTHING` (files exported before upsert existed — kept accepted for
   * backward compatibility). Every INSERT for one table shares the same clause. */
  conflictClause?: string;
  statement: string;
  tableName: string;
  type: 'CREATE_TABLE' | 'INSERT';
  /** Only set for type INSERT — the VALUES(...) tuple's inner content, e.g. `1, 'a@b.com'`. */
  valuesTuple?: string;
}

/** Accepts exactly the two shapes exportTablesToSql can produce (current upsert-by-PK form, and
 * the pre-upsert DO NOTHING form for older export files) — never arbitrary ON CONFLICT text, so a
 * hand-edited file can't smuggle extra SQL into the batched INSERT this clause gets spliced into. */
function isAllowedConflictClause(clause: string): boolean {
  return /^ON CONFLICT DO NOTHING$/i.test(clause)
    || /^ON CONFLICT \([^()]+\) DO NOTHING$/i.test(clause)
    || /^ON CONFLICT \([^()]+\) DO UPDATE SET (?:"[a-zA-Z0-9_]+" = EXCLUDED\."[a-zA-Z0-9_]+"(?:, )?)+$/i.test(clause);
}

/** Quote-aware statement splitter: only splits on `;` outside single-quoted strings, and drops `--` line comments. */
function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i];
    if (!inString && char === '-' && sqlText[i + 1] === '-') {
      const newlineIndex = sqlText.indexOf('\n', i);
      i = newlineIndex === -1 ? sqlText.length : newlineIndex;
      continue;
    }
    if (char === "'") {
      if (inString && sqlText[i + 1] === "'") {
        // Escaped quote ('') inside a string literal — consume both characters, stay in-string.
        current += "''";
        i += 1;
        continue;
      }
      inString = !inString;
      current += char;
      continue;
    }
    if (!inString && char === ';') {
      statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

function parseImportFile(sqlText: string): { error: string } | { statements: ParsedStatement[] } {
  if (sqlText.length > MAX_IMPORT_BYTES) return { error: `File vượt quá giới hạn ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.` };
  if (!sqlText.slice(0, 500).includes(EXPORT_SIGNATURE)) {
    return { error: 'File không đúng định dạng. Chỉ chấp nhận file được tạo bởi chức năng Export dữ liệu của TTM Monitor.' };
  }

  const rawStatements = splitSqlStatements(sqlText);
  if (rawStatements.length > MAX_IMPORT_STATEMENTS) return { error: `File có quá nhiều câu lệnh (giới hạn ${MAX_IMPORT_STATEMENTS}).` };

  const statements: ParsedStatement[] = [];
  for (const statement of rawStatements) {
    const createMatch = statement.match(/^CREATE TABLE IF NOT EXISTS "([a-zA-Z0-9_]+)"/i);
    if (createMatch) {
      const tableName = createMatch[1];
      if (!ALLOWED_TABLE_NAMES.has(tableName)) return { error: `Bảng "${tableName}" trong file không được phép import.` };
      statements.push({ statement, tableName, type: 'CREATE_TABLE' });
      continue;
    }
    const insertMatch = statement.match(/^INSERT INTO "([a-zA-Z0-9_]+)"/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      if (!ALLOWED_TABLE_NAMES.has(tableName)) return { error: `Bảng "${tableName}" trong file không được phép import.` };
      // Also captures columns/valuesTuple/conflictClause so importSqlFile can batch many rows into
      // one multi-row INSERT instead of one round trip per row — every statement this app's own
      // export produces matches this exact shape, so a mismatch here means a hand-edited/foreign file.
      const shapeMatch = statement.match(/^INSERT INTO "[a-zA-Z0-9_]+" \(([^)]*)\) VALUES \(([\s\S]*)\) (ON CONFLICT[\s\S]*)$/i);
      if (!shapeMatch) return { error: 'File chứa câu lệnh INSERT không đúng định dạng export chuẩn (thiếu mệnh đề ON CONFLICT).' };
      const conflictClause = shapeMatch[3].trim();
      if (!isAllowedConflictClause(conflictClause)) return { error: 'File chứa câu lệnh INSERT có mệnh đề ON CONFLICT không hợp lệ.' };
      statements.push({ columns: shapeMatch[1], conflictClause, statement, tableName, type: 'INSERT', valuesTuple: shapeMatch[2] });
      continue;
    }
    return { error: `File chứa câu lệnh không được hỗ trợ: "${statement.slice(0, 80)}..."` };
  }

  return { statements };
}

export interface ImportPreview {
  createsSchemaFor: string[];
  tableCounts: { insertCount: number; tableName: string }[];
}

export function previewImportFile(sqlText: string): { error: string } | { preview: ImportPreview } {
  const parsed = parseImportFile(sqlText);
  if ('error' in parsed) return parsed;

  const insertCountByTable = new Map<string, number>();
  const createsSchemaFor = new Set<string>();
  for (const item of parsed.statements) {
    if (item.type === 'CREATE_TABLE') createsSchemaFor.add(item.tableName);
    else insertCountByTable.set(item.tableName, (insertCountByTable.get(item.tableName) ?? 0) + 1);
  }

  return {
    preview: {
      createsSchemaFor: [...createsSchemaFor],
      tableCounts: [...insertCountByTable.entries()].map(([tableName, insertCount]) => ({ insertCount, tableName })),
    },
  };
}

/**
 * @param selectedTables When provided, only these tables' INSERT statements are executed — every
 * other table found in the file has its data silently skipped (the import preview's per-table
 * checkboxes — "Bảng nào không được checked thì sẽ không import dữ liệu"). CREATE TABLE statements
 * are unaffected by this filter and always run for every table present in the file regardless —
 * the checkbox is documented and scoped to data only, and CREATE TABLE IF NOT EXISTS is harmless
 * either way. Omit (or pass null/undefined) to import every table's data, unchanged from before
 * this parameter existed — callers other than the admin UI (if any future ones use this function
 * directly) keep working with no changes.
 */
export async function importSqlFile(sqlText: string, selectedTables?: Set<string> | null): Promise<ImportResult> {
  const parsed = parseImportFile(sqlText);
  if ('error' in parsed) return { ok: false, tables: [{ error: parsed.error, inserted: 0, skippedDuplicates: 0, tableName: '(file)', updated: 0 }] };

  const allTouchedTables = [...new Set(parsed.statements.map((item) => item.tableName))];
  const insertTables = selectedTables ? allTouchedTables.filter((tableName) => selectedTables.has(tableName)) : allTouchedTables;
  const resultByTable = new Map<string, ImportTableResult>();
  for (const tableName of insertTables) resultByTable.set(tableName, { error: null, inserted: 0, skippedDuplicates: 0, tableName, updated: 0 });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Disable FK/trigger enforcement for the duration of the load so cross-table and
    // self-referential foreign keys (e.g. issues.parent_id -> issues.id) never block on
    // insert order; triggers are re-enabled (without retroactive validation) before commit.
    for (const tableName of insertTables) await client.query(`ALTER TABLE ${quoteIdent(tableName)} DISABLE TRIGGER ALL;`);

    for (const item of parsed.statements.filter((statement) => statement.type === 'CREATE_TABLE')) {
      await client.query(item.statement);
    }

    // Batched instead of one round trip per row — same fix, same reasoning, as processImport()'s
    // CSV path (src/lib/import-service.ts): a real export can be tens of thousands of INSERT
    // statements, and awaiting them one at a time turned into a multi-minute request that timed
    // out in production. Grouped per table (every INSERT for one table shares the exact same
    // column list AND conflict clause, guaranteed by exportTablesToSql — see ParsedStatement's
    // comments) and chunked to stay well under Postgres's 65535-bound-parameter limit; unlike the
    // CSV path this needs no parameters at all (values are already-formatted SQL literals from the
    // export, not JS values), so the only cap that matters is statement length, not parameter count.
    // `RETURNING (xmax = 0)` distinguishes a freshly-inserted row (xmax = 0) from one that hit the
    // ON CONFLICT DO UPDATE path (xmax set by the update) — that's how "inserted" vs "updated" (an
    // existing PK overwritten with the file's data) are told apart. A DO NOTHING clause (older
    // export files) never returns a row for the ones it skips at all, so those still fall out of
    // `chunk.length - (returned rows)` into skippedDuplicates, exactly as before upsert existed.
    const INSERT_BATCH_CHUNK_SIZE = 500;
    for (const tableName of insertTables) {
      const insertsForTable = parsed.statements.filter((statement) => statement.type === 'INSERT' && statement.tableName === tableName);
      if (insertsForTable.length === 0) continue;
      const tableResult = resultByTable.get(tableName)!;
      const columns = insertsForTable[0].columns!;
      const conflictClause = insertsForTable[0].conflictClause!;
      for (let chunkStart = 0; chunkStart < insertsForTable.length; chunkStart += INSERT_BATCH_CHUNK_SIZE) {
        const chunk = insertsForTable.slice(chunkStart, chunkStart + INSERT_BATCH_CHUNK_SIZE);
        const tuples = chunk.map((item) => `(${item.valuesTuple})`).join(', ');
        const result = await client.query<{ isNewRow: boolean }>(
          `INSERT INTO ${quoteIdent(tableName)} (${columns}) VALUES ${tuples} ${conflictClause} RETURNING (xmax = 0) AS "isNewRow";`,
        );
        const insertedCount = result.rows.filter((row) => row.isNewRow).length;
        tableResult.inserted += insertedCount;
        tableResult.updated += result.rows.length - insertedCount;
        tableResult.skippedDuplicates += chunk.length - result.rows.length;
      }
    }

    for (const tableName of insertTables) await client.query(`ALTER TABLE ${quoteIdent(tableName)} ENABLE TRIGGER ALL;`);

    for (const tableName of insertTables) {
      // pg_get_serial_sequence() throws (not just returns NULL) when the table has no "id" column
      // at all — true for join tables with a composite key (user_domains, user_projects) — so
      // check column existence first instead of letting that abort the whole import transaction.
      const hasIdColumn = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id') AS exists;`,
        [tableName],
      );
      if (!hasIdColumn.rows[0]?.exists) continue;
      const sequenceResult = await client.query<{ sequenceName: string | null }>('SELECT pg_get_serial_sequence($1, \'id\') AS "sequenceName";', [tableName]);
      const sequenceName = sequenceResult.rows[0]?.sequenceName;
      if (sequenceName) {
        await client.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${quoteIdent(tableName)}), 1));`, [sequenceName]);
      }
    }

    await client.query('COMMIT');
    return { ok: true, tables: [...resultByTable.values()] };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Lỗi không xác định khi import.';
    return { ok: false, tables: [{ error: message, inserted: 0, skippedDuplicates: 0, tableName: '(transaction rolled back)', updated: 0 }] };
  } finally {
    client.release();
  }
}
