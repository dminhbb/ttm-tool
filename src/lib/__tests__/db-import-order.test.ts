import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { EXPORTABLE_TABLES, SMART_CONFIG_TABLES } from '../db-backup-tables';
import { orderTablesForImport, orphanSweepSql, TRIGGER_WRITE_DEPENDENCIES, type ForeignKeyInfo } from '../db-import-order';

const ON_DELETE: Record<string, ForeignKeyInfo['onDelete']> = { CASCADE: 'c', RESTRICT: 'r', 'SET NULL': 'n' };

/** The foreign keys of the install schema (the empty-database DDL kept in step with every migration). */
function installSchemaForeignKeys(): (ForeignKeyInfo & { line: string })[] {
  const schema = readFileSync('db/install/ttm-monitor-schema.sql', 'utf8');
  return [...schema.matchAll(/^ALTER TABLE (\w+) ADD CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)(?: ON DELETE (CASCADE|SET NULL|RESTRICT))?.*$/gm)]
    .map((match) => ({
      childColumns: match[3].split(',').map((column) => column.trim()),
      childTable: match[1],
      deferrable: / DEFERRABLE/.test(match[0]),
      line: match[0],
      name: match[2],
      onDelete: match[6] ? ON_DELETE[match[6]] : 'a',
      parentColumns: match[5].split(',').map((column) => column.trim()),
      parentTable: match[4],
    }));
}

test('every foreign key of the install schema is DEFERRABLE (the import runs SET CONSTRAINTS ALL DEFERRED)', () => {
  const foreignKeys = installSchemaForeignKeys();
  assert.ok(foreignKeys.length > 50, 'the install schema regex no longer finds the foreign keys');
  assert.deepEqual(foreignKeys.filter((fk) => !fk.deferrable).map((fk) => fk.name), []);
});

test('a migration after 20261127_make_foreign_keys_deferrable declares its new foreign keys DEFERRABLE', () => {
  const later = readdirSync('db/migrations').filter((file) => file > '20261127_make_foreign_keys_deferrable.sql' && !file.endsWith('.down.sql'));
  for (const file of later) {
    const sql = readFileSync(`db/migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '');
    const references = sql.match(/REFERENCES[^,;]*/gi) ?? [];
    for (const reference of references) assert.match(reference, /DEFERRABLE/i, `${file}: "${reference.trim()}" must be DEFERRABLE INITIALLY IMMEDIATE`);
  }
});

test('import order: every parent table is loaded before its children, every table kept once', () => {
  const foreignKeys = installSchemaForeignKeys();
  const tables = EXPORTABLE_TABLES.map((table) => table.tableName);
  const ordered = orderTablesForImport(tables, foreignKeys);
  assert.deepEqual([...ordered].sort(), [...tables].sort());
  const at = new Map(ordered.map((table, index) => [table, index]));
  // The only cycle of the schema: news_letter_articles.header_image_id ↔ news_letter_images.article_id.
  const cycle = new Set(['news_letter_articles', 'news_letter_images']);
  const wrong = foreignKeys
    .filter((fk) => at.has(fk.childTable) && at.has(fk.parentTable) && fk.childTable !== fk.parentTable)
    .filter((fk) => !(cycle.has(fk.childTable) && cycle.has(fk.parentTable)))
    .filter((fk) => at.get(fk.parentTable)! > at.get(fk.childTable)!)
    .map((fk) => `${fk.parentTable} → ${fk.childTable}`);
  assert.deepEqual(wrong, []);
  for (const [child, parents] of Object.entries(TRIGGER_WRITE_DEPENDENCIES)) {
    for (const parent of parents) assert.ok(at.get(parent)! < at.get(child)!, `${parent} (its trigger writes ${child}) must come first`);
  }
});

test('import order keeps the file order where nothing constrains it, and breaks a cycle at the earlier table', () => {
  assert.deepEqual(orderTablesForImport(['holidays', 'makeup_workdays', 'domains'], []), ['holidays', 'makeup_workdays', 'domains']);
  assert.deepEqual(
    orderTablesForImport(['projects', 'users', 'domains'], [{ childTable: 'projects', parentTable: 'domains' }]),
    ['users', 'domains', 'projects'],
  );
  const cycle = [{ childTable: 'a', parentTable: 'b' }, { childTable: 'b', parentTable: 'a' }];
  assert.deepEqual(orderTablesForImport(['c', 'b', 'a'], [...cycle, { childTable: 'c', parentTable: 'a' }]), ['b', 'a', 'c']);
  // Self references (issues.parent_id) and tables outside the import do not constrain anything.
  assert.deepEqual(orderTablesForImport(['issues', 'x'], [{ childTable: 'issues', parentTable: 'issues' }, { childTable: 'x', parentTable: 'users' }]), ['issues', 'x']);
});

test('the Smart export (scope ALL) is ordered parents first too', () => {
  const ordered = orderTablesForImport(SMART_CONFIG_TABLES, installSchemaForeignKeys());
  const at = (table: string) => ordered.indexOf(table);
  assert.ok(at('users') < at('user_projects') && at('projects') < at('user_projects'));
  assert.ok(at('user_projects') < at('user_project_components') && at('user_projects') < at('project_members'));
  assert.ok(at('project_types') < at('projects') && at('domains') < at('projects'));
  assert.ok(at('ttm_policy_sets') < at('ttm_policy_configs') && at('news_letter_categories') < at('news_letter_articles'));
});

test('install seed (section 7): every parent table is seeded before its children (foreign keys to users are left NULL)', () => {
  const catalog = JSON.parse(readFileSync('scripts/db-schema-catalog.json', 'utf8')) as { seed: { tables: string[] } };
  const seeded = catalog.seed.tables;
  const wrong = installSchemaForeignKeys()
    .filter((fk) => seeded.includes(fk.childTable) && fk.parentTable !== 'users' && fk.parentTable !== fk.childTable)
    .filter((fk) => !seeded.includes(fk.parentTable) || seeded.indexOf(fk.parentTable) > seeded.indexOf(fk.childTable))
    .map((fk) => `${fk.childTable}.${fk.childColumns.join(',')} → ${fk.parentTable}`);
  assert.deepEqual(wrong, [], 'seeding these children first breaks the install script (one transaction, immediate foreign keys)');
});

test('orphan sweep follows the foreign key ON DELETE', () => {
  const base = { childColumns: ['updated_by_user_id'], childTable: 'black_listed_epics', deferrable: true, name: 'fk', parentColumns: ['id'], parentTable: 'users' };
  assert.equal(
    orphanSweepSql({ ...base, onDelete: 'n' }),
    'UPDATE "black_listed_epics" AS t SET "updated_by_user_id" = NULL WHERE t."updated_by_user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" AS p WHERE p."id" = t."updated_by_user_id");',
  );
  assert.equal(
    orphanSweepSql({ ...base, childColumns: ['user_id', 'project_id'], childTable: 'user_project_components', onDelete: 'c', parentColumns: ['user_id', 'project_id'], parentTable: 'user_projects' }),
    'DELETE FROM "user_project_components" AS t WHERE t."user_id" IS NOT NULL AND t."project_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "user_projects" AS p WHERE p."user_id" = t."user_id" AND p."project_id" = t."project_id");',
  );
  // NO ACTION / RESTRICT: left for the deferred check to report.
  assert.equal(orphanSweepSql({ ...base, onDelete: 'a' }), null);
  assert.equal(orphanSweepSql({ ...base, onDelete: 'r' }), null);
});
