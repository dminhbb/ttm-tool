/* ============================================================================
   Sinh assets/pms-icons.js cho mockup "Quản lý dự án".

   Vì sao cần script này:
     Mockup trước đây nạp Material Symbols Outlined từ Google Fonts. Khi mở file
     HTML trong môi trường không có internet (hoặc Google Fonts bị chặn), font
     không về được và trình duyệt render NGUYÊN TÊN LIGATURE thành chữ:
     "search", "tune", "file_download", "keyboard_double_arrow_right"… đè lên
     nội dung. Đó là lý do bản mockup trông vỡ.

   Cách giải quyết:
     Trích path SVG thật từ @phosphor-icons/react (đã có trong node_modules,
     đúng chuẩn icon của dự án theo AGENTS.md) rồi ghi ra một file JS tĩnh.
     Mockup từ đó render icon bằng inline SVG — không phụ thuộc mạng.

   Chạy lại khi cần thêm icon:  node scripts/gen-mockup-icons.mjs
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFS = join(ROOT, 'node_modules', '@phosphor-icons', 'react', 'dist', 'defs');
const OUT = join(ROOT, 'projects', 'business', 'mockup', 'assets', 'pms-icons.js');

/* Tên icon dùng trong mockup → tên component Phosphor.
   Giữ nguyên key cũ (kiểu Material) để không phải sửa 10 file HTML. */
const MAP = {
  /* điều hướng & khung */
  dashboard: 'Gauge',
  folder_open: 'FolderOpen',
  folder_copy: 'Folders',
  folder_off: 'FolderDashed',
  checklist: 'ListChecks',
  bar_chart: 'ChartBar',
  category: 'SquaresFour',
  admin_panel_settings: 'ShieldCheck',
  settings: 'GearSix',
  arrow_back: 'ArrowLeft',
  arrow_forward: 'ArrowRight',
  arrow_drop_down: 'CaretDown',
  expand_less: 'CaretUp',
  expand_more: 'CaretDown',
  chevron_left: 'CaretLeft',
  chevron_right: 'CaretRight',
  keyboard_double_arrow_right: 'CaretDoubleRight',
  fiber_manual_record: 'Circle',
  unfold_more: 'ArrowsOutLineVertical',
  unfold_less: 'ArrowsInLineVertical',
  open_in_full: 'ArrowsOutSimple',
  open_in_new: 'ArrowSquareOut',
  close: 'X',
  list: 'List',
  more_vert: 'DotsThreeVertical',
  more_horiz: 'DotsThree',
  'dots-three': 'DotsThree',

  /* hành động */
  search: 'MagnifyingGlass',
  tune: 'SlidersHorizontal',
  add: 'Plus',
  save: 'FloppyDisk',
  send: 'PaperPlaneTilt',
  delete: 'Trash',
  delete_sweep: 'Eraser',
  filter_alt_off: 'FunnelX',
  file_download: 'DownloadSimple',
  history: 'ClockCounterClockwise',
  attach_file: 'Paperclip',
  link: 'LinkSimple',
  check: 'Check',
  minus: 'Minus',
  remove: 'Minus',
  block: 'Prohibit',

  /* trạng thái & cảnh báo */
  info: 'Info',
  warning: 'Warning',
  error: 'WarningCircle',
  check_circle: 'CheckCircle',
  schedule: 'Clock',
  event_busy: 'CalendarX',
  hourglass_top: 'Hourglass',
  local_fire_department: 'Fire',
  trending_up: 'TrendUp',
  insights: 'ChartLineUp',
  fact_check: 'ClipboardText',
  groups: 'UsersThree',
  account_balance_wallet: 'Wallet',
  chat_bubble: 'ChatCircleText',
  chat: 'ChatCircleText',
  flag: 'Flag',
  code: 'Code',

  /* giai đoạn dự án (mock-data.js dùng sẵn tên Phosphor) */
  'compass-tool': 'CompassTool',
  'test-tube': 'TestTube',
  'rocket-launch': 'RocketLaunch',
  'seal-check': 'SealCheck',

  /* mới thêm cho bản thiết kế danh mục dự án */
  'squares-four': 'SquaresFour',
  'chart-donut': 'ChartDonut',
  'users-three': 'UsersThree',
  'calendar-blank': 'CalendarBlank',
  'arrow-u-up-left': 'ArrowUUpLeft',
  'columns-plus-right': 'Columns',
  'note-pencil': 'NotePencil',
  'file-text': 'FileText',
  pencil: 'PencilSimple',
  eye: 'Eye'
};

/* Icon cần thêm bản fill (dùng cho .msym.fill — nav active, bullet…) */
const WITH_FILL = new Set([
  'fiber_manual_record', 'dashboard', 'folder_open', 'checklist', 'bar_chart',
  'category', 'admin_panel_settings', 'check_circle', 'warning', 'error', 'info',
  'local_fire_department', 'flag', 'seal-check', 'squares-four'
]);

/** lấy markup SVG của 1 variant trong file defs của Phosphor */
function variantMarkup(componentName, variant) {
  const file = join(DEFS, componentName + '.es.js');
  if (!existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');

  /* file defs là 1 Map: [ "regular", <JSX đã compile trên một dòng> ] */
  const entries = [...src.matchAll(/\[\s*\n\s*"(\w+)",\n([\s\S]*?)\n\s*\]/g)];
  const hit = entries.find((m) => m[1] === variant);
  if (!hit) return null;

  const body = hit[2];
  let out = '';
  for (const el of body.matchAll(/createElement\("(\w+)",\s*\{([^}]*)\}/g)) {
    const tag = el[1];
    const attrs = [...el[2].matchAll(/(\w+):\s*"([^"]*)"/g)]
      .map((a) => a[1] + '="' + a[2] + '"')
      .join(' ');
    out += '<' + tag + (attrs ? ' ' + attrs : '') + '/>';
  }
  return out || null;
}

const regular = {};
const fill = {};
const missing = [];

for (const [key, component] of Object.entries(MAP)) {
  const r = variantMarkup(component, 'regular');
  if (!r) { missing.push(key + ' → ' + component); continue; }
  regular[key] = r;
  if (WITH_FILL.has(key)) {
    const f = variantMarkup(component, 'fill');
    if (f) fill[key] = f;
  }
}

if (missing.length) {
  console.error('Không tìm thấy icon Phosphor cho:\n  ' + missing.join('\n  '));
  process.exitCode = 1;
}

const stringify = (obj) => Object.keys(obj).sort()
  .map((k) => "  '" + k + "': '" + obj[k].replace(/'/g, "\\'") + "'")
  .join(',\n');

const out = `/* ============================================================================
   PMS Mockup — ICON LAYER (offline)

   File này được SINH TỰ ĐỘNG bởi scripts/gen-mockup-icons.mjs từ
   @phosphor-icons/react trong node_modules. Đừng sửa tay — sửa MAP trong
   script rồi chạy lại:  node scripts/gen-mockup-icons.mjs

   Lý do tồn tại: mockup trước đây nạp Material Symbols từ Google Fonts, nên khi
   mở offline font không về và trình duyệt in nguyên tên ligature ("search",
   "tune", "keyboard_double_arrow_right"…) thành chữ đè lên bảng. Giờ icon là
   inline SVG, không gọi mạng.

   Cách dùng (không đổi so với trước): <span class="msym">search</span>
   Kích thước điều khiển bằng font-size như cũ; thêm class .fill để lấy bản đặc.
   ========================================================================== */

const PMSIcons = (function () {

  const REGULAR = {
${stringify(regular)}
  };

  const FILL = {
${stringify(fill)}
  };

  function markup(name, filled) {
    const body = (filled && FILL[name]) || REGULAR[name] || null;
    if (!body) return null;
    return '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">'
      + body + '</svg>';
  }

  /** biến 1 <span class="msym">ten_icon</span> thành inline SVG */
  function paint(span) {
    const name = (span.textContent || '').trim();
    /* span đã vẽ rồi thì textContent rỗng (chỉ còn <svg>) → không làm gì */
    if (!name) return;
    const svg = markup(name, span.classList.contains('fill'));
    span.dataset.icon = name;
    /* thiếu mapping thì để ô trống, tuyệt đối không in tên icon ra giao diện */
    span.innerHTML = svg || '';
    if (!svg && window.console) console.warn('[PMSIcons] chưa map icon:', name);
  }

  function sweep(root) {
    (root || document).querySelectorAll('span.msym').forEach(paint);
  }

  function handle(node) {
    if (!node) return;
    if (node.nodeType === 3) node = node.parentNode;
    if (!node || node.nodeType !== 1) return;
    if (node.classList && node.classList.contains('msym')) { paint(node); return; }
    if (node.querySelectorAll) node.querySelectorAll('span.msym').forEach(paint);
  }

  /* Nội dung mockup được render bằng JS sau khi script này chạy, nên theo dõi
     DOM thay vì chỉ quét một lần. Có chỗ đổi icon bằng cách gán textContent
     (pms-detail.js, gantt.js) nên phải bắt cả characterData và chính target. */
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { handle(m.target); continue; }
      m.addedNodes.forEach(handle);
      handle(m.target);
    }
  }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sweep());
  } else {
    sweep();
  }

  return { markup, sweep, has: (n) => !!REGULAR[n] };
})();
`;

writeFileSync(OUT, out, 'utf8');
console.log('Đã ghi ' + OUT);
console.log('regular: ' + Object.keys(regular).length + ' icon · fill: ' + Object.keys(fill).length + ' icon');
