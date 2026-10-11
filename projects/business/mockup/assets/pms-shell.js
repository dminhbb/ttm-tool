/* ============================================================================
   PMS Mockup — App shell theo templates/ias-layout/IasLayout.dc.html
     Zone bắt buộc : AppSidebar (hover-expand, #0D0D2B) + PageHeader
     Zone loại trừ : AppHeader — ias-design loại bỏ top bar khỏi mọi màn hình
                     (standing design decision, không phải lựa chọn từng màn)
   Trang chỉ cần khai báo data-* trên <body> và bọc nội dung trong #pms-page.
   ========================================================================== */

const PMSShell = (function () {

  /* Cây nav của module Quản lý dự án trong PMS Platform.
     activeNav → sidebar tự mở nhóm cha + breadcrumb tự sinh theo path. */
  const NAV = [
    { key: 'dashboard', label: 'Dashboard danh mục', icon: 'dashboard', href: '01-portfolio-dashboard.html' },
    {
      key: 'quan-ly-du-an', label: 'Quản lý dự án', icon: 'folder_open', children: [
        { key: 'danh-muc-du-an', label: 'Danh mục dự án', href: '02-project-list.html' },
        { key: 'tao-du-an', label: 'Khai báo dự án', href: '03-project-create.html' }
      ]
    },
    {
      key: 'quan-ly-ttm', label: 'Quản lý TTM', icon: 'checklist', children: [
        { key: 'ttm-dashboard', label: 'Bảng điều khiển TTM', href: '#', soon: true },
        { key: 'ttm-epic-alerts', label: 'Cảnh báo Epic', href: '#', soon: true }
      ]
    },
    { key: 'bao-cao', label: 'Báo cáo quản trị', icon: 'bar_chart', href: '#', soon: true },
    {
      key: 'danh-muc-he-thong', label: 'Danh mục hệ thống', icon: 'category', children: [
        { key: 'dm-domain', label: 'Danh mục domain', href: '#', soon: true },
        { key: 'dm-checklist', label: 'Checklist mẫu', href: '#', soon: true }
      ]
    },
    { key: 'administration', label: 'Administration', icon: 'admin_panel_settings', href: '#', soon: true }
  ];

  /* 6 cấu phần của một dự án — section-switcher trên màn chi tiết */
  const SECTIONS = [
    { key: 'overview', label: 'Thông tin chung', href: '04-detail-overview.html' },
    { key: 'checklist', label: 'Checklist', href: '05-detail-checklist.html' },
    { key: 'schedule', label: 'Tiến độ', href: '06-detail-schedule.html' },
    { key: 'scope', label: 'Quản lý phạm vi', href: '07-detail-scope.html' },
    { key: 'risk', label: 'Quản lý rủi ro', href: '08-detail-risk.html' },
    { key: 'quality', label: 'Chất lượng & hiệu quả', href: '09-detail-quality.html' }
  ];

  const LOGO = '<svg width="26" height="26" viewBox="0 0 30 30" fill="none" style="flex-shrink:0" aria-hidden="true">'
    + '<path d="M15 1.5l2.9 7.4L25.9 7l-3.8 7.2 6.4 4.3-6.4 4.3 3.8 7.2-8-1.9L15 28.5l-2.9-7.4L4.1 23l3.8-7.2L1.5 15l6.4-4.3L4.1 7l8 1.9L15 1.5z" fill="#E5052A"/></svg>';

  function projectId() { return MBUtil.qs('p', 'PMP'); }

  /* ------------------------------------------------------- nav path ------ */
  function findPath(key, nodes, acc) {
    for (const n of nodes) {
      const next = acc.concat([n]);
      if (n.key === key) return next;
      if (n.children) {
        const hit = findPath(key, n.children, next);
        if (hit) return hit;
      }
    }
    return null;
  }

  /* -------------------------------------------------------- sidebar ------ */
  function buildSidebar(active) {
    const path = findPath(active, NAV, []) || [];
    const openKeys = path.map((n) => n.key);

    const items = NAV.map((n) => {
      const isActive = n.key === active;
      const isAncestor = openKeys.indexOf(n.key) >= 0;
      if (!n.children) {
        return '<a class="nav-item' + (isActive ? ' active' : '') + '" href="' + n.href + '"'
          + (n.soon ? ' title="Chưa thuộc phạm vi mockup"' : '') + '>'
          + '<span class="msym' + (isActive ? ' fill' : '') + '" style="font-size:21px">' + n.icon + '</span>'
          + '<span class="sb-lbl">' + MBUtil.esc(n.label) + '</span></a>';
      }
      const open = isAncestor;
      const leaves = n.children.map((c) => '<a class="nav-leaf' + (c.key === active ? ' active' : '') + '"'
        + ' href="' + c.href + '"' + (c.soon ? ' title="Chưa thuộc phạm vi mockup"' : '') + '>'
        + '<span class="msym bullet fill">fiber_manual_record</span>'
        + '<span>' + MBUtil.esc(c.label) + '</span></a>').join('');
      return '<div style="margin-bottom:2px">'
        + '<div class="nav-item' + (isAncestor ? ' active' : '') + '" data-grp="' + n.key + '">'
        + '<span class="msym' + (isAncestor ? ' fill' : '') + '" style="font-size:21px">' + n.icon + '</span>'
        + '<span class="sb-lbl" style="flex:1">' + MBUtil.esc(n.label) + '</span>'
        + '<span class="msym grp-arrow sb-lbl" style="font-size:18px' + (open ? ';transform:rotate(180deg)' : '') + '">arrow_drop_down</span>'
        + '</div>'
        + '<div class="nav-tree sb-lbl" id="tree-' + n.key + '" data-open="' + (open ? '1' : '0') + '"'
        + ' style="max-height:' + (open ? '2000px' : '0') + 'px;transition:max-height 300ms ease">'
        + leaves + '</div></div>';
    }).join('');

    return '<nav class="sidebar" aria-label="Điều hướng chính">'
      + '<div class="sb-brand">' + LOGO
      + '<div class="sb-brand-text"><span class="top sb-lbl">MB <span style="color:#8B8FBD;font-weight:400">| PMS</span></span>'
      + '<span class="sub sb-sub">Quản lý dự án</span></div></div>'
      + '<div class="sb-search"><div class="sb-search-inner">'
      + '<span class="msym" style="font-size:17px;color:#8B8FBD">search</span>'
      + '<span class="sb-lbl" style="color:#8B8FBD;font-size:13px">Tìm kiếm</span>'
      + '</div></div>'
      + '<div class="sb-nav">' + items + '</div></nav>';
  }

  /* ------------------------------------------------------ page header ---- */
  function buildPageHeader(b) {
    const active = b.dataset.activeNav || '';
    const path = findPath(active, NAV, []) || [];
    const crumbs = [{ label: 'PMS Platform', href: '01-portfolio-dashboard.html' }]
      .concat(path.map((n) => ({ label: n.label, href: n.href && n.href !== '#' ? n.href : null })));
    if (b.dataset.extraCrumb) {
      b.dataset.extraCrumb.split('/').map((s) => s.trim()).filter(Boolean)
        .forEach((s) => crumbs.push({ label: s, href: null }));
    }

    const crumbHtml = crumbs.map((c, i) => {
      const sep = i ? '<span class="bc-sep">›</span>' : '';
      const last = i === crumbs.length - 1;
      return sep + (last || !c.href
        ? '<span class="bc-current">' + MBUtil.esc(c.label) + '</span>'
        : '<a class="bc-link" href="' + c.href + '">' + MBUtil.esc(c.label) + '</a>');
    }).join('');

    const back = b.dataset.back
      ? '<button class="back-btn" type="button" onclick="location.href=\'' + b.dataset.back + '\'"'
      + ' aria-label="Quay lại"><span class="msym" style="font-size:22px">arrow_back</span></button>'
      : '';
    const badge = b.dataset.badge
      ? MBUtil.status(b.dataset.badge, b.dataset.badgeTone || 'neutral', 'lg')
      : '';
    const subtitle = b.dataset.subtitle
      ? '<p class="page-subtitle">' + MBUtil.esc(b.dataset.subtitle) + '</p>' : '';

    return '<div class="page-header">'
      + '<nav class="breadcrumb" aria-label="Breadcrumb">' + crumbHtml + '</nav>'
      + '<div class="detail-title-row">'
      + '<div class="detail-title-left">' + back
      + '<div><h1 class="' + (b.dataset.back ? 'detail-title' : 'page-title') + '">'
      + MBUtil.esc(b.dataset.title || '') + '</h1>' + subtitle + '</div>'
      + badge + '</div>'
      + '<div class="detail-actions" id="page-header-actions"></div>'
      + '</div></div>';
  }

  /* --------------------------------------------- section switcher (6) ---- */
  function sectionSwitcher(activeKey, pid) {
    return '<nav class="section-switcher" aria-label="Cấu phần dự án">'
      + SECTIONS.map((s) => '<a class="sw-item' + (s.key === activeKey ? ' active' : '') + '"'
        + ' href="' + s.href + '?p=' + pid + '"><span class="sw-radio"></span>'
        + '<span class="hcm-subtitle2">' + MBUtil.esc(s.label) + '</span></a>').join('')
      + '</nav>';
  }

  /* ------------------------------------------------------------ mount ---- */
  function mount() {
    const b = document.body;
    const page = document.getElementById('pms-page');

    const shell = MBUtil.el('<div class="app">'
      + buildSidebar(b.dataset.activeNav || '')
      + '<div class="main">' + buildPageHeader(b)
      + '<div class="content" id="pms-content"></div></div></div>');

    b.insertBefore(shell, b.firstChild);
    if (page) shell.querySelector('#pms-content').appendChild(page);

    /* nhóm nav đóng/mở */
    shell.querySelectorAll('.nav-item[data-grp]').forEach((g) => {
      g.addEventListener('click', () => {
        const tree = shell.querySelector('#tree-' + g.dataset.grp);
        const arrow = g.querySelector('.grp-arrow');
        const open = tree.dataset.open === '1';
        tree.dataset.open = open ? '0' : '1';
        tree.style.maxHeight = open ? '0px' : '2000px';
        if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
      });
    });
  }

  /** nạp action vào actions slot của PageHeader (tối đa 4, primary ở ngoài cùng phải) */
  function setHeaderActions(html) {
    const slot = document.getElementById('page-header-actions');
    if (slot) slot.innerHTML = html;
    return slot;
  }

  mount();
  return { projectId, NAV, SECTIONS, sectionSwitcher, setHeaderActions };
})();
