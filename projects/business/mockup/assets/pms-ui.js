/* ============================================================================
   PMS Mockup — Modal · Notification · Tooltip · RowMenu · Panel-select
   Modal dựng theo đúng templates/ias-modal/Modal.dc.html:
     overlay làm mờ TOÀN BỘ màn hình · mount/unmount theo state thật ·
     click backdrop để đóng · footer canh giữa · outline trước, primary sau.
   ========================================================================== */

/* ──────────────────────────────────────────────────────────────── Modal ── */
const PMSModal = (function () {
  let stack = [];

  function open(opt) {
    const overlay = MBUtil.el('<div class="modal-overlay" role="presentation"></div>');
    const widthCls = opt.size === 'wide' ? ' modal-wide' : opt.size === 'mid' ? ' modal-mid' : '';
    const modal = MBUtil.el(
      '<div class="modal' + widthCls + '" role="dialog" aria-modal="true">'
      + '<div class="modal-header">'
      + '<div class="modal-title">' + MBUtil.esc(opt.title || '') + '</div>'
      + '<button class="modal-close" type="button" aria-label="Đóng">'
      + '<span class="msym">close</span></button>'
      + '</div>'
      + '<div class="modal-body"></div>'
      + '<div class="modal-footer"></div>'
      + '</div>');

    modal.querySelector('.modal-body').innerHTML = opt.body || '';
    const foot = modal.querySelector('.modal-footer');

    const handle = {
      root: modal,
      body: modal.querySelector('.modal-body'),
      close: close,
      q: (sel) => modal.querySelector(sel),
      qa: (sel) => Array.from(modal.querySelectorAll(sel))
    };

    /* Button order: outline/secondary trước, primary cuối (DetailFooter/Modal rule) */
    (opt.actions || [{ label: 'Đóng', variant: 'outline' }]).forEach((a) => {
      const b = MBUtil.el('<button type="button" class="btn btn-' + (a.variant || 'outline') + '">'
        + (a.icon ? '<span class="msym" style="font-size:16px">' + a.icon + '</span>' : '')
        + MBUtil.esc(a.label) + '</button>');
      b.addEventListener('click', () => {
        if (!a.onClick) { close(); return; }
        if (a.onClick(handle) !== false) close();
      });
      foot.appendChild(b);
    });

    modal.querySelector('.modal-close').addEventListener('click', close);
    /* click bắt đầu trong card rồi bubble lên overlay thì KHÔNG đóng */
    overlay.addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    stack.push({ overlay, close });

    if (opt.onMount) opt.onMount(handle);
    const first = modal.querySelector('input,select,textarea');
    if (first) setTimeout(() => first.focus(), 30);

    function close() {
      overlay.remove();
      stack = stack.filter((s) => s.overlay !== overlay);
    }
    return handle;
  }

  function confirm(opt) {
    return open({
      title: opt.title || 'Xác nhận',
      body: '<div class="hcm-body2" style="color:var(--color-text-body)">' + (opt.body || '') + '</div>',
      actions: [
        { label: opt.cancelLabel || 'Hủy', variant: 'outline' },
        {
          label: opt.okLabel || 'Xác nhận', variant: 'primary', icon: opt.okIcon,
          onClick: () => { if (opt.onOk) opt.onOk(); }
        }
      ]
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
  });

  return { open, confirm };
})();

/* ───────────────────────────────────────────────────────── Notification ── */
const PMSNotify = (function () {
  let host = null;
  function ensure() {
    if (!host) { host = MBUtil.el('<div class="notif-host" aria-live="polite"></div>'); document.body.appendChild(host); }
    return host;
  }
  const ICON = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  function show(type, title, msg) {
    const n = MBUtil.el('<div class="notif nt-' + type + '">'
      + '<span class="msym">' + (ICON[type] || 'info') + '</span><div>'
      + '<div class="notif-title">' + MBUtil.esc(title) + '</div>'
      + (msg ? '<div class="notif-msg">' + MBUtil.esc(msg) + '</div>' : '')
      + '</div></div>');
    ensure().appendChild(n);
    setTimeout(() => {
      n.style.transition = 'opacity .2s ease'; n.style.opacity = '0';
      setTimeout(() => n.remove(), 220);
    }, 3800);
  }
  return {
    success: (t, m) => show('success', t, m),
    error: (t, m) => show('error', t, m),
    warning: (t, m) => show('warning', t, m),
    info: (t, m) => show('info', t, m)
  };
})();

/* ───────────────────────────────────────────────────────────── Tooltip ── */
const PMSTip = (function () {
  let node = null;
  function ensure() {
    if (!node) { node = MBUtil.el('<div class="tip"></div>'); document.body.appendChild(node); }
    return node;
  }
  function showAt(x, y, html) {
    const n = ensure();
    n.innerHTML = html;
    n.classList.add('show');
    const r = n.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    n.style.left = Math.max(8, left) + 'px';
    n.style.top = Math.max(8, top) + 'px';
  }
  function hide() { if (node) node.classList.remove('show'); }

  function bind(container, selector, getHtml) {
    container.addEventListener('mousemove', (e) => {
      const t = e.target.closest(selector);
      if (!t || !container.contains(t)) { hide(); return; }
      const html = getHtml(t);
      if (!html) { hide(); return; }
      showAt(e.clientX, e.clientY, html);
    });
    container.addEventListener('mouseleave', hide);
    container.addEventListener('scroll', hide, true);
  }

  /** Tooltip cho ô bảng bị cắt (.td-truncate) — position:fixed để không bị clip */
  function bindTruncated(container) {
    let bubble = document.querySelector('.td-tt-bubble');
    if (!bubble) { bubble = MBUtil.el('<div class="td-tt-bubble"></div>'); document.body.appendChild(bubble); }
    container.addEventListener('mouseover', (e) => {
      const td = e.target.closest('.td-truncate');
      if (!td || td.scrollWidth <= td.clientWidth) { bubble.style.display = 'none'; return; }
      bubble.textContent = td.textContent.trim();
      bubble.style.display = 'block';
      const r = td.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      bubble.style.left = Math.max(8, Math.min(r.left, window.innerWidth - b.width - 8)) + 'px';
      bubble.style.top = (r.bottom + 6 + b.height > window.innerHeight ? r.top - b.height - 6 : r.bottom + 6) + 'px';
    });
    container.addEventListener('mouseout', (e) => {
      if (e.target.closest('.td-truncate')) bubble.style.display = 'none';
    });
    container.addEventListener('scroll', () => { bubble.style.display = 'none'; }, true);
  }

  function rows(pairs) {
    return pairs.filter((p) => p)
      .map((p) => '<div class="tip-row"><span>' + p[0] + '</span><b>' + p[1] + '</b></div>').join('');
  }
  return { bind, bindTruncated, showAt, hide, rows };
})();

/* ───────────────────────────────────────────────────────────── RowMenu ── */
const PMSMenu = (function () {
  let menu = null;
  function ensure() {
    if (!menu) {
      menu = MBUtil.el('<div class="row-menu"></div>');
      document.body.appendChild(menu);
      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !e.target.closest('.row-menu-trigger')) hide();
      });
      window.addEventListener('scroll', hide, true);
    }
    return menu;
  }
  function hide() { if (menu) menu.classList.remove('show'); }

  /** items: [{label, danger, disabled, onClick}] — text-only, thứ tự canon do caller giữ */
  function openAt(trigger, items) {
    const m = ensure();
    m.innerHTML = '';
    items.forEach((it) => {
      const b = MBUtil.el('<button type="button" class="mi' + (it.danger ? ' danger' : '') + '"'
        + (it.disabled ? ' disabled' : '') + '>' + MBUtil.esc(it.label) + '</button>');
      b.addEventListener('click', () => { hide(); if (it.onClick) it.onClick(); });
      m.appendChild(b);
    });
    m.classList.add('show');
    const r = trigger.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.right - mr.width, window.innerWidth - mr.width - 8)) + 'px';
    m.style.top = (r.bottom + mr.height > window.innerHeight ? r.top - mr.height - 4 : r.bottom + 4) + 'px';
  }
  return { openAt, hide };
})();

/* ─────────────────────────────────────────────── Select mode="panel" ──── */
const PMSPsel = (function () {
  /** Khởi tạo mọi .psel trong container. value đọc qua el.dataset.value */
  function init(container, onChange) {
    container.querySelectorAll('.psel').forEach((psel) => {
      const trigger = psel.querySelector('.psel-trigger');
      const panel = psel.querySelector('.psel-panel');
      trigger.addEventListener('click', () => {
        const open = panel.classList.contains('show');
        document.querySelectorAll('.psel-panel.show').forEach((p) => {
          p.classList.remove('show');
          p.parentElement.querySelector('.psel-trigger').classList.remove('open');
        });
        if (open) return;
        panel.classList.add('show');
        trigger.classList.add('open');
        const r = trigger.getBoundingClientRect();
        panel.style.left = r.left + 'px';
        panel.style.width = r.width + 'px';
        panel.style.top = (r.bottom + 4) + 'px';
      });
      panel.addEventListener('click', (e) => {
        const opt = e.target.closest('.psel-opt');
        if (!opt) return;
        panel.querySelectorAll('.psel-opt').forEach((o) => o.classList.toggle('selected', o === opt));
        trigger.textContent = opt.textContent;
        psel.dataset.value = opt.dataset.value || '';
        panel.classList.remove('show');
        trigger.classList.remove('open');
        if (onChange) onChange(psel.dataset.name || '', psel.dataset.value);
      });
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('.psel')) return;
      document.querySelectorAll('.psel-panel.show').forEach((p) => {
        p.classList.remove('show');
        p.parentElement.querySelector('.psel-trigger').classList.remove('open');
      });
    });
  }

  /** markup 1 panel-select */
  function render(name, options, selected, placeholder) {
    const sel = selected || '';
    const current = options.find((o) => o.value === sel);
    return '<div class="psel" data-name="' + MBUtil.esc(name) + '" data-value="' + MBUtil.esc(sel) + '">'
      + '<div class="psel-trigger">' + MBUtil.esc(current ? current.label : (placeholder || 'Tất cả')) + '</div>'
      + '<div class="psel-panel">'
      + options.map((o) => '<div class="psel-opt' + (o.value === sel ? ' selected' : '') + '"'
        + ' data-value="' + MBUtil.esc(o.value) + '">' + MBUtil.esc(o.label) + '</div>').join('')
      + '</div></div>';
  }

  return { init, render };
})();

/* ────────────────────────────────────────────────────────────── Drawer ── */
const PMSDrawer = (function () {
  let current = null;

  /** opt: {title, badge:{label,tone}, expandHref, body, footer:[{label,variant,icon,onClick}]} */
  function open(opt) {
    close();
    const overlay = MBUtil.el('<div class="drawer-overlay" role="presentation"></div>');
    const panel = MBUtil.el('<div class="drawer-panel" role="dialog" aria-modal="true">'
      + '<div class="dr-header">'
      + '<div class="row" style="gap:10px;min-width:0">'
      + '<span class="dr-title">' + MBUtil.esc(opt.title || '') + '</span>'
      + (opt.badge ? MBUtil.status(opt.badge.label, opt.badge.tone) : '')
      + '</div>'
      + '<div class="dr-actions">'
      + (opt.expandHref
        ? '<button class="dr-icon-btn" type="button" data-expand aria-label="Mở trang chi tiết">'
        + '<span class="msym" style="font-size:20px">open_in_full</span></button>' : '')
      + '<button class="dr-icon-btn" type="button" data-close aria-label="Đóng">'
      + '<span class="msym" style="font-size:20px">close</span></button>'
      + '</div></div>'
      + '<div class="dr-body"></div>'
      + '<div class="dr-footer"></div></div>');

    panel.querySelector('.dr-body').innerHTML = opt.body || '';
    const foot = panel.querySelector('.dr-footer');
    (opt.footer || [{ label: 'Đóng', variant: 'outline' }]).forEach((a) => {
      const b = MBUtil.el('<button type="button" class="btn btn-' + (a.variant || 'outline') + '">'
        + (a.icon ? '<span class="msym" style="font-size:16px">' + a.icon + '</span>' : '')
        + MBUtil.esc(a.label) + '</button>');
      b.addEventListener('click', () => { if (!a.onClick) { close(); return; } if (a.onClick() !== false) close(); });
      foot.appendChild(b);
    });

    panel.querySelector('[data-close]').addEventListener('click', close);
    const exp = panel.querySelector('[data-expand]');
    if (exp) exp.addEventListener('click', () => { location.href = opt.expandHref; });
    overlay.addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    current = overlay;
  }

  function close() { if (current) { current.remove(); current = null; } }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close };
})();
