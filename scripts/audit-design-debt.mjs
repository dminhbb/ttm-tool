#!/usr/bin/env node
/**
 * Đo nợ kỹ thuật thiết kế còn lại trong src/, sinh baseline cho các test lint.
 *
 * Bốn nhóm:
 *   1. chữ dưới sàn 12px  — `text-[Npx]` với N<12, và `clamp(Npx, …)` dùng cho font-size
 *   2. hex literal        — màu gõ tay thay vì token
 *   3. rgb()/rgba() literal
 *   4. class palette thô  — `text-slate-*`, `bg-blue-*`, `border-amber-*`, …
 *
 * Chạy: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/audit-design-debt.mjs
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(repoRoot, 'src');

/** Bảng màu mặc định của Tailwind — dùng trực tiếp là bỏ qua tầng token. */
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
  `\\b(?:${RAW_PALETTE_PREFIXES.join('|')})-(?:${RAW_PALETTE_HUES.join('|')})-\\d{2,3}\\b`,
  'g',
);

/**
 * Bỏ comment trước khi đo — một mã hex được NHẮC TỚI trong ghi chú không phải quyết
 * định tạo kiểu. Giữ khớp với stripComments() trong
 * src/lib/design-system/__tests__/design-debt.test.ts.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

const MEASURES = {
  /**
   * Sàn CỨNG là 11px, không phải 12px.
   *
   * Type scale của IAS có Caption 12px là bậc nhỏ nhất cho chữ TỰ ĐẶT, nhưng spec
   * COMPONENT của chính IAS dùng 11px ở ba chỗ: header bảng (11px/700), Badge size
   * medium (11px), status pill (11px). Nên 11px là hợp lệ, dưới 11px thì không.
   *
   * Việc nâng các NHÃN ngoài bảng từ 11px lên Caption 12px là việc theo từng màn
   * hình — làm hàng loạt bằng regex sẽ nới mỗi ô bảng ra một chút và tái sinh đúng
   * lỗi tràn mà cả đợt này đi sửa.
   */
  subFloorType: (content) => {
    const hits = [];
    for (const m of content.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (Number(m[1]) < 11) hits.push(m[0]);
    }
    for (const m of content.matchAll(/clamp\(\s*(\d+(?:\.\d+)?)px/g)) {
      if (Number(m[1]) < 11) hits.push(m[0]);
    }
    return hits;
  },
  hexLiteral: (content) => [...content.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]),
  rgbLiteral: (content) => [...content.matchAll(/\brgba?\([^)]*\)/g)].map((m) => m[0]),
  rawPalette: (content) => [...content.matchAll(RAW_PALETTE_PATTERN)].map((m) => m[0]),
};

function walk(dir, extensions) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'fonts') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const sourceFiles = walk(srcDir, ['.tsx', '.ts']).filter(
  (f) => !f.includes('__tests__') && !f.includes(`${path.sep}design-system${path.sep}`),
);

const report = {};
for (const [measureName, measure] of Object.entries(MEASURES)) {
  const perFile = [];
  for (const file of sourceFiles) {
    const hits = measure(stripComments(readFileSync(file, 'utf8')));
    if (hits.length > 0) {
      perFile.push({
        file: path.relative(srcDir, file).split(path.sep).join('/'),
        count: hits.length,
        sample: [...new Set(hits)].slice(0, 4),
      });
    }
  }
  perFile.sort((a, b) => b.count - a.count);
  report[measureName] = perFile;
}

const lines = [];
for (const [measureName, perFile] of Object.entries(report)) {
  const total = perFile.reduce((sum, r) => sum + r.count, 0);
  lines.push('');
  lines.push(`### ${measureName} — ${total} chỗ / ${perFile.length} file`);
  lines.push('');
  for (const r of perFile) {
    lines.push(`  ${String(r.count).padStart(4)}  ${r.file.padEnd(58)} ${r.sample.join(' ')}`);
  }
  lines.push('');
  lines.push('  Baseline:');
  for (const r of perFile) lines.push(`    '${r.file}': ${r.count},`);
}

const output = lines.join('\n');
console.log(output);
mkdirSync(path.join(repoRoot, '.design-audit'), { recursive: true });
writeFileSync(path.join(repoRoot, '.design-audit', 'design-debt.txt'), output + '\n', 'utf8');
writeFileSync(
  path.join(repoRoot, '.design-audit', 'design-debt.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);
