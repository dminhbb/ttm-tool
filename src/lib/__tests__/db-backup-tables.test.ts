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
