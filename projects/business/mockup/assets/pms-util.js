/* ============================================================================
   PMS Mockup — tiện ích dùng chung (format ngày/số, DOM helper)
   Không chứa logic UI. Nạp trước mock-data.js.
   ========================================================================== */

const MBUtil = (function () {
  const MONTHS_SHORT = ['Thg 1', 'Thg 2', 'Thg 3', 'Thg 4', 'Thg 5', 'Thg 6',
    'Thg 7', 'Thg 8', 'Thg 9', 'Thg 10', 'Thg 11', 'Thg 12'];

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function d(iso) {
    if (iso instanceof Date) return iso;
    if (!iso) return null;
    const p = String(iso).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function iso(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }

  function fmtDate(v) {
    const x = d(v);
    if (!x) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return p(x.getDate()) + '/' + p(x.getMonth() + 1) + '/' + x.getFullYear();
  }

  function monthLabel(m) { return MONTHS_SHORT[m]; }

  function addDays(v, n) {
    const x = new Date(d(v).getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function diffDays(a, b) {
    return Math.round((d(b).getTime() - d(a).getTime()) / 86400000);
  }

  function today() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function isOverdue(due) { return !!due && d(due) < today(); }

  function num(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('vi-VN', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits === undefined ? 1 : digits
    });
  }

  /** input: triệu VND */
  function money(mil) {
    if (mil === null || mil === undefined) return '—';
    if (Math.abs(mil) >= 1000) return num(mil / 1000, 2) + ' tỷ';
    return num(mil, 0) + ' trđ';
  }

  function signed(n, suffix) {
    if (!n) return '0' + (suffix || '');
    return (n > 0 ? '+' : '') + num(n, 0) + (suffix || '');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function sum(arr, fn) { return arr.reduce((a, x) => a + (fn ? fn(x) : x), 0); }

  function qs(name, fallback) {
    const v = new URLSearchParams(location.search).get(name);
    return v === null || v === '' ? (fallback === undefined ? null : fallback) : v;
  }

  /** span icon — pms-icons.js sẽ thay bằng inline SVG Phosphor tương ứng */
  function icon(name, size, fill) {
    return '<span class="msym' + (fill ? ' fill' : '') + '"'
      + (size ? ' style="font-size:' + size + 'px"' : '') + '>' + name + '</span>';
  }

  /** Progress (DS Progress: track + right-aligned % label) */
  function progress(pct, tone, lg) {
    const t = tone ? ' ' + tone : '';
    return '<div class="prg-row"><div class="prg' + (lg ? ' prg-lg' : '') + '">'
      + '<div class="prg-fill' + t + '" style="width:' + clamp(pct, 0, 100) + '%"></div></div>'
      + '<span class="prg-label">' + pct + '%</span></div>';
  }

  /** Badge trạng thái: dot + pill + label (bắt buộc, không dùng chữ màu trần) */
  function status(label, tone, size) {
    const sz = size === 'lg' ? ' status-lg' : size === 'sm' ? ' status-sm' : '';
    return '<span class="status st-' + tone + sz + '">' + esc(label) + '</span>';
  }

  /** Tag: chip phân loại (pill, có viền, không dot) */
  function tag(label, variant) {
    return '<span class="tag' + (variant ? ' tag-' + variant : '') + '">' + esc(label) + '</span>';
  }

  /** Chips size=small: giá trị người/nhãn đã gán trong ô bảng */
  function chip(label) { return '<span class="chip">' + esc(label) + '</span>'; }

  return {
    esc, el, d, iso, fmtDate, monthLabel, addDays, diffDays, today, isOverdue,
    num, money, signed, clamp, sum, qs, icon, progress, status, tag, chip
  };
})();
