#!/usr/bin/env node
/**
 * Codemod: đổi màu gõ tay và class bảng-màu-thô sang token IAS.
 *
 * Chạy:
 *   node scripts/codemod-ias-tokens.mjs --dry   # chỉ in thống kê, không ghi file
 *   node scripts/codemod-ias-tokens.mjs         # ghi file
 *
 * Vì sao dùng codemod thay vì sửa tay: nợ còn lại là 322 hex + 567 class palette thô
 * rải trên 22 file. Sửa tay vừa không khả thi vừa dễ bỏ sót; một bảng map tường minh
 * thì đọc review được và chạy lại được.
 *
 * ── PHẠM VI CÓ CHỦ ĐÍCH ─────────────────────────────────────────────────────
 *
 * CHỈ đổi màu nằm trong NGỮ CẢNH CSS:
 *   - class Tailwind arbitrary value:  text-[#1463f7] → text-[var(--color-text-brand)]
 *   - class bảng màu mặc định:         text-slate-500 → text-fb-text-placeholder
 *
 * KHÔNG đổi hex nằm trong chuỗi JS / thuộc tính SVG. Lý do: thuộc tính SVG không phải
 * CSS, nên `fill="var(--x)"` KHÔNG resolve — phải đổi qua `style={{ fill }}` hoặc class,
 * tức là sửa cấu trúc chứ không phải thay chuỗi. Những chỗ đó để lại cho việc sửa tay
 * theo từng màn hình (FunnelLayers, DonutChartCard PALETTE, conic-gradient…).
 *
 * ── SÀN CHỮ: 11px, KHÔNG PHẢI 12px ──────────────────────────────────────────
 *
 * Type scale của IAS có Caption 12px là bậc nhỏ nhất cho chữ TỰ ĐẶT, nhưng spec
 * COMPONENT của chính IAS dùng 11px ở ba chỗ: header bảng (11px/700), Badge size
 * medium (11px), status pill (11px). Vì vậy sàn cứng là 11px.
 *
 * Ép 127 chỗ `text-[11px]` lên 12px sẽ làm mỗi ô bảng rộng thêm, tức TÁI SINH đúng
 * lỗi tràn mà cả đợt này đang đi sửa. Việc nâng các NHÃN (ngoài bảng) lên Caption
 * 12px là việc theo từng màn hình, không làm bằng regex.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(repoRoot, 'src');
const dryRun = process.argv.includes('--dry');

/* ════════════════════════════════════════════════════════════════════════════
   File KHÔNG chạm — kèm lý do
   ════════════════════════════════════════════════════════════════════════════ */
const SKIP_FILES = new Set([
  // Swatch xem trước của từng brand: phải là màu THẬT của brand đó, hiển thị đúng
  // ngay cả khi người dùng đang ở brand khác. Token sẽ ra màu brand hiện tại cho cả 4 ô.
  'components/settings/AppearancePanel.tsx',
  // HTML trang consent OAuth render phía server dưới dạng chuỗi, không qua CSS của app.
  'app/api/mcp/oauth/authorize/route.ts',
  'app/api/mcp/oauth/consent/route.ts',
  // Sinh ảnh captcha trên canvas — màu là tham số vẽ ảnh, không phải CSS.
  'lib/captcha-service.ts',
  // AGENTS.md: icon `Checks` ở cột R4Golive/Released phải là màu ĐEN #000000.
  'components/ui/TtmBlackListDot.tsx',
  // Chip trên nền tối (bg-emerald-950/40, text-amber-400, bg-blue-900/40). Map sang
  // token mặt sáng sẽ phá tương phản. Để sửa tay cùng lúc làm lại panel này.
  'components/visit-counter/VisitCounterPanel.tsx',
]);

/* ════════════════════════════════════════════════════════════════════════════
   1. Hex trong class Tailwind arbitrary value

   Chỉ ánh xạ những hex mà ý định dùng đã rõ từ chính giá trị. Hex không có trong
   bảng này thì GIỮ NGUYÊN và được đếm vào phần còn lại để sửa tay.
   ════════════════════════════════════════════════════════════════════════════ */
const HEX_TO_TOKEN = {
  // ── Xanh "đang chọn / nhấn" của các màn Epic. Chiếm 144/322 hex của toàn bộ src.
  '#1463f7': '--color-text-brand',
  '#2563eb': '--color-text-brand',
  '#0284c7': '--color-text-brand',
  '#1d4ed8': '--color-primary-700',
  '#0369a1': '--color-primary-700',
  '#0d47a1': '--color-primary-700',
  '#dbeafe': '--color-primary-100',
  '#e0f2fe': '--color-primary-100',
  '#eaf0ff': '--color-primary-100',
  '#00b4d8': '--color-info-500',

  // ── Tím → accent violet của IAS
  '#7c3aed': '--color-accent-500',

  // ── Xanh lá. Dùng bậc -300 (#0B7659) cho MÀU CHỮ vì --color-text-success
  //    (#00966D) chỉ đạt 3.76:1 trên nền trắng — xem docs/design/IAS-DESIGN-ADOPTION.md §9.
  '#059669': '--color-success-300',
  '#047857': '--color-success-300',
  '#15803d': '--color-success-300',
  '#2e7d32': '--color-success-300',
  '#1b6b3e': '--color-success-300',
  '#175b26': '--color-success-300',
  '#689f38': '--color-success-300',
  '#e8f5ea': '--color-bg-success',
  '#e6f4ea': '--color-bg-success',
  '#cfe8d6': '--color-bg-success',

  // ── Vàng/cam → warning
  '#d97706': '--color-warning-400',
  '#b45309': '--color-text-warning',
  '#7a5200': '--color-text-warning',
  '#78350f': '--color-text-warning',
  '#8b4513': '--color-text-warning',
  '#f0c36d': '--color-warning-300',
  '#fcd34d': '--color-warning-300',
  '#f5d46b': '--color-warning-300',
  '#fff7e6': '--color-bg-warning',
  '#fffbeb': '--color-bg-warning',
  '#fef3c7': '--color-bg-warning',

  // ── Đỏ/hồng → error
  '#dc2626': '--color-text-error',
  '#b91c1c': '--color-text-error',
  '#be123c': '--color-text-error',
  '#e11d48': '--color-bg-error-solid',
  '#ff4d4f': '--color-bg-error-solid',
  '#f3b3b3': '--color-error-300',
  '#ffe4e6': '--color-bg-error',

  // ── Neutral
  '#0f172a': '--color-text-primary',
  '#334155': '--color-neutral-700',
  '#475569': '--color-neutral-700',
  '#64748b': '--color-text-secondary',
  '#8a93a6': '--color-text-secondary',
  '#6b7280': '--color-text-secondary',
  '#94a3b8': '--color-text-muted',
  '#c3cce3': '--color-border-default',
  '#e2e8f0': '--color-border-default',
  '#d9e3ef': '--color-border-default',
  '#f8fafc': '--color-bg-page',
  '#f0f3f1': '--color-bg-page',
  '#f4f4f2': '--color-bg-page',
  '#1f2430': '--color-text-primary',
  '#1c2230': '--color-text-primary',

  // ── Tông riêng của KPI card trong DashboardInsights
  '#b3cbf1': '--color-primary-200',
  '#d6e4fa': '--color-primary-100',
  '#7aa5ea': '--color-primary-300',
  '#1e3a8a': '--color-primary-700',
  '#d5d9df': '--color-border-default',
  '#eef0f2': '--color-bg-page',
};

/* ════════════════════════════════════════════════════════════════════════════
   2. Class bảng màu mặc định của Tailwind → class token

   Map theo VAI TRÒ chứ không theo sắc độ: mọi bậc xám đậm dùng làm chữ đều về
   --text-primary, mọi bậc xám nhạt dùng làm viền đều về --border-default, v.v.
   Thang 50-950 của Tailwind mịn hơn thang 4 bậc của IAS, nên việc gộp bậc là
   KHÔNG THỂ TRÁNH — và đó chính là mục đích: app đang dùng 142 giá trị riêng biệt
   cho một hệ thống chỉ có 4 bậc chữ và 3 bậc viền.
   ════════════════════════════════════════════════════════════════════════════ */
const PALETTE_TO_TOKEN = {
  // ── Chữ: 4 bậc của IAS
  'text-slate-950': 'text-fb-text-primary',
  'text-slate-900': 'text-fb-text-primary',
  'text-slate-800': 'text-fb-text-primary',
  'text-gray-900': 'text-fb-text-primary',
  'text-gray-800': 'text-fb-text-primary',
  'text-zinc-900': 'text-fb-text-primary',
  'text-neutral-900': 'text-fb-text-primary',
  'text-slate-700': 'text-fb-text-secondary',
  'text-slate-600': 'text-fb-text-secondary',
  'text-gray-700': 'text-fb-text-secondary',
  'text-gray-600': 'text-fb-text-secondary',
  'text-slate-500': 'text-fb-text-placeholder',
  'text-slate-400': 'text-fb-text-placeholder',
  'text-slate-300': 'text-fb-text-placeholder',
  'text-gray-500': 'text-fb-text-placeholder',
  'text-gray-400': 'text-fb-text-placeholder',

  // ── Viền: IAS chỉ có default / strong
  'border-slate-400': 'border-fb-border',
  'border-slate-300': 'border-fb-border',
  'border-slate-200': 'border-fb-border',
  'border-slate-100': 'border-fb-border',
  'border-gray-400': 'border-fb-border',
  'border-gray-300': 'border-fb-border',
  'border-gray-200': 'border-fb-border',
  'border-slate-900': 'border-fb-border-strong',
  'border-slate-700': 'border-fb-border-strong',
  'divide-gray-300': 'divide-fb-border',
  'divide-gray-200': 'divide-fb-border',
  'divide-slate-200': 'divide-fb-border',
  'decoration-slate-400': 'decoration-fb-border',

  // ── Nền trung tính
  'bg-slate-50': 'bg-fb-surface-muted',
  'bg-slate-100': 'bg-fb-surface-muted',
  'bg-gray-50': 'bg-fb-surface-muted',
  'bg-gray-100': 'bg-fb-surface-muted',
  'bg-slate-200': 'bg-fb-control-hover',
  'bg-slate-300': 'bg-fb-control-hover',
  'bg-slate-500': 'bg-fb-text-placeholder',
  'bg-slate-600': 'bg-fb-text-secondary',
  'bg-slate-700': 'bg-fb-text-secondary',
  'bg-slate-800': 'bg-fb-text-primary',
  'bg-slate-900': 'bg-fb-text-primary',

  // ── Brand blue (gồm cả sky/indigo/cyan vì app dùng lẫn lộn cho cùng một vai trò)
  'text-blue-900': 'text-fb-blue',
  'text-blue-800': 'text-fb-blue',
  'text-blue-700': 'text-fb-blue',
  'text-blue-600': 'text-fb-blue',
  'text-blue-400': 'text-fb-blue',
  'text-blue-300': 'text-fb-blue',
  'text-sky-950': 'text-fb-blue',
  'text-sky-800': 'text-fb-blue',
  'text-sky-700': 'text-fb-blue',
  'text-sky-600': 'text-fb-blue',
  'text-indigo-950': 'text-fb-blue',
  'text-indigo-800': 'text-fb-blue',
  'text-cyan-800': 'text-fb-blue',
  'bg-blue-50': 'bg-fb-blue-soft',
  'bg-blue-100': 'bg-fb-blue-soft',
  'bg-blue-200': 'bg-fb-blue-soft',
  'bg-sky-50': 'bg-fb-blue-soft',
  'bg-indigo-50': 'bg-fb-blue-soft',
  'bg-cyan-100': 'bg-fb-blue-soft',
  'bg-blue-600': 'bg-fb-blue',
  'bg-blue-700': 'bg-fb-blue',
  'bg-sky-700': 'bg-fb-blue',
  'border-blue-800': 'border-fb-blue',
  'border-blue-700': 'border-fb-blue',
  'border-blue-300': 'border-fb-blue',
  'border-blue-200': 'border-fb-blue',
  'border-sky-200': 'border-fb-blue',
  'border-indigo-200': 'border-fb-blue',
  'ring-blue-400': 'ring-fb-blue',
  'ring-blue-300': 'ring-fb-blue',

  // ── Accent violet
  'text-purple-900': 'text-fb-accent',
  'text-purple-700': 'text-fb-accent',
  'text-purple-600': 'text-fb-accent',
  'text-violet-600': 'text-fb-accent',
  'bg-purple-50': 'bg-fb-accent-soft',
  'bg-purple-100': 'bg-fb-accent-soft',
  'bg-purple-600': 'bg-fb-accent',
  'border-purple-700': 'border-fb-accent',
  'border-purple-400': 'border-fb-accent',
  'border-purple-300': 'border-fb-accent',
  'border-purple-200': 'border-fb-accent',

  // ── Success (emerald/green/teal cùng vai trò trong app)
  'text-emerald-950': 'text-status-success',
  'text-emerald-800': 'text-status-success',
  'text-emerald-700': 'text-status-success',
  'text-emerald-600': 'text-status-success',
  'text-emerald-500': 'text-status-success',
  'text-emerald-400': 'text-status-success',
  'text-teal-700': 'text-status-success',
  'text-teal-950': 'text-status-success',
  'text-teal-800': 'text-status-success',
  'text-green-700': 'text-status-success',
  'text-green-600': 'text-status-success',
  'bg-emerald-50': 'bg-status-success-soft',
  'bg-teal-50': 'bg-status-success-soft',
  'bg-green-50': 'bg-status-success-soft',
  'bg-emerald-500': 'bg-status-success',
  'bg-emerald-600': 'bg-status-success',
  'bg-emerald-700': 'bg-status-success',
  'bg-teal-500': 'bg-status-success',
  'bg-teal-600': 'bg-status-success',
  'bg-teal-700': 'bg-status-success',
  'border-emerald-400': 'border-status-success',
  'border-emerald-200': 'border-status-success',
  'border-teal-200': 'border-status-success',

  // ── Warning
  'text-amber-950': 'text-status-warning',
  'text-amber-900': 'text-status-warning',
  'text-amber-800': 'text-status-warning',
  'text-amber-700': 'text-status-warning',
  'text-amber-600': 'text-status-warning',
  'text-amber-400': 'text-status-warning',
  'text-amber-300': 'text-status-warning',
  'text-yellow-700': 'text-status-warning',
  'text-orange-700': 'text-status-warning',
  'bg-amber-50': 'bg-status-warning-soft',
  'bg-amber-100': 'bg-status-warning-soft',
  'bg-yellow-50': 'bg-status-warning-soft',
  'bg-amber-500': 'bg-status-warning',
  'bg-amber-600': 'bg-status-warning',
  'bg-amber-700': 'bg-status-warning',
  'border-amber-600': 'border-status-warning',
  'border-amber-400': 'border-status-warning',
  'border-amber-300': 'border-status-warning',
  'border-amber-200': 'border-status-warning',

  // ── Error
  'text-red-700': 'text-status-danger',
  'text-red-600': 'text-status-danger',
  'text-red-500': 'text-status-danger',
  'text-rose-950': 'text-status-danger',
  'text-rose-800': 'text-status-danger',
  'text-rose-700': 'text-status-danger',
  'text-rose-600': 'text-status-danger',
  'bg-red-50': 'bg-status-danger-soft',
  'bg-rose-50': 'bg-status-danger-soft',
  'bg-red-500': 'bg-status-danger',
  'bg-rose-600': 'bg-status-danger',
  'bg-rose-700': 'bg-status-danger',
  'border-red-600': 'border-status-danger',
  'border-red-500': 'border-status-danger',
  'border-red-400': 'border-status-danger',
  'border-red-200': 'border-status-danger',
  'border-rose-300': 'border-status-danger',
  'border-rose-200': 'border-status-danger',
};

/* ════════════════════════════════════════════════════════════════════════════
   3. Cỡ chữ dưới sàn 11px → 11px. Xem ghi chú "SÀN CHỮ" ở đầu file.
   ════════════════════════════════════════════════════════════════════════════ */
const SUB_FLOOR_TYPE = {
  'text-[8px]': 'text-[11px]',
  'text-[8.5px]': 'text-[11px]',
  'text-[9px]': 'text-[11px]',
  'text-[9.5px]': 'text-[11px]',
  'text-[10px]': 'text-[11px]',
  'text-[10.5px]': 'text-[11px]',
};

/* ════════════════════════════════════════════════════════════════════════════ */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'fonts' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Tên thuộc tính CSS đứng trước `-[#hex]` trong một class Tailwind arbitrary value. */
const CSS_PROPERTY_PREFIX =
  '(?:text|bg|border|border-[trbl]|ring|ring-offset|outline|fill|stroke|divide|decoration|caret|accent|placeholder|shadow|from|via|to)';
/** Modifier đứng trước, ví dụ `hover:`, `focus:`, `lg:`, `group-hover:`, `data-[x]:`. */
const MODIFIER = '(?:[a-z-]+(?:\\[[^\\]]*\\])?:)*';

const stats = {
  hexClass: new Map(),
  palette: new Map(),
  subFloor: new Map(),
  hexSkipped: new Map(),
};

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function transform(content) {
  let next = content;

  // 1. Hex trong class arbitrary value → var(--token).
  //    Regex yêu cầu có tiền tố thuộc tính CSS, nên hex trong chuỗi JS thuần
  //    (`'#1463f7'`, `fill="#059669"`) KHÔNG khớp và được giữ nguyên.
  next = next.replace(
    new RegExp(`(${MODIFIER}${CSS_PROPERTY_PREFIX})-\\[(#[0-9a-fA-F]{6})\\]`, 'g'),
    (whole, prefix, hex) => {
      const token = HEX_TO_TOKEN[hex.toLowerCase()];
      if (!token) {
        bump(stats.hexSkipped, hex.toLowerCase());
        return whole;
      }
      bump(stats.hexClass, `${hex.toLowerCase()} → ${token}`);
      return `${prefix}-[var(${token})]`;
    },
  );

  // 2. Class bảng màu thô → class token. Giữ nguyên modifier đứng trước và
  //    opacity modifier `/NN` đứng sau (`bg-red-50/30` → `bg-status-danger-soft/30`).
  for (const [from, to] of Object.entries(PALETTE_TO_TOKEN)) {
    const pattern = new RegExp(`(^|[\\s'"\`:])((?:[a-z-]+:)*)${from}(\\/\\d{1,3})?\\b`, 'g');
    next = next.replace(pattern, (whole, lead, modifier, opacity) => {
      bump(stats.palette, `${from} → ${to}`);
      return `${lead}${modifier}${to}${opacity ?? ''}`;
    });
  }

  // 3. Cỡ chữ dưới sàn.
  for (const [from, to] of Object.entries(SUB_FLOOR_TYPE)) {
    const pattern = new RegExp(from.replace(/[[\]]/g, '\\$&'), 'g');
    next = next.replace(pattern, () => {
      bump(stats.subFloor, `${from} → ${to}`);
      return to;
    });
  }

  return next;
}

const files = walk(srcDir).filter((f) => !f.includes(`${path.sep}design-system${path.sep}`));
const changed = [];

for (const file of files) {
  const rel = path.relative(srcDir, file).split(path.sep).join('/');
  if (SKIP_FILES.has(rel)) continue;

  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) continue;

  changed.push(rel);
  if (!dryRun) writeFileSync(file, after, 'utf8');
}

function renderStats(title, map) {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const lines = [`\n### ${title} — ${total} lần, ${map.size} luật\n`];
  for (const [key, count] of [...map].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${String(count).padStart(4)}  ${key}`);
  }
  return lines.join('\n');
}

const report = [
  dryRun ? '=== DRY RUN — không ghi file ===' : '=== ĐÃ GHI FILE ===',
  renderStats('hex trong class → token', stats.hexClass),
  renderStats('class palette thô → token', stats.palette),
  renderStats('cỡ chữ dưới sàn 11px → 11px', stats.subFloor),
  renderStats('hex trong class KHÔNG có trong bảng map (giữ nguyên, sửa tay)', stats.hexSkipped),
  `\n### File bị đổi — ${changed.length}\n`,
  ...changed.map((f) => `  ${f}`),
].join('\n');

console.log(report);
mkdirSync(path.join(repoRoot, '.design-audit'), { recursive: true });
writeFileSync(path.join(repoRoot, '.design-audit', 'codemod-report.txt'), report + '\n', 'utf8');
