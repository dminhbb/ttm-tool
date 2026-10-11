#!/usr/bin/env node
/**
 * Cửa gate Task 1 — kiểm chứng một font có đủ glyph tiếng Việt hay không.
 *
 * Dùng:
 *   npm run ds:check-font                      # kiểm bộ Averta Std CY trong ias-design
 *   npm run ds:check-font -- <đường-dẫn>...    # kiểm font/thư mục bất kỳ
 *   npm run ds:check-font -- --verbose         # in bảng từng codepoint
 *
 * Vì sao cần: "Averta Std CY" là biến thể Cyrillic. Nếu nó thiếu khối Latin Extended
 * Additional (U+1EA0–U+1EF9) thì browser sẽ fallback THEO TỪNG GLYPH — chữ có dấu nhảy
 * sang font hệ thống, lệch chiều cao ngay trong cùng một từ. Lỗi này không hiện ở
 * console, chỉ thấy bằng mắt, và rất dễ bị bỏ qua khi review trên text tiếng Anh.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFontCharset, FontParseError } from '../src/lib/design-system/font-cmap.ts';
import {
  VIETNAMESE_CHARSET_GROUPS,
  VIETNAMESE_PANGRAM,
  checkVietnameseCoverage,
  formatCodepoint,
} from '../src/lib/design-system/vietnamese-charset.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 3 weight chủ lực của app — body (400), nhãn/tiêu đề (600), số liệu nhấn (700). */
const AVERTA_PRIMARY_WEIGHTS = [
  'Intelligent_Design_-_AvertaStdCY-Regular.otf',
  'Intelligent_Design_-_AvertaStdCY-Semibold.otf',
  'Intelligent_Design_-_AvertaStdCY-Bold.otf',
];

const DEFAULT_FONT_DIR = path.resolve(repoRoot, '..', 'ias-design', 'fonts');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const targets = args.filter((a) => !a.startsWith('--'));

async function resolveFontFiles() {
  if (targets.length === 0) {
    if (!existsSync(DEFAULT_FONT_DIR)) {
      throw new Error(
        `Không tìm thấy thư mục font mặc định: ${DEFAULT_FONT_DIR}\n` +
          'Truyền đường dẫn font cần kiểm: npm run ds:check-font -- <path>',
      );
    }
    return AVERTA_PRIMARY_WEIGHTS.map((f) => path.join(DEFAULT_FONT_DIR, f)).filter((f) =>
      existsSync(f),
    );
  }

  const files = [];
  for (const target of targets) {
    const resolved = path.resolve(target);
    const entries = await readdir(resolved, { withFileTypes: true }).catch(() => null);
    if (entries) {
      for (const entry of entries) {
        if (entry.isFile() && /\.(otf|ttf)$/i.test(entry.name)) {
          files.push(path.join(resolved, entry.name));
        }
      }
    } else {
      files.push(resolved);
    }
  }
  return files;
}

function printGroupSummary(charset) {
  console.log('  Phủ theo khối Unicode:');
  for (const group of VIETNAMESE_CHARSET_GROUPS) {
    const missing = group.codepoints.filter((cp) => !charset.has(cp));
    const total = group.codepoints.length;
    const mark = missing.length === 0 ? 'OK  ' : 'THIẾU';
    console.log(
      `    [${mark}] ${group.name.padEnd(26)} ${String(total - missing.length).padStart(3)}/${String(total).padEnd(3)}`,
    );
  }
}

function printVerboseTable(charset) {
  console.log('\n  codepoint | ký tự | có/không');
  console.log('  ----------|-------|---------');
  for (const group of VIETNAMESE_CHARSET_GROUPS) {
    for (const cp of group.codepoints) {
      const has = charset.has(cp);
      console.log(
        `  ${formatCodepoint(cp).padEnd(9)} |   ${String.fromCodePoint(cp)}   | ${has ? 'có' : 'KHÔNG'}`,
      );
    }
  }
}

/** Trang HTML tĩnh để xác nhận bằng mắt — fallback theo glyph chỉ thấy được khi render thật. */
async function writePreview(results, fontFiles) {
  const outDir = path.join(repoRoot, '.design-audit');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'font-vietnamese-preview.html');

  const faces = fontFiles
    .map((file, i) => {
      const weight = /Regular/i.test(file) ? 400 : /Semibold/i.test(file) ? 600 : 700;
      return `@font-face{font-family:"FontUnderTest";src:url("${path
        .relative(outDir, file)
        .split(path.sep)
        .join('/')}") format("opentype");font-weight:${weight};font-display:block}
/* weight ${weight} ← ${path.basename(file)} (#${i + 1}) */`;
    })
    .join('\n');

  const rows = results
    .map(
      (r) => `<tr><td>${r.file}</td><td>${r.familyName ?? '—'}</td><td>${r.cmapFormat}</td>
      <td class="${r.missing.length ? 'bad' : 'good'}">${r.coveragePercent}%</td>
      <td class="${r.missing.length ? 'bad' : 'good'}">${r.missing.length}</td></tr>`,
    )
    .join('\n');

  const samples = [400, 600, 700]
    .map(
      (w) => `<p class="sample" style="font-weight:${w}">
      <span class="w">${w}</span> ${VIETNAMESE_PANGRAM}</p>
    <p class="sample compare" style="font-weight:${w}">
      <span class="w">${w}</span> aaa àáâãăạảấầẩẫậ · ooo òóôõơọỏốồổỗộớờởỡợ · uuu ùúũưụủứừửữự · đĐ ỳỵỷỹý</p>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>Kiểm chứng glyph tiếng Việt — font under test</title>
<style>
${faces}
body{font-family:system-ui,sans-serif;background:#F4F6FA;color:#14142A;margin:0;padding:32px;line-height:1.5}
h1{font-size:20px;font-weight:700;margin:0 0 4px}
p.lead{color:#4E4B66;font-size:14px;margin:0 0 24px;max-width:70ch}
table{border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin-bottom:28px}
th{background:#F4F6FA;font-size:11px;font-weight:700;color:#6E7191;text-align:left;padding:12px 16px}
td{border:.5px solid #D9DBE9;padding:10px 16px;font-size:13px;color:#4E4B66}
.good{color:#00966D;font-weight:700}.bad{color:#C30052;font-weight:700}
.card{background:#fff;border:1px solid #D9DBE9;border-radius:12px;padding:20px 24px;margin-bottom:16px}
.card h2{font-size:14px;font-weight:600;color:#14142A;margin:0 0 12px}
.sample{font-family:"FontUnderTest","__NO_FALLBACK__";font-size:17px;margin:0 0 10px;color:#14142A}
.sample.compare{font-size:21px;letter-spacing:.2px;margin-bottom:18px}
.w{display:inline-block;min-width:38px;font-family:system-ui;font-size:11px;color:#A0A3BD}
.hint{font-size:12px;color:#6E7191;margin:0}
</style></head><body>
<h1>Kiểm chứng glyph tiếng Việt</h1>
<p class="lead">Nếu font THIẾU glyph, chữ có dấu sẽ render bằng font khác — biểu hiện là
chiều cao, độ đậm hoặc bề rộng nét lệch hẳn so với chữ không dấu ngay trong cùng một dòng.
Hãy soi các dòng so sánh bên dưới: <code>aaa</code> và <code>àáâãăạảấầẩẫậ</code> phải cùng một
kiểu chữ.</p>
<table><thead><tr><th>File</th><th>Family name</th><th>cmap</th><th>Phủ</th><th>Thiếu</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="card"><h2>Render thử — font under test</h2>
${samples}
<p class="hint">Family fallback đã cố tình đặt là một tên không tồn tại, nên mọi glyph
font không có sẽ rơi về font mặc định của browser và lộ ra rõ ràng.</p></div>
</body></html>`;

  await writeFile(outFile, html, 'utf8');
  return outFile;
}

async function main() {
  const fontFiles = await resolveFontFiles();
  if (fontFiles.length === 0) {
    console.error('Không tìm thấy file font nào để kiểm.');
    process.exit(1);
  }

  console.log('\n=== Task 1 — Cửa gate glyph tiếng Việt ===\n');

  const results = [];
  for (const file of fontFiles) {
    const label = path.basename(file);
    try {
      const data = await readFile(file);
      const { codepoints, cmapFormat, familyName } = readFontCharset(data);
      const coverage = checkVietnameseCoverage(codepoints);
      results.push({ file: label, familyName, cmapFormat, ...coverage });

      const verdict = coverage.missing.length === 0 ? 'ĐỦ' : `THIẾU ${coverage.missing.length} glyph`;
      console.log(`${label}`);
      console.log(
        `  family: ${familyName ?? '—'} | cmap format ${cmapFormat} | ${codepoints.size} glyph | ${coverage.coveragePercent}% → ${verdict}`,
      );
      printGroupSummary(codepoints);
      if (coverage.missing.length > 0) {
        const preview = coverage.missing
          .slice(0, 12)
          .map((cp) => `${formatCodepoint(cp)} ${String.fromCodePoint(cp)}`)
          .join(', ');
        console.log(
          `  Thiếu: ${preview}${coverage.missing.length > 12 ? ` … (+${coverage.missing.length - 12})` : ''}`,
        );
      }
      if (coverage.missingOptional.length > 0) {
        console.log(
          `  Nên có nhưng thiếu (không chặn): ${coverage.missingOptional.map(formatCodepoint).join(', ')}`,
        );
      }
      if (verbose) printVerboseTable(codepoints);
      console.log('');
    } catch (error) {
      const message = error instanceof FontParseError ? error.message : String(error);
      console.log(`${label}\n  LỖI ĐỌC FONT: ${message}\n`);
      results.push({
        file: label,
        familyName: null,
        cmapFormat: -1,
        missing: [],
        missingOptional: [],
        requiredTotal: 0,
        coveragePercent: 0,
        parseError: message,
      });
    }
  }

  const previewFile = await writePreview(results, fontFiles);

  const failed = results.filter((r) => r.parseError || r.missing.length > 0);
  console.log('─'.repeat(72));
  if (failed.length === 0) {
    console.log('VERDICT: ĐỦ — font phủ 100% bộ ký tự tiếng Việt bắt buộc ở mọi weight đã kiểm.');
    console.log('→ Chốt font này. Bước tiếp: convert OTF→WOFF2, subset Latin+Vietnamese,');
    console.log('  giữ 4 weight (400/500/600/700), nạp qua next/font/local.');
  } else {
    const worst = Math.max(...failed.map((r) => r.missing.length));
    console.log(`VERDICT: THIẾU — ${failed.length}/${results.length} weight không đủ glyph (tệ nhất: ${worst}).`);
    console.log('→ KHÔNG dùng font này cho body text. Chuyển sang Plus Jakarta Sans');
    console.log('  (ias-design tự khai báo là fallback hợp lệ, có Vietnamese subset)');
    console.log('  và xin bản Averta Std Latin-Vietnamese từ team brand.');
  }
  console.log(`\nXác nhận bằng mắt: ${previewFile}`);
  console.log('─'.repeat(72) + '\n');

  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
