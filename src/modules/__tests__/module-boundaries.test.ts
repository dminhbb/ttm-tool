import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC_ROOT = path.join(process.cwd(), 'src');
const MODULES_ROOT = path.join(SRC_ROOT, 'modules');
const MODULE_NAMES = new Set(['iam', 'integration', 'project', 'ttm', 'audit']);

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

describe('PMS module boundaries', () => {
  it('allows cross-module imports only through the target public API', () => {
    for (const file of sourceFiles(MODULES_ROOT)) {
      const relative = path.relative(MODULES_ROOT, file).replaceAll('\\', '/');
      const owner = relative.split('/')[0];
      if (!MODULE_NAMES.has(owner)) continue;

      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        const match = specifier.match(/^@\/modules\/([^/]+)(?:\/(.*))?$/);
        if (!match || match[1] === owner || !MODULE_NAMES.has(match[1])) continue;
        assert.equal(
          match[2],
          'public',
          `${relative} imports private internals of module "${match[1]}" through ${specifier}`,
        );
      }
    }
  });

  it('keeps migrated HTTP routes behind module public APIs', () => {
    const migratedRoutes = [
      'app/api/auth/login/route.ts',
      'app/api/ttm-dashboard-2/route.ts',
      'app/api/ttm-dashboard-2/rows/route.ts',
      'app/api/reports/route.ts',
      'app/api/data-source/import/route.ts',
      'app/api/data-source/import/auto/route.ts',
    ];
    const forbiddenLegacyImports = [
      '@/lib/db',
      '@/lib/auth-service',
      '@/lib/master-data-service',
      '@/lib/reports-service',
      '@/lib/report-access-scope',
      '@/lib/import-service',
      '@/lib/adapters/index',
      '@/lib/ttm-dashboard-2-cache-service',
      '@/lib/ttm-index-global-cache-service',
      '@/lib/view-as-user-service',
    ];

    for (const relative of migratedRoutes) {
      const source = readFileSync(path.join(SRC_ROOT, relative), 'utf8');
      const specifiers = importSpecifiers(source);
      for (const specifier of forbiddenLegacyImports) {
        assert.ok(!specifiers.includes(specifier), `${relative} still imports ${specifier}`);
      }
      assert.ok(
        specifiers.every((specifier) => !/^@\/modules\/[^/]+\/(application|domain|infrastructure)(?:\/|$)/.test(specifier)),
        `${relative} bypasses a module public API`,
      );
    }
  });
});
