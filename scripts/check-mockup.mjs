/* Kiểm tra nhanh bộ mockup "Quản lý dự án" sau khi sửa:
     1. mọi file .js trong assets parse được
     2. mọi đường dẫn màn hình (xx-ten.html) đều tồn tại
     3. mọi tên icon xuất hiện trong markup đều có trong pms-icons.js
     4. không còn luồng phê duyệt trong CODE (nhãn nút, nhãn menu, giá trị
        trạng thái, link màn duyệt) — phần văn bản giải thích "đã bỏ phê duyệt"
        thì được phép nhắc tới
   Dùng: node scripts/check-mockup.mjs                                        */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'projects', 'business', 'mockup');
const problems = [];

/* ── 1. parse từng file JS ─────────────────────────────────────────────── */
const jsFiles = readdirSync(join(DIR, 'assets')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  try { new vm.Script(readFileSync(join(DIR, 'assets', f), 'utf8'), { filename: f }); }
  catch (e) { problems.push('SYNTAX ' + f + ': ' + e.message); }
}

/* bảng icon, đọc thẳng từ file sinh ra (không cần DOM) */
const iconNames = new Set(
  [...readFileSync(join(DIR, 'assets', 'pms-icons.js'), 'utf8')
    .matchAll(/^\s{2}'([a-z0-9_\-]+)':\s*'</gm)].map((m) => m[1])
);

/* dấu vết luồng duyệt — chỉ bắt khi nằm trong code, không bắt trong văn bản */
const APPROVAL_PATTERNS = [
  /project-approval/,
  /label:\s*'(?:Gửi duyệt|Trình phê duyệt|Phê duyệt[^']*)'/,
  /okLabel:\s*'(?:Gửi phê duyệt|Trình phê duyệt)'/,
  /status:\s*'Chờ phê duyệt'/,
  /'Chờ phê duyệt'\s*[\],:)]/,
  /approveProject/,
  /phe-duyet/
];

const htmlFiles = readdirSync(DIR).filter((f) => f.endsWith('.html'));
const allSources = htmlFiles.map((f) => [f, readFileSync(join(DIR, f), 'utf8')])
  .concat(jsFiles.map((f) => [f, readFileSync(join(DIR, 'assets', f), 'utf8')]));

for (const [f, src] of allSources) {
  /* bỏ comment HTML (coverage report) để không soi vào tài liệu */
  const live = src.replace(/<!--[\s\S]*?-->/g, '');

  /* 2. đường dẫn màn hình, cả dạng href="" và dạng nối chuỗi trong JS */
  for (const m of live.matchAll(/(\d\d-[a-z-]+\.html)/g)) {
    if (!existsSync(join(DIR, m[1]))) problems.push('LINK HỎNG ' + f + ' → ' + m[1]);
  }

  /* 3. tên icon (bỏ qua chính file bảng icon) */
  if (f !== 'pms-icons.js') {
    for (const m of live.matchAll(/class="msym[^"]*"[^>]*>([a-z0-9_\-]+)</g)) {
      if (!iconNames.has(m[1])) problems.push('ICON THIẾU ' + f + ' → ' + m[1]);
    }
    for (const m of live.matchAll(/(?:okIcon|icon):\s*'([a-z0-9_\-]+)'/g)) {
      if (!iconNames.has(m[1])) problems.push('ICON THIẾU ' + f + ' → ' + m[1]);
    }
    /* icon chọn bằng ternary: ? 'a' : 'b' */
    for (const m of live.matchAll(/\?\s*'([a-z0-9_\-]+)'\s*:\s*'([a-z0-9_\-]+)'/g)) {
      [m[1], m[2]].forEach((n) => {
        if (iconNames.size && /_|^(check|flag|minus|list|code|eye|send|save)$/.test(n)
            && !iconNames.has(n) && /msym/.test(live)) {
          problems.push('ICON NGHI THIẾU ' + f + ' → ' + n);
        }
      });
    }
  }

  /* 4. luồng duyệt trong code */
  for (const re of APPROVAL_PATTERNS) {
    const hit = live.match(re);
    if (hit) problems.push('CÒN LUỒNG DUYỆT ' + f + ' → ' + hit[0]);
  }
}

console.log('File HTML: ' + htmlFiles.length + ' · file JS: ' + jsFiles.length
  + ' · icon có sẵn: ' + iconNames.size);
if (problems.length) {
  console.log('\n' + problems.length + ' vấn đề:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exitCode = 1;
} else {
  console.log('Không phát hiện vấn đề.');
}
