#!/usr/bin/env node
/**
 * Liệt kê các GIÁ TRỊ MÀU riêng biệt đang dùng trong src/, kèm số lần và file.
 *
 * Dùng để dựng bảng map cho codemod (scripts/codemod-ias-tokens.mjs): phải biết
 * chính xác tập hex và tập class palette thô đang tồn tại, thay vì đoán.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(repoRoot, 'src');

const RAW_PALETTE_HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
];
const RAW_PALETTE_PREFIXES = [
  'text', 'bg', 'border', 'ring', 'from', 'via', 'to', 'fill', 'stroke',
  'divide', 'outline', 'shadow', 'accent', 'decoration', 'caret', 'placeholder',
];
const RAW_PALETTE_PATTERN = new RegExp(
  `\\b(?:${RAW_PALETTE_PREFIXES.join('|')})-(?:${RAW_PALETTE_HUES.join('|')})-\\d{2,3}(?:\\/\\d{1,3})?\\b`,
  'g',
);

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'fonts') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(srcDir).filter(
  (f) => !f.includes('__tests__') && !f.includes(`${path.sep}design-system${path.sep}`),
);

const hex = new Map();
const palette = new Map();
const smallType = new Map();

for (const file of files) {
  const rel = path.relative(srcDir, file).split(path.sep).join('/');
  const content = stripComments(readFileSync(file, 'utf8'));

  for (const m of content.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const key = m[0].toLowerCase();
    if (!hex.has(key)) hex.set(key, { count: 0, files: new Set() });
    hex.get(key).count += 1;
    hex.get(key).files.add(rel);
  }
  for (const m of content.matchAll(RAW_PALETTE_PATTERN)) {
    if (!palette.has(m[0])) palette.set(m[0], { count: 0, files: new Set() });
    palette.get(m[0]).count += 1;
    palette.get(m[0]).files.add(rel);
  }
  for (const m of content.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    if (Number(m[1]) >= 12) continue;
    if (!smallType.has(m[0])) smallType.set(m[0], { count: 0, files: new Set() });
    smallType.get(m[0]).count += 1;
    smallType.get(m[0]).files.add(rel);
  }
}

function render(title, map) {
  const lines = [`\n### ${title} — ${map.size} giá trị riêng biệt\n`];
  for (const [value, info] of [...map].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(
      `  ${String(info.count).padStart(4)}  ${value.padEnd(24)} ${[...info.files].slice(0, 3).join(' ')}${info.files.size > 3 ? ` (+${info.files.size - 3})` : ''}`,
    );
  }
  return lines.join('\n');
}

const output = [
  render('hex literal', hex),
  render('class palette thô', palette),
  render('cỡ chữ dưới sàn 12px', smallType),
].join('\n');

console.log(output);
mkdirSync(path.join(repoRoot, '.design-audit'), { recursive: true });
writeFileSync(path.join(repoRoot, '.design-audit', 'distinct-colors.txt'), output + '\n', 'utf8');
