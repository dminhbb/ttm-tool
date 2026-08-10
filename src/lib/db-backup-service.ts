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

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  // Dates are selected as ::text upstream (see isTemporalType), so this only guards against
  // a driver returning a Date object unexpectedly rather than being the normal code path.
  if (value instanceof Date) return `'${value.toISOString()}'`;
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

async function getColumns(tableName: string): Promise<ColumnInfo[]> {
  const result = await pool.query<{
    characterMaximumLength: number | null;
    columnDefault: string | null;
    columnName: string;
    dataType: string;
    isNullable: string;
    numericPrecision: number | null;
    numericScale: number | null;
  }>(`
    SELECT column_name AS "columnName", data_type AS "dataType", is_nullable AS "isNullable",
      column_default AS "columnDefault", character_maximum_length AS "characterMaximumLength",
      numeric_precision AS "numericPrecision", numeric_scale AS "numericScale"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);

  return result.rows.map((row) => {
    let fullType = row.dataType;
    if (row.dataType === 'character varying' && row.characterMaximumLength) fullType = `VARCHAR(${row.characterMaximumLength})`;
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

export async function exportTablesToSql(tableNames: string[], includeSchema: boolean): Promise<string> {
  const uniqueTableNames = [...new Set(tableNames)];
  if (uniqueTableNames.length === 0) throw new Error('Vui lòng chọn ít nhất một bảng để export.');
  for (const tableName of uniqueTableNames) assertAllowedTable(tableName);

  const lines: string[] = [
    EXPORT_SIGNATURE,
    `-- Generated at: ${new Date().toISOString()}`,
    `-- Tables: ${uniqueTableNames.join(', ')}`,
    `-- Includes schema: ${includeSchema ? 'yes (CREATE TABLE IF NOT EXISTS, columns + primary key only)' : 'no (data only)'}`,
    '',
  ];

  for (const tableName of uniqueTableNames) {
    lines.push(`-- Table: ${tableName}`);
    if (includeSchema) {
      lines.push(await buildCreateTableStatement(tableName));
      lines.push('');
    }

    const columns = await getColumns(tableName);
    const columnNames = columns.map((column) => column.columnName);
    const quotedColumns = columnNames.map(quoteIdent).join(', ');
    // Date/timestamp columns are selected as ::text so node-postgres never round-trips them
    // through a JS Date (which would shift the calendar date by the server's UTC offset).
    const selectList = columns
      .map((column) => (isTemporalType(column.dataType) ? `${quoteIdent(column.columnName)}::text AS ${quoteIdent(column.columnName)}` : quoteIdent(column.columnName)))
      .join(', ');
    const result = await pool.query(`SELECT ${selectList} FROM ${quoteIdent(tableName)} ORDER BY 1;`);

    for (const row of result.rows) {
      const values = columnNames.map((columnName) => formatSqlValue((row as Record<string, unknown>)[columnName]));
      lines.push(`INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

interface ParsedStatement {
  statement: string;
  tableName: string;
  type: 'CREATE_TABLE' | 'INSERT';
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
      if (!/\bON CONFLICT DO NOTHING\s*$/i.test(statement)) return { error: 'File chứa câu lệnh INSERT không đúng định dạng export chuẩn (thiếu ON CONFLICT DO NOTHING).' };
      statements.push({ statement, tableName, type: 'INSERT' });
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

export async function importSqlFile(sqlText: string): Promise<ImportResult> {
  const parsed = parseImportFile(sqlText);
  if ('error' in parsed) return { ok: false, tables: [{ error: parsed.error, inserted: 0, skippedDuplicates: 0, tableName: '(file)' }] };

  const touchedTables = [...new Set(parsed.statements.map((item) => item.tableName))];
  const resultByTable = new Map<string, ImportTableResult>();
  for (const tableName of touchedTables) resultByTable.set(tableName, { error: null, inserted: 0, skippedDuplicates: 0, tableName });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Disable FK/trigger enforcement for the duration of the load so cross-table and
    // self-referential foreign keys (e.g. issues.parent_id -> issues.id) never block on
    // insert order; triggers are re-enabled (without retroactive validation) before commit.
    for (const tableName of touchedTables) await client.query(`ALTER TABLE ${quoteIdent(tableName)} DISABLE TRIGGER ALL;`);

    for (const item of parsed.statements.filter((statement) => statement.type === 'CREATE_TABLE')) {
      await client.query(item.statement);
    }

    for (const item of parsed.statements.filter((statement) => statement.type === 'INSERT')) {
      const result = await client.query(item.statement);
      const tableResult = resultByTable.get(item.tableName)!;
      if ((result.rowCount ?? 0) > 0) tableResult.inserted += 1;
      else tableResult.skippedDuplicates += 1;
    }

    for (const tableName of touchedTables) await client.query(`ALTER TABLE ${quoteIdent(tableName)} ENABLE TRIGGER ALL;`);

    for (const tableName of touchedTables) {
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
    return { ok: false, tables: [{ error: message, inserted: 0, skippedDuplicates: 0, tableName: '(transaction rolled back)' }] };
  } finally {
    client.release();
  }
}
