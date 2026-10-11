#!/usr/bin/env node
/**
 * In ma trận contrast của tầng token, theo từng brand.
 *
 * Dùng để (a) lập baseline cho test, (b) soi nhanh cặp màu nào không đạt WCAG AA.
 * Chạy: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/audit-token-contrast.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectDeclarations,
  contrastRatio,
  flatten,
  parseColor,
  resolveToken,
} from '../src/lib/design-system/css-tokens.ts';
import { THEME_BRANDS } from '../src/lib/theme-brand.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(repoRoot, 'src', 'app');
const sources = [
  readFileSync(path.join(appDir, 'ias-tokens.css'), 'utf8'),
  readFileSync(path.join(appDir, 'globals.css'), 'utf8'),
];

const SURFACES = [
  ['page', '--surface-app'],
  ['panel', '--surface-panel'],
];
const FOREGROUNDS = [
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--success',
  '--warning',
  '--danger',
];

const rows = [];
for (const brand of THEME_BRANDS) {
  const declared = collectDeclarations(sources, brand);
  const resolve = (t) => resolveToken(t, declared);

  for (const [surfaceName, surfaceToken] of SURFACES) {
    const surface = parseColor(resolve(surfaceToken));
    for (const fgToken of FOREGROUNDS) {
      const fg = parseColor(resolve(fgToken));
      const ratio = contrastRatio(flatten(fg, surface), surface);
      rows.push({
        brand,
        surface: surfaceName,
        surfaceHex: resolve(surfaceToken),
        token: fgToken,
        hex: resolve(fgToken),
        ratio: Math.round(ratio * 100) / 100,
        passesAA: ratio >= 4.5,
      });
    }
  }
}

const lines = [];
lines.push('brand     surface  token               hex        ratio   AA');
lines.push('-'.repeat(66));
for (const r of rows) {
  lines.push(
    `${r.brand.padEnd(9)} ${r.surface.padEnd(8)} ${r.token.replace('--', '').padEnd(19)} ` +
      `${r.hex.padEnd(10)} ${String(r.ratio).padStart(5)}   ${r.passesAA ? 'ok' : 'FAIL'}`,
  );
}

const failing = rows.filter((r) => !r.passesAA);
lines.push('');
lines.push(`Tổng ${rows.length} cặp · không đạt AA: ${failing.length}`);
if (failing.length > 0) {
  lines.push('');
  lines.push('Baseline để dán vào test:');
  for (const r of failing) {
    lines.push(`  '${r.brand}|${r.token}|${r.surface}': ${r.ratio},`);
  }
}

const output = lines.join('\n');
console.log(output);
mkdirSync(path.join(repoRoot, '.design-audit'), { recursive: true });
writeFileSync(path.join(repoRoot, '.design-audit', 'token-contrast.txt'), output + '\n', 'utf8');
