/* ============================================================================
   PMS Mockup — khung chung cho 6 màn chi tiết dự án
   Dựng theo templates/ias-xem-chi-tiet/XemChiTiet.dc.html:
     PageHeader (onBack + badge) → section-switcher → card nội dung → DetailFooter
   Nạp SAU mock-data.js và TRƯỚC pms-shell.js (phải set data-* trên <body>
   trước khi shell render PageHeader).
   ========================================================================== */

var PRJ = MBData.project(MBUtil.qs('p', 'PMP')) || MBData.project('PMP');

(function () {
  const b = document.body;
  b.dataset.activeNav = 'danh-muc-du-an';
  b.dataset.back = '02-project-list.html';
  b.dataset.title = PRJ.code + ' — ' + PRJ.name;
  b.dataset.badge = PRJ.status;
  b.dataset.badgeTone = MBData.statusTone(PRJ.status);
  b.dataset.extraCrumb = PRJ.name;
})();

const PMSDetail = (function () {
  const E = MBUtil.esc;

  /** section-switcher cho 6 cấu phần */
  function switcher(activeKey) {
    return PMSShell.sectionSwitcher(activeKey, PRJ.id);
  }

  /** dải chỉ số tóm tắt dự án, dùng chung ở cả 6 tab */
  function summaryCard() {
    const pr = MBData.progress(PRJ);
    const ss = MBData.scheduleStats(PRJ);
    const high = MBData.highRisks(PRJ).length;
    const ck = MBData.checklistStats(MBData.checklistItems(PRJ));
    const options = MBData.projects.filter(p => p.hasDetail)
      .map(p => '<option value="' + p.id + '"' + (p.id === PRJ.id ? ' selected' : '') + '>'
        + E(p.code + ' — ' + p.name) + '</option>').join('');

    return '<div class="d-card"><div class="d-card-body" style="padding:16px 20px">'
      + '<div class="row row-wrap" style="gap:24px;align-items:flex-end">'
      + metric('Tiến độ thực tế', pr.actual + '%',
          'kỳ vọng ' + pr.expected + '% · lệch ' + MBUtil.signed(pr.delta, '%'),
          pr.delta >= -3 ? 't-success' : (pr.delta < -10 ? 't-error' : 't-warning'))
      + metric('Checklist hoàn thành', ck.pct + '%', ck.done + '/' + ck.counted + ' hạng mục'
          + (ck.overdue ? ' · ' + ck.overdue + ' quá hạn' : ''), ck.overdue ? 't-error' : '')
      + metric('Milestone trễ hạn', ss.milestoneLate + '/' + ss.milestoneTotal,
          ss.next ? 'kế tiếp: ' + ss.next.name + ' · ' + MBUtil.fmtDate(ss.next.date) : 'không còn milestone mở',
          ss.milestoneLate ? 't-error' : 't-success')
      + metric('Rủi ro mức cao', String(high), MBData.openRisks(PRJ).length + ' rủi ro đang mở',
          high ? 't-error' : 't-success')
      + metric('Giai đoạn hiện tại', PRJ.currentPhase,
          MBUtil.fmtDate(PRJ.startDate) + ' – ' + MBUtil.fmtDate(PRJ.endDate), '')
      + '<div class="fg" style="min-width:260px;margin-left:auto">'
      + '<label for="prj-switch">Dự án đang xem</label>'
      + '<select id="prj-switch">' + options + '</select></div>'
      + '</div></div></div>';
  }

  function metric(label, value, note, tone) {
    return '<div style="min-width:150px">'
      + '<div class="hcm-caption t-secondary">' + E(label) + '</div>'
      + '<div class="metric-value ' + (tone || '') + '" style="margin:4px 0 2px">' + E(value) + '</div>'
      + '<div class="hcm-caption t-muted">' + E(note) + '</div></div>';
  }

  /** PageHeader actions: Ý kiến · Lịch sử · more_vert overflow (primary không có) */
  function headerActions() {
    PMSShell.setHeaderActions(
      '<button class="btn btn-outline" id="hdr-comment"><span class="msym" style="font-size:16px">chat</span>Ý kiến</button>'
      + '<button class="btn btn-outline" id="hdr-history"><span class="msym" style="font-size:16px">history</span>Lịch sử</button>'
      + '<button class="btn-icon row-menu-trigger" id="hdr-more" title="Thao tác khác" style="width:40px;height:40px">'
      + '<span class="msym" style="font-size:20px">more_vert</span></button>');

    document.getElementById('hdr-comment').addEventListener('click', () =>
      PMSNotify.info('Ý kiến về dự án ' + PRJ.code, 'Minh hoạ trong mockup.'));
    document.getElementById('hdr-history').addEventListener('click', () =>
      PMSNotify.info('Lịch sử thay đổi ' + PRJ.code, 'Minh hoạ trong mockup.'));
    document.getElementById('hdr-more').addEventListener('click', (e) => {
      PMSMenu.openAt(e.currentTarget, [
        { label: 'Chỉnh sửa', onClick: () => { location.href = '10-detail-edit.html?p=' + PRJ.id; } },
        { label: 'Lịch sử thay đổi', onClick: () => PMSNotify.info('Lịch sử thay đổi ' + PRJ.code, 'Minh hoạ trong mockup.') },
        { label: 'Xóa', danger: true, onClick: () => PMSModal.confirm({
            title: 'Xóa dự án',
            body: 'Xóa dự án <b>' + E(PRJ.code) + '</b> khỏi danh mục? Hành động này không thể hoàn tác.',
            okLabel: 'Xóa', okIcon: 'delete',
            onOk: () => PMSNotify.warning('Đã xóa (mô phỏng)', 'Mockup không thay đổi dữ liệu nguồn.')
          }) }
      ]);
    });
  }

  /** DetailFooter canh giữa — màn chỉ xem chỉ có 1 nút Đóng */
  function footer(extraHtml) {
    return '<div class="detail-footer">' + (extraHtml || '')
      + '<a class="btn btn-outline" href="02-project-list.html">Đóng</a></div>';
  }

  /** card có tiêu đề + nút thu gọn (DCard) */
  function card(title, bodyHtml, tools, collapsed) {
    return '<div class="d-card' + (collapsed ? ' is-collapsed' : '') + '">'
      + '<div class="d-card-header"><div class="d-card-title">' + E(title) + '</div>'
      + '<div class="d-card-tools">' + (tools || '')
      + '<button class="d-card-toggle" type="button" aria-label="Thu gọn">'
      + '<span class="msym" style="font-size:20px">' + (collapsed ? 'expand_more' : 'expand_less') + '</span>'
      + '</button></div></div>'
      + '<div class="d-card-body">' + bodyHtml + '</div></div>';
  }

  /** field chỉ xem */
  function field(label, value, span) {
    return '<div class="field' + (span ? ' ' + span : '') + '">'
      + '<label>' + E(label) + '</label>'
      + '<div class="val">' + (value ? E(value) : '—') + '</div></div>';
  }

  /** bật hành vi collapse + chuyển dự án; gọi sau khi render xong */
  function wire(root) {
    (root || document).addEventListener('click', (e) => {
      const head = e.target.closest('.d-card-header');
      if (!head) return;
      if (e.target.closest('button:not(.d-card-toggle), a, select, input, label')) return;
      const dcard = head.closest('.d-card');
      dcard.classList.toggle('is-collapsed');
      const t = head.querySelector('.d-card-toggle .msym');
      if (t) t.textContent = dcard.classList.contains('is-collapsed') ? 'expand_more' : 'expand_less';
    });
    const sw = document.getElementById('prj-switch');
    if (sw) sw.addEventListener('change', () => { location.search = '?p=' + sw.value; });
  }

  return { switcher, summaryCard, headerActions, footer, card, field, metric, wire };
})();
