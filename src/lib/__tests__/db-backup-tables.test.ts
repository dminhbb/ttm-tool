import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPORTABLE_TABLES, SMART_CONFIG_TABLES } from '../db-backup-tables';

test('every config table of the Smart export is on the import allow-list', () => {
  const allowed = new Set(EXPORTABLE_TABLES.map((table) => table.tableName));
  const missing = SMART_CONFIG_TABLES.filter((table) => !allowed.has(table));
  assert.deepEqual(missing, [], `Smart export tables the importer would refuse: ${missing.join(', ')}`);
});

test('no table is listed twice in the Smart export or the allow-list', () => {
  assert.equal(new Set(SMART_CONFIG_TABLES).size, SMART_CONFIG_TABLES.length);
  assert.equal(new Set(EXPORTABLE_TABLES.map((table) => table.tableName)).size, EXPORTABLE_TABLES.length);
});

test('every table of the install schema is either in the Smart export or deliberately excluded from it', async () => {
  const { readFileSync } = await import('node:fs');
  const { SMART_EXCLUDED_TABLES } = await import('../db-backup-tables');
  const schema = readFileSync('db/install/ttm-monitor-schema.sql', 'utf8');
  const tables = [...schema.matchAll(/^CREATE TABLE ([a-z0-9_]+) /gm)].map((match) => match[1]);
  const accounted = new Set<string>([...SMART_CONFIG_TABLES, ...SMART_EXCLUDED_TABLES, 'import_batches', 'issues']);
  const unaccounted = tables.filter((table) => !accounted.has(table));
  assert.deepEqual(unaccounted, [], `Decide for each new table whether the Smart export carries it: ${unaccounted.join(', ')}`);
  const overlap = SMART_CONFIG_TABLES.filter((table) => SMART_EXCLUDED_TABLES.includes(table));
  assert.deepEqual(overlap, []);
});
