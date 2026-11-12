import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import { orderTablesForImport, orphanSweepSql, type ForeignKeyInfo } from '@/lib/db-import-order';
import { DEFAULT_SMART_EXPORT_SCOPE, EXPORTABLE_TABLES, SMART_SESSION_TABLES, smartTablesForScope, type SmartExportScope } from '@/lib/db-backup-tables';
import type { BackupTableInfo, ImportResult, ImportTableResult } from '@/lib/db-backup-types';
import { EPIC_ISSUE_TYPES_SQL, STORY_ISSUE_TYPES_SQL } from '@/lib/issue-resolution-sql';
import { aggregateBatchData } from '@/lib/import-service';
import { refreshDerivedCaches } from '@/lib/daily-cache-service';
import { refreshDashboardTrendCache } from '@/lib/ttm-dashboard-trend-service';
import tableCatalog from '../../scripts/db-schema-catalog.json';

export const EXPORT_SIGNATURE = '-- TTM_MONITOR_SQL_EXPORT v1';
export const SMART_SURFACE_EXPORT_HEADER = '-- Smart Export Mode: SURFACE_LAYER';
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_STATEMENTS = 200_000;

// The import allow-list (a file naming any other table is refused). Since 2026-11-06 there is no "dump" export any more —
// the only export left is the Smart export (SMART_CONFIG_TABLES in db-backup-tables.ts ⊆ this list); older dump files still import.
const ALLOWED_TABLE_NAMES = new Set(EXPORTABLE_TABLES.map((table) => table.tableName));


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
  // bytea columns (news_letter_images.data) come back as a Buffer: hex input form, no quote/backslash to escape.
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  // JSON/JSONB columns (e.g. epic_alert_timeline.detail) come back from node-pg as parsed plain
  // objects — without this branch they fell into the generic String(value) case below, which
  // produces the literal text "[object Object]" (JS's default object-to-string conversion, not
  // JSON), and Postgres rejects that on import with "invalid input syntax for type json". Must
  // come after the Array check above since arrays are also typeof 'object'.
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Names for the tables that are not in EXPORTABLE_TABLES (those carry their own label). */
const OTHER_TABLE_LABELS: Record<string, string> = {
  api_keys: 'API Key',
  auth_sessions: 'Phiên đăng nhập',
  daily_cache_runs: 'Lịch sử chạy cache hằng ngày',
  data_snapshot_dates: 'Ngày chốt dữ liệu (cuối tuần)',
  derived_cache_refresh_lock: 'Khoá tạo lại cache',
  epic_alert_row_cache: 'Cache dòng cảnh báo Epic',
  mcp_access_daily_stats: 'MCP — thống kê truy cập',
  mcp_access_tokens: 'MCP — access token',
  mcp_oauth_authorization_codes: 'MCP — OAuth authorization code',
  mcp_oauth_clients: 'MCP — OAuth client',
  mcp_settings: 'MCP — cấu hình',
  password_reset_requests: 'Yêu cầu cấp lại mật khẩu',
  schema_migrations: 'Phiên bản migration đã áp dụng',
  sso_auth_codes: 'SSO — authorization code',
  ttm_dashboard_2_cache: 'Cache TTM Dashboard 2',
  ttm_dashboard_trend_cache: 'Cache xu hướng TTM',
  ttm_early_start_cache: 'Cache báo cáo Start sớm',
  ttm_index_global_cache: 'Cache chỉ số TTM toàn cục',
  user_usage_daily_stats: 'Thống kê sử dụng theo ngày',
  visit_log_rollups: 'Nhật ký truy cập — tổng hợp',
  visit_logs: 'Nhật ký truy cập',
};

/**
 * "Thông tin DB": every table of the application (schema public) with its row count and its size on disk
 * (table + indexes + TOAST). One statement — the count runs inside it via query_to_xml — so it costs one connection.
 */
const OTHER_GROUP = { id: 'other', name: 'Khác' };
/** Tables above this size show the planner's row estimate (pg_class.reltuples) instead of a full count(*) scan. */
const EXACT_COUNT_MAX_BYTES = 20 * 1024 * 1024;

export async function listDatabaseInfo(): Promise<BackupTableInfo[]> {
  const result = await pool.query<{ count: string; isEstimate: boolean; sizeBytes: string; tableName: string }>(`
    WITH t AS (
      SELECT c.oid, n.nspname, c.relname, pg_total_relation_size(c.oid) AS size, c.reltuples::bigint AS estimate
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public'
    )
    SELECT relname AS "tableName", size::text AS "sizeBytes",
      (size > $1 AND estimate >= 0) AS "isEstimate",
      CASE WHEN size > $1 AND estimate >= 0 THEN estimate::text
        ELSE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', nspname, relname), false, true, '')))[1]::text
      END AS count
    FROM t;
  `, [EXACT_COUNT_MAX_BYTES]);
  const labels = new Map(EXPORTABLE_TABLES.map((table) => [table.tableName, table.label]));
  // Groups by function, in the order of the product guide's schema chapter (scripts/db-schema-catalog.json).
  const groupOf = new Map<string, { id: string; index: number; name: string }>();
  tableCatalog.groups.forEach((group, index) => {
    for (const tableName of group.tables) groupOf.set(tableName, { id: group.id, index, name: group.name });
  });
  const rows = result.rows
    .map((row) => {
      const group = groupOf.get(row.tableName);
      return {
        approxRowCount: Number(row.count ?? 0),
        groupId: group?.id ?? OTHER_GROUP.id,
        groupIndex: group?.index ?? tableCatalog.groups.length,
        groupName: group?.name ?? OTHER_GROUP.name,
        isEstimate: row.isEstimate,
        label: labels.get(row.tableName) ?? OTHER_TABLE_LABELS[row.tableName] ?? '',
        sizeBytes: Number(row.sizeBytes),
        tableName: row.tableName,
      };
    })
    .sort((a, b) => a.groupIndex - b.groupIndex || b.sizeBytes - a.sizeBytes || a.tableName.localeCompare(b.tableName));
  return rows.map((row): BackupTableInfo => ({
    approxRowCount: row.approxRowCount,
    groupId: row.groupId,
    groupName: row.groupName,
    isEstimate: row.isEstimate,
    label: row.label,
    sizeBytes: row.sizeBytes,
    tableName: row.tableName,
  }));
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

/** The foreign keys from or to any of `tables` (schema public), with their columns in key order. */
async function loadForeignKeys(client: PoolClient, tables: string[]): Promise<ForeignKeyInfo[]> {
  const result = await client.query<ForeignKeyInfo>(`
    SELECT c.conname AS name, child.relname AS "childTable", parent.relname AS "parentTable",
      c.confdeltype AS "onDelete", c.condeferrable AS deferrable,
      ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS "childColumns",
      ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS "parentColumns"
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = child.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND (child.relname = ANY($1::text[]) OR parent.relname = ANY($1::text[]))
    ORDER BY child.relname, c.conname;
  `, [tables]);
  return result.rows;
}

/** A foreign key violation (23503) at the deferred check, reworded so the admin sees which link of the file is broken. */
function foreignKeyViolationError(error: unknown): unknown {
  const pgError = error as { code?: string; constraint?: string; detail?: string; table?: string };
  if (pgError?.code !== '23503') return error;
  return new Error(
    `Dữ liệu trong file vi phạm khoá ngoại "${pgError.constraint ?? '?'}" (bảng ${pgError.table ?? '?'}): ${pgError.detail ?? ''}`
    + ' Hãy import kèm bảng được tham chiếu, hoặc export lại file từ môi trường nguồn.',
  );
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

/**
 * One table's worth of export lines — optional CREATE TABLE, then one INSERT per row, optionally
 * restricted by `whereClause` (raw SQL using `$1`/`$2`, paired with `whereParams`). Shared by both
 * exportTablesToSql (whole-table, no filter) and exportDataLayerRangeToSql (filtered by data-layer
 * date range) so the two never drift on statement shape, upsert behavior, or value formatting.
 */
async function exportOneTableToSql(
  tableName: string,
  includeSchema: boolean,
  whereClause?: string,
  whereParams?: unknown[],
  columnOverrides?: Record<string, unknown>,
): Promise<string[]> {
  const lines: string[] = [];
  if (includeSchema) {
    lines.push(await buildCreateTableStatement(tableName));
    lines.push('');
  }

  const [columns, primaryKeyColumns] = await Promise.all([getColumns(tableName), getPrimaryKeyColumns(tableName)]);
  const columnNames = columns.map((column) => column.columnName);
  const quotedColumns = columnNames.map(quoteIdent).join(', ');
  const conflictClause = buildConflictClause(tableName, columnNames, primaryKeyColumns);
  // Date/timestamp columns are selected as ::text so node-postgres never round-trips them
  // through a JS Date (which would shift the calendar date by the server's UTC offset). JSON/JSONB
  // columns too: node-postgres hands a JSON *array* back as a JS array, which formatSqlValue would
  // write as a Postgres array literal ('{"[object Object]"}') — the content of e.g.
  // scoring_rule_group_history.config_before/after was lost that way (fixed 2026-10-26).
  const selectList = columns
    .map((column) => (isTemporalType(column.dataType) || column.dataType === 'json' || column.dataType === 'jsonb' ? `${quoteIdent(column.columnName)}::text AS ${quoteIdent(column.columnName)}` : quoteIdent(column.columnName)))
    .join(', ');
  const whereSql = whereClause ? ` WHERE ${whereClause}` : '';
  const result = await pool.query(`SELECT ${selectList} FROM ${quoteIdent(tableName)}${whereSql} ORDER BY 1;`, whereParams);

  for (const row of result.rows) {
    const rowObj = columnOverrides ? { ...(row as Record<string, unknown>), ...columnOverrides } : (row as Record<string, unknown>);
    const values = columnNames.map((columnName) => formatSqlValue(rowObj[columnName]));
    lines.push(`INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES (${values.join(', ')}) ${conflictClause};`);
  }
  lines.push('');
  return lines;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SmartSurfaceExportOptions {
  includeSchema?: boolean;
  layerDate: string;
  /** "Phạm vi Smart export" — default SURFACE_ONLY (surface data layer only). */
  scope?: SmartExportScope;
}

/**
 * Smart Surface Layer Export: builds a consolidated surface data layer as of `layerDate`
 * (every data layer on or before `layerDate`, i.e. `aggregated_at::date <= layerDate`):
 *   1. Epics: for each Epic appearing on or before `layerDate`, picks only its single latest row.
 *   2. Stories of those Epics: for each Story belonging to the surface Epics (via `epic_stories`
 *      or `epic_key`), picks only its single latest row on or before `layerDate`.
 *   3. Subtasks of those Stories/Epics: for each Subtask belonging to the surface Stories or Epics
 *      (via `story_subtasks`, `parent_key`, or `epic_key`), picks only its single latest row on or
 *      before `layerDate`.
 *   4. 1 consolidated `import_batches` header row.
 *
 * When re-imported via `importSqlFile`, `SMART_SURFACE_EXPORT_HEADER` tells the importer to create
 * a brand-new `import_batches` layer stamped with the current import timestamp (`NOW()`), attach all
 * surface `issues` to that new batch at `NOW()`, link `parent_id`/`epic_id`, and
 * re-derive the alert layers — so both a fresh copy host and the source host receive a clean, self-contained
 * surface data layer at the exact moment of import.
 */
/** Table reads a Smart export runs at once — the hosted pool holds 3 connections (db.ts). */
const SMART_EXPORT_CONCURRENCY = 3;

/** `work` over every item, at most `limit` at a time; results in input order. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function exportSmartSurfaceToSql(options: SmartSurfaceExportOptions): Promise<string> {
  const { layerDate, includeSchema = false, scope = DEFAULT_SMART_EXPORT_SCOPE } = options;
  if (!ISO_DATE_PATTERN.test(layerDate)) {
    throw new Error('Vui lòng chọn ngày mốc lớp dữ liệu hợp lệ (YYYY-MM-DD).');
  }

  const surfaceIssuesResult = await pool.query<{ id: number }>(`
    WITH latest_issues AS (
      SELECT DISTINCT ON (issue_key)
        id, issue_key, issue_type, jira_id, epic_key, parent_key,
        epic_stories, story_subtasks, source_import_batch_id, aggregated_at
      FROM issues
      WHERE aggregated_at::date <= $1::date
      ORDER BY issue_key ASC, aggregated_at DESC, id DESC
    ),
    surface_epics AS (
      SELECT id, issue_key, epic_stories
      FROM latest_issues
      WHERE UPPER(issue_type) IN (${EPIC_ISSUE_TYPES_SQL})
    ),
    stories_by_list AS (
      SELECT DISTINCT li.id, li.issue_key, li.jira_id, li.story_subtasks
      FROM surface_epics e
      CROSS JOIN LATERAL unnest(e.epic_stories) AS story_key
      JOIN latest_issues li
        ON li.issue_key = story_key
        AND UPPER(li.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
      WHERE e.epic_stories IS NOT NULL AND array_length(e.epic_stories, 1) > 0
    ),
    stories_by_epic_key AS (
      SELECT DISTINCT li.id, li.issue_key, li.jira_id, li.story_subtasks
      FROM surface_epics e
      JOIN latest_issues li
        ON li.epic_key = e.issue_key
        AND UPPER(li.issue_type) IN (${STORY_ISSUE_TYPES_SQL})
    ),
    surface_stories AS (
      SELECT id, issue_key, jira_id, story_subtasks FROM stories_by_list
      UNION
      SELECT id, issue_key, jira_id, story_subtasks FROM stories_by_epic_key
    ),
    subtasks_by_list AS (
      SELECT DISTINCT li.id
      FROM surface_stories s
      CROSS JOIN LATERAL unnest(s.story_subtasks) AS subtask_key
      JOIN latest_issues li ON li.issue_key = subtask_key
      WHERE s.story_subtasks IS NOT NULL AND array_length(s.story_subtasks, 1) > 0
        AND UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
        AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
    ),
    subtasks_by_parent_key AS (
      SELECT DISTINCT li.id
      FROM surface_stories s
      JOIN latest_issues li ON li.parent_key = s.issue_key
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
        AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
    ),
    subtasks_by_parent_jira_id AS (
      SELECT DISTINCT li.id
      FROM surface_stories s
      JOIN latest_issues li ON li.parent_key = s.jira_id::text
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
        AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
    ),
    subtasks_by_epic_key AS (
      SELECT DISTINCT li.id
      FROM surface_epics e
      JOIN latest_issues li ON li.epic_key = e.issue_key
      WHERE UPPER(li.issue_type) NOT IN (${EPIC_ISSUE_TYPES_SQL})
        AND UPPER(li.issue_type) NOT IN (${STORY_ISSUE_TYPES_SQL})
    ),
    surface_issue_ids AS (
      SELECT id FROM surface_epics
      UNION
      SELECT id FROM surface_stories
      UNION
      SELECT id FROM subtasks_by_list
      UNION
      SELECT id FROM subtasks_by_parent_key
      UNION
      SELECT id FROM subtasks_by_parent_jira_id
      UNION
      SELECT id FROM subtasks_by_epic_key
    )
    SELECT id FROM surface_issue_ids ORDER BY id ASC;
  `, [layerDate]);

  const issueIds = surfaceIssuesResult.rows.map((row) => row.id);
  if (issueIds.length === 0) {
    throw new Error(`Không có dữ liệu Epic/Story/Subtask nào tại hoặc trước ngày ${layerDate}.`);
  }

  // A config table this database doesn't have yet (migration not run here) is skipped and named in the
  // header — like listBackupTables — instead of failing the whole export (2026-10-20).
  const scopeTables = smartTablesForScope(scope);
  const presentConfigTables = new Set((await pool.query<{ tableName: string }>(
    'SELECT name AS "tableName" FROM unnest($1::text[]) AS name WHERE to_regclass(quote_ident(name)) IS NOT NULL;',
    [scopeTables],
  )).rows.map((row) => row.tableName));
  const exportedConfigTables = scopeTables.filter((table) => presentConfigTables.has(table));
  const missingConfigTables = scopeTables.filter((table) => !presentConfigTables.has(table));

  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    EXPORT_SIGNATURE,
    SMART_SURFACE_EXPORT_HEADER,
    `-- Smart Export Scope: ${scope}`,
    `-- Generated at: ${generatedAt}`,
    `-- Surface layer as of date: ${layerDate}`,
    `-- Tables: ${['import_batches', 'issues', ...exportedConfigTables].join(', ')}`,
    ...(exportedConfigTables.includes('users') ? ['-- Contains users with their password hashes: keep this file safe (the export asks the SUPERADMIN for their password).'] : []),
    ...(missingConfigTables.length > 0 ? [`-- Skipped (table not on the source database): ${missingConfigTables.join(', ')}`] : []),
    `-- Includes schema: ${includeSchema ? 'yes (CREATE TABLE IF NOT EXISTS, columns + primary key only)' : 'no (data only)'}`,
    '-- Import behavior: creates a consolidated surface data layer stamped with the import execution timestamp (NOW()).',
    '',
  ];

  // 1. Export 1 synthetic/consolidated import_batches row
  if (includeSchema) {
    lines.push(await buildCreateTableStatement('import_batches'));
    lines.push('');
  }
  const [batchColumns, batchPkColumns] = await Promise.all([getColumns('import_batches'), getPrimaryKeyColumns('import_batches')]);
  const batchColumnNames = batchColumns.map((column) => column.columnName);
  const batchQuotedColumns = batchColumnNames.map(quoteIdent).join(', ');
  const batchConflictClause = buildConflictClause('import_batches', batchColumnNames, batchPkColumns);
  const syntheticBatchRow: Record<string, unknown> = {
    id: 1,
    source_type: 'CSV',
    file_name: `smart-surface-export-${layerDate}.sql`,
    import_type: 'MANUAL',
    imported_by: 'Smart Export',
    imported_at: generatedAt,
    aggregated_at: generatedAt,
    total_rows: issueIds.length,
    success_rows: issueIds.length,
    warning_rows: 0,
    error_rows: 0,
    status: 'SUCCESS',
    metadata_json: JSON.stringify({
      adapterType: 'py-jira-api',
      smartExport: true,
      surfaceLayerDate: layerDate,
    }),
    created_at: generatedAt,
    updated_at: generatedAt,
  };
  const batchValues = batchColumnNames.map((columnName) => formatSqlValue(syntheticBatchRow[columnName] ?? null));
  lines.push(`INSERT INTO "import_batches" (${batchQuotedColumns}) VALUES (${batchValues.join(', ')}) ${batchConflictClause};`);
  lines.push('');

  // Ensure the trend cache is up-to-date before exporting, so the target environment
  // immediately gets the full 7-point trend series upon import.
  if (exportedConfigTables.includes('ttm_dashboard_trend_cache')) {
    try {
      await refreshDashboardTrendCache();
    } catch (trendError) {
      console.warn('Could not refresh trend cache before export:', trendError);
    }
  }

  // 2–4. The surface issues (Epics + Stories + Subtasks) and the TTM scoring, calendar,
  // scope & exclusion config tables (so TTM calculations match across environments). Independent
  // reads, so they run concurrently (2026-10-20) — at most SMART_EXPORT_CONCURRENCY at a time, since
  // the hosted pool is small (db.ts); the file keeps this order whatever finishes first.
  const sections = await mapWithConcurrency<() => Promise<string[]>, string[]>([
    () => exportOneTableToSql('issues', includeSchema, 'id = ANY($1::int[])', [issueIds], { source_import_batch_id: 1 }),
    ...exportedConfigTables.map((configTable) => () => {
      if (configTable === 'ttm_dashboard_metric_history' || configTable === 'ttm_dashboard_fail_history') {
        return exportOneTableToSql(configTable, includeSchema, 'layer_date <= $1::date', [layerDate]);
      }
      if (configTable === 'ttm_dashboard_trend_cache') {
        return exportOneTableToSql(configTable, includeSchema, 'latest_layer_date <= $1::date', [layerDate]);
      }
      return exportOneTableToSql(configTable, includeSchema);
    }),
  ], SMART_EXPORT_CONCURRENCY, (task) => task());
  for (const section of sections) lines.push(...section);

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
  for (const rawStatement of rawStatements) {
    const statement = rawStatement.replace(/^(--[^\r\n]*(\r?\n|$))+/, '').trim();
    if (!statement) continue;

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
export interface ImportSqlOptions {
  /** The signed-in SUPERADMIN: their own users row is never deleted by the import (mirror or collision). */
  actorUserId?: number;
  /** Run everything, report what would change (inserted / updated / deleted per table), then ROLLBACK. */
  dryRun?: boolean;
}

export async function importSqlFile(sqlText: string, selectedTables?: Set<string> | null, options: ImportSqlOptions = {}): Promise<ImportResult> {
  const parsed = parseImportFile(sqlText);
  if ('error' in parsed) return { ok: false, tables: [{ deleted: 0, error: parsed.error, inserted: 0, skippedDuplicates: 0, tableName: '(file)', updated: 0 }] };

  const isSmartSurfaceExport = sqlText.slice(0, 1000).includes(SMART_SURFACE_EXPORT_HEADER);
  const allTouchedTables = [...new Set(parsed.statements.map((item) => item.tableName))];
  const insertTables = selectedTables ? allTouchedTables.filter((tableName) => selectedTables.has(tableName)) : allTouchedTables;
  const resultByTable = new Map<string, ImportTableResult>();
  for (const tableName of insertTables) resultByTable.set(tableName, { deleted: 0, error: null, inserted: 0, skippedDuplicates: 0, tableName, updated: 0 });
  // Rows an import deletes are counted per table (a clean-up may touch a table the file doesn't name).
  const countDeleted = (tableName: string, rows: number | null | undefined) => {
    if (!rows) return;
    const entry = resultByTable.get(tableName) ?? { deleted: 0, error: null, inserted: 0, skippedDuplicates: 0, tableName, updated: 0 };
    entry.deleted += rows;
    resultByTable.set(tableName, entry);
  };
  // The admin running the import must not delete their own account (a file from another environment
  // names the same username under another id) — appended to every DELETE that can reach `users`.
  const actorId = Number.isInteger(options.actorUserId) ? options.actorUserId! : null;
  const keepActor = (tableName: string, alias: string) => (tableName === 'users' && actorId !== null ? ` AND ${alias}.id <> ${actorId}` : '');

  const SMART_LAYER_TABLES = new Set(['import_batches', 'issues']);
  const hasSmartLayerTablesSelected = isSmartSurfaceExport && insertTables.some((tableName) => SMART_LAYER_TABLES.has(tableName));
  const touchedTables = hasSmartLayerTablesSelected
    ? [...new Set([...insertTables, 'import_batches', 'issues'])]
    : insertTables;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // No trigger is switched off (ALTER TABLE … DISABLE TRIGGER ALL needs a superuser — it also turns off the system
    // RI_ConstraintTrigger_* of the foreign keys). Instead every foreign key is DEFERRABLE (migration
    // 20261127_make_foreign_keys_deferrable) and checked at the end, tables are loaded parents first, and rows left
    // pointing at a missing parent are handled as their ON DELETE says before the check — see db-import-order.ts.
    await client.query('SET CONSTRAINTS ALL DEFERRED;');
    const foreignKeys = await loadForeignKeys(client, touchedTables);
    const orderedInsertTables = orderTablesForImport(insertTables, foreignKeys);

    for (const item of parsed.statements.filter((statement) => statement.type === 'CREATE_TABLE')) {
      await client.query(item.statement);
    }

    const INSERT_BATCH_CHUNK_SIZE = 500;
    let smartImportBatchId: number | null = null;
    const importNow = new Date().toISOString();

    if (hasSmartLayerTablesSelected) {
      // 1. Create a fresh import_batches record stamped with the current import date & time (importNow).
      const batchStatements = parsed.statements.filter((statement) => statement.type === 'INSERT' && statement.tableName === 'import_batches');
      if (batchStatements.length > 0) {
        const columns = batchStatements[0].columns!;
        const parsedCols = columns.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
        const nonIdCols = parsedCols.filter((col) => col !== 'id');
        await client.query('CREATE TEMP TABLE tmp_smart_import_batches (LIKE "import_batches") ON COMMIT DROP;');
        const tuples = batchStatements.map((item) => `(${item.valuesTuple})`).join(', ');
        await client.query(`INSERT INTO tmp_smart_import_batches (${columns}) VALUES ${tuples};`);

        const targetColsSql = nonIdCols.map(quoteIdent).join(', ');
        const selectColsSql = nonIdCols.map((col) => {
          if (col === 'imported_at' || col === 'aggregated_at' || col === 'created_at' || col === 'updated_at') {
            return `$1::timestamptz AS ${quoteIdent(col)}`;
          }
          return quoteIdent(col);
        }).join(', ');
        const batchInsertRes = await client.query<{ id: number }>(
          `INSERT INTO "import_batches" (${targetColsSql}) SELECT ${selectColsSql} FROM tmp_smart_import_batches ORDER BY id DESC LIMIT 1 RETURNING id;`,
          [importNow],
        );
        smartImportBatchId = batchInsertRes.rows[0].id;
      } else {
        const fallbackBatchRes = await client.query<{ id: number }>(`
          INSERT INTO "import_batches" (
            source_type, file_name, import_type, imported_by,
            imported_at, aggregated_at, status, created_at, updated_at
          ) VALUES ('CSV', 'smart-surface-import.sql', 'MANUAL', 'Smart Export', $1::timestamptz, $1::timestamptz, 'SUCCESS', $1::timestamptz, $1::timestamptz)
          RETURNING id;
        `, [importNow]);
        smartImportBatchId = fallbackBatchRes.rows[0].id;
      }
      if (resultByTable.has('import_batches')) {
        resultByTable.get('import_batches')!.inserted = 1;
      }

      // 2. Insert surface issues into the newly created import_batch with aggregated_at = importNow.
      if (insertTables.includes('issues')) {
        const issueStatements = parsed.statements.filter((statement) => statement.type === 'INSERT' && statement.tableName === 'issues');
        if (issueStatements.length > 0) {
          const columns = issueStatements[0].columns!;
          const parsedCols = columns.split(',').map((col) => col.trim().replace(/^"|"$/g, ''));
          const nonIdCols = parsedCols.filter((col) => col !== 'id');
          await client.query('CREATE TEMP TABLE tmp_smart_issues (LIKE "issues") ON COMMIT DROP;');
          for (let chunkStart = 0; chunkStart < issueStatements.length; chunkStart += INSERT_BATCH_CHUNK_SIZE) {
            const chunk = issueStatements.slice(chunkStart, chunkStart + INSERT_BATCH_CHUNK_SIZE);
            const tuples = chunk.map((item) => `(${item.valuesTuple})`).join(', ');
            await client.query(`INSERT INTO tmp_smart_issues (${columns}) VALUES ${tuples};`);
          }

          // Clean up any existing issues on the target DB whose issue_key is no longer
          // present in the imported surface layer, as well as any issues with aggregated_at newer than importNow,
          // so DISTINCT ON (issue_key) ORDER BY aggregated_at DESC reflects the imported surface layer 100%.
          const deletedIssues = await client.query(`
            DELETE FROM "issues" AS i
            WHERE NOT EXISTS (
              SELECT 1 FROM tmp_smart_issues AS s WHERE s.issue_key = i.issue_key
            )
            OR i.aggregated_at > $1::timestamptz;
          `, [importNow]);
          countDeleted('issues', deletedIssues.rowCount);

          const targetColsSql = nonIdCols.map(quoteIdent).join(', ');
          const selectColsSql = nonIdCols.map((col) => {
            if (col === 'source_import_batch_id') return '$1::int AS "source_import_batch_id"';
            if (col === 'aggregated_at' || col === 'created_at' || col === 'updated_at') return `$2::timestamptz AS ${quoteIdent(col)}`;
            if (col === 'parent_id' || col === 'epic_id') return `NULL::int AS ${quoteIdent(col)}`;
            return quoteIdent(col);
          }).join(', ');
          const issuesRes = await client.query(
            `INSERT INTO "issues" (${targetColsSql}) SELECT DISTINCT ON ("issue_key") ${selectColsSql} FROM tmp_smart_issues ORDER BY "issue_key", aggregated_at DESC, id DESC;`,
            [smartImportBatchId, importNow],
          );
          const insertedIssueCount = issuesRes.rowCount ?? 0;
          resultByTable.get('issues')!.inserted = insertedIssueCount;

          await client.query(
            'UPDATE "import_batches" SET total_rows = $2, success_rows = $2 WHERE id = $1;',
            [smartImportBatchId, insertedIssueCount],
          );

          // Link parent_id and epic_id within the newly created surface batch.
          await client.query(`
            UPDATE issues child
            SET parent_id = parent.id
            FROM issues parent
            WHERE child.source_import_batch_id = $1
              AND parent.source_import_batch_id = $1
              AND child.parent_key = parent.issue_key
              AND child.parent_key IS NOT NULL;
          `, [smartImportBatchId]);
          await client.query(`
            UPDATE issues child
            SET parent_id = parent.id
            FROM issues parent
            WHERE child.source_import_batch_id = $1
              AND parent.source_import_batch_id = $1
              AND child.parent_id IS NULL
              AND child.parent_key = CAST(parent.jira_id AS VARCHAR)
              AND child.parent_key IS NOT NULL;
          `, [smartImportBatchId]);
          await client.query(`
            UPDATE issues story
            SET epic_id = epic.id
            FROM issues epic
            WHERE story.source_import_batch_id = $1
              AND epic.source_import_batch_id = $1
              AND story.epic_key = epic.issue_key
              AND story.epic_key IS NOT NULL;
          `, [smartImportBatchId]);
          await client.query(`
            UPDATE issues child
            SET epic_id = parent.epic_id
            FROM issues parent
            WHERE child.source_import_batch_id = $1
              AND parent.source_import_batch_id = $1
              AND child.parent_id = parent.id
              AND parent.epic_id IS NOT NULL;
          `, [smartImportBatchId]);

          // Accumulate project_components from the imported surface issues.
          await client.query(`
            INSERT INTO project_components (project_key, component_name)
            SELECT DISTINCT
              SPLIT_PART(i.issue_key, '-', 1) AS project_key,
              BTRIM(comp) AS component_name
            FROM issues i
            CROSS JOIN LATERAL unnest(i.components) AS comp
            WHERE i.source_import_batch_id = $1
              AND SPLIT_PART(i.issue_key, '-', 1) <> ''
              AND BTRIM(comp) <> ''
            ON CONFLICT (project_key, component_name)
            DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
          `, [smartImportBatchId]);
        }
      }
    }

    const HISTORICAL_LAYER_TABLES = new Set([
      'import_batches',
      'issues',
      'epic_alert_timeline',
      'audit_logs',
    ]);

    const SECONDARY_UNIQUE_CONFLICT_PREDICATES: Record<string, string[]> = {
      domains: ['t.domain_code = incoming.domain_code'],
      epic_alert_timeline: [
        't.end_date IS NULL AND incoming.end_date IS NULL AND t.epic_key = incoming.epic_key AND t.alert_type = incoming.alert_type',
      ],
      epic_status_alert_rules: [
        't.epic_complexity_type = incoming.epic_complexity_type AND t.epic_status = incoming.epic_status',
      ],
      issue_type_role_mapping: ['t.issue_type = incoming.issue_type'],
      issues: [
        't.issue_key = incoming.issue_key AND t.source_import_batch_id = incoming.source_import_batch_id',
      ],
      makeup_workdays: ['t.work_date = incoming.work_date'],
      project_components: [
        't.project_key = incoming.project_key AND t.component_name = incoming.component_name',
      ],
      projects: [
        't.source_project_key = incoming.source_project_key',
        't.project_code = incoming.project_code',
      ],
      ttm_policy_configs: [
        't.policy_set = incoming.policy_set AND t.ttm_type = incoming.ttm_type AND t.epic_complexity_type = incoming.epic_complexity_type',
      ],
      ttm_policy_sets: ['t.key = incoming.key'],
      users: [
        'LOWER(t.email) = LOWER(incoming.email)',
        "SPLIT_PART(LOWER(t.email), '@', 1) = SPLIT_PART(LOWER(incoming.email), '@', 1)",
      ],
    };

    for (const tableName of orderedInsertTables) {
      if (hasSmartLayerTablesSelected && SMART_LAYER_TABLES.has(tableName)) continue;
      const insertsForTable = parsed.statements.filter((statement) => statement.type === 'INSERT' && statement.tableName === tableName);
      // audit_logs is mirrored too when it comes from a Smart export (the target gets production's trail, not a mix).
      const isFullSyncTable = !HISTORICAL_LAYER_TABLES.has(tableName) || (isSmartSurfaceExport && tableName === 'audit_logs');
      if (insertsForTable.length === 0) {
        if (isFullSyncTable) {
          const wiped = await client.query(`DELETE FROM ${quoteIdent(tableName)} AS t WHERE TRUE${keepActor(tableName, 't')};`);
          countDeleted(tableName, wiped.rowCount);
        }
        continue;
      }
      const tableResult = resultByTable.get(tableName)!;
      const columns = insertsForTable[0].columns!;
      const conflictClause = insertsForTable[0].conflictClause!;
      const secondaryPredicates = SECONDARY_UNIQUE_CONFLICT_PREDICATES[tableName];
      const pkColumns = await getPrimaryKeyColumns(tableName);

      if (isFullSyncTable || (secondaryPredicates && secondaryPredicates.length > 0)) {
        await client.query(`CREATE TEMP TABLE tmp_import_stage (LIKE ${quoteIdent(tableName)}) ON COMMIT DROP;`);
        for (let chunkStart = 0; chunkStart < insertsForTable.length; chunkStart += INSERT_BATCH_CHUNK_SIZE) {
          const chunk = insertsForTable.slice(chunkStart, chunkStart + INSERT_BATCH_CHUNK_SIZE);
          const tuples = chunk.map((item) => `(${item.valuesTuple})`).join(', ');
          await client.query(`INSERT INTO tmp_import_stage (${columns}) VALUES ${tuples};`);
        }
        if (pkColumns.length > 0) {
          const pkSelfMatchSql = pkColumns.map((col) => `t.${quoteIdent(col)} = incoming.${quoteIdent(col)}`).join(' AND ');
          await client.query(`
            DELETE FROM tmp_import_stage AS t
            USING tmp_import_stage AS incoming
            WHERE t.ctid < incoming.ctid
              AND (${pkSelfMatchSql});
          `);
          if (isFullSyncTable) {
            const pkTargetMatchSql = pkColumns.map((col) => `s.${quoteIdent(col)} = t.${quoteIdent(col)}`).join(' AND ');
            const mirrored = await client.query(`
              DELETE FROM ${quoteIdent(tableName)} AS t
              WHERE NOT EXISTS (
                SELECT 1 FROM tmp_import_stage AS s
                WHERE ${pkTargetMatchSql}
              )${keepActor(tableName, 't')};
            `);
            countDeleted(tableName, mirrored.rowCount);
          }
        }
        if (secondaryPredicates && secondaryPredicates.length > 0) {
          // "Another row" = a different primary key — not always `id` (ttm_policy_sets is keyed by `key`).
          const otherRowSql = pkColumns.length > 0
            ? `NOT (${pkColumns.map((col) => `t.${quoteIdent(col)} = incoming.${quoteIdent(col)}`).join(' AND ')})`
            : 't.id <> incoming.id';
          for (const predicate of secondaryPredicates) {
            await client.query(`
              DELETE FROM tmp_import_stage AS t
              USING tmp_import_stage AS incoming
              WHERE t.ctid < incoming.ctid
                AND (${predicate});
            `);
            const collided = await client.query(`
              DELETE FROM ${quoteIdent(tableName)} AS t
              USING tmp_import_stage AS incoming
              WHERE ${otherRowSql}
                AND (${predicate})${keepActor(tableName, 't')};
            `);
            countDeleted(tableName, collided.rowCount);
          }
        }
        const result = await client.query<{ isNewRow: boolean }>(
          `INSERT INTO ${quoteIdent(tableName)} (${columns}) SELECT ${columns} FROM tmp_import_stage ${conflictClause} RETURNING (xmax = 0) AS "isNewRow";`,
        );
        const insertedCount = result.rows.filter((row) => row.isNewRow).length;
        tableResult.inserted += insertedCount;
        tableResult.updated += result.rows.length - insertedCount;
        tableResult.skippedDuplicates += insertsForTable.length - result.rows.length;
        await client.query('DROP TABLE tmp_import_stage;');
        continue;
      }

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

    for (const tableName of touchedTables) {
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

    // A Smart import rewrites `users`: an id may now be another person, so no login of this database survives it —
    // sessions / tokens / codes are dropped, except the importing SUPERADMIN's own (they stay signed in).
    if (isSmartSurfaceExport && insertTables.includes('users')) {
      const sessionTables = (await client.query<{ name: string }>('SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(quote_ident(name)) IS NOT NULL;', [SMART_SESSION_TABLES])).rows.map((row) => row.name);
      for (const sessionTable of sessionTables) {
        const dropped = await client.query(`DELETE FROM ${quoteIdent(sessionTable)} WHERE user_id IS DISTINCT FROM $1::int;`, [actorId]);
        countDeleted(sessionTable, dropped.rowCount);
      }
    }

    // Rows deleted by the import already cascaded (triggers stay on). What is left are rows loaded from the file that
    // name a parent this database does not have (e.g. updated_by_user_id of a user that exists only in the source
    // environment): handle them as their foreign key's ON DELETE says, then run the deferred checks now, so a dry run
    // reports a broken file too and the error names the constraint.
    const touched = new Set(touchedTables);
    for (const fk of foreignKeys) {
      if (!touched.has(fk.childTable)) continue;
      const sweep = orphanSweepSql(fk);
      if (!sweep) continue;
      const swept = await client.query(sweep);
      if (fk.onDelete === 'c') countDeleted(fk.childTable, swept.rowCount);
    }
    try {
      await client.query('SET CONSTRAINTS ALL IMMEDIATE;');
    } catch (error: unknown) {
      throw foreignKeyViolationError(error);
    }

    if (smartImportBatchId !== null && insertTables.includes('issues') && !options.dryRun) {
      await aggregateBatchData(client, smartImportBatchId, new Date(importNow));
    }

    await client.query(options.dryRun ? 'ROLLBACK' : 'COMMIT');

    if (!options.dryRun && (insertTables.includes('issues') || insertTables.includes('ttm_dashboard_metric_history'))) {
      try {
        await refreshDerivedCaches(smartImportBatchId, 'import');
      } catch (cacheError) {
        console.error('Failed to refresh derived caches after backup import:', cacheError);
      }
    }

    return { ok: true, tables: [...resultByTable.values()] };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Lỗi không xác định khi import.';
    return { ok: false, tables: [{ deleted: 0, error: message, inserted: 0, skippedDuplicates: 0, tableName: '(transaction rolled back)', updated: 0 }] };
  } finally {
    client.release();
  }
}
