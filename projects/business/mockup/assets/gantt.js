/* ============================================================================
   PMS Mockup — Gantt engine (bespoke)
   DS của ias-design không có component Gantt/timeline, nên theo SKILL.md Step 2
   ("no equivalent → build with DS tokens only") toàn bộ màu/bán kính/khoảng cách
   đều lấy từ semantic alias token trong pms-tokens.css.
   Thể hiện được 2 lớp: baseline (kế hoạch đã chốt) vs thực tế — lý do không
   dùng thư viện Gantt ngoài.
   ========================================================================== */

const PMSGantt = (function () {
  const E = MBUtil.esc;
  const ROW_H = 36;
  const PPD = { week: 20, month: 4, quarter: 1.6 };

  let state = null;

  /* ------------------------------------------------------------ rows ----- */
  function buildRows(p, collapsed) {
    const rows = [];
    p.schedule.groups.forEach((g) => {
      const r = MBData.groupRange(g);
      rows.push({ kind: 'group', id: g.id, name: g.name, pct: r.pct, start: r.start, end: r.end, baseStart: r.baseStart, baseEnd: r.baseEnd });
      if (collapsed.indexOf(g.id) < 0) {
        g.tasks.forEach((t) => rows.push(Object.assign({ kind: 'task', group: g.id }, t)));
      }
    });
    if (p.schedule.milestones.length) {
      rows.push({ kind: 'group', id: 'MS', name: 'Milestone', isMsGroup: true });
      if (collapsed.indexOf('MS') < 0) {
        p.schedule.milestones.forEach((m) => rows.push(Object.assign({ kind: 'ms' }, m)));
      }
    }
    return rows;
  }

  function range(p) {
    const dates = [];
    MBData.allTasks(p).forEach((t) => dates.push(t.start, t.end, t.baseStart, t.baseEnd));
    p.schedule.milestones.forEach((m) => dates.push(m.date, m.baseDate));
    dates.push(p.startDate, p.endDate);
    const sorted = dates.filter(Boolean).sort();
    return {
      from: MBUtil.iso(MBUtil.addDays(sorted[0], -20)),
      to: MBUtil.iso(MBUtil.addDays(sorted[sorted.length - 1], 20))
    };
  }

  /* ----------------------------------------------------------- header ---- */
  function header(from, to, zoom, ppd) {
    const total = MBUtil.diffDays(from, to);
    let major = '', minor = '', lines = '';

    if (zoom === 'week') {
      /* minor = ngày, major = tháng */
      let d = MBUtil.d(from);
      let curMonth = -1, monthStart = 0;
      for (let i = 0; i <= total; i++) {
        const dow = d.getDay();
        minor += '<div style="width:' + ppd + 'px"' + (dow === 0 || dow === 6 ? ' class="weekend"' : '') + '>'
          + (ppd >= 18 ? d.getDate() : '') + '</div>';
        if (d.getMonth() !== curMonth) {
          if (curMonth >= 0) {
            major += majorCell((i - monthStart) * ppd, MBUtil.monthLabel(curMonth) + '/' + yearOf(from, monthStart));
            lines += '<div class="gantt-grid-line major" style="left:' + (i * ppd) + 'px"></div>';
          }
          curMonth = d.getMonth(); monthStart = i;
        } else if (dow === 1) {
          lines += '<div class="gantt-grid-line" style="left:' + (i * ppd) + 'px"></div>';
        }
        d = MBUtil.addDays(d, 1);
      }
      major += majorCell((total + 1 - monthStart) * ppd, MBUtil.monthLabel(curMonth) + '/' + yearOf(from, monthStart));
    } else if (zoom === 'month') {
      /* minor = tháng, major = năm */
      let d = new Date(MBUtil.d(from).getFullYear(), MBUtil.d(from).getMonth(), 1);
      let curYear = -1, yearW = 0;
      while (d <= MBUtil.d(to)) {
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const w = Math.round(MBUtil.diffDays(d, next) * ppd);
        minor += '<div style="width:' + w + 'px">' + MBUtil.monthLabel(d.getMonth()) + '</div>';
        lines += '<div class="gantt-grid-line" style="left:'
          + Math.round(MBUtil.diffDays(from, d) * ppd) + 'px"></div>';
        if (curYear >= 0 && d.getFullYear() !== curYear) {
          major += majorCell(yearW, String(curYear));
          lines += '<div class="gantt-grid-line major" style="left:'
            + Math.round(MBUtil.diffDays(from, d) * ppd) + 'px"></div>';
          yearW = 0;
        }
        curYear = d.getFullYear(); yearW += w;
        d = next;
      }
      major += majorCell(yearW, String(curYear));
    } else {
      /* minor = quý, major = năm */
      const f = MBUtil.d(from);
      let d = new Date(f.getFullYear(), Math.floor(f.getMonth() / 3) * 3, 1);
      let curYear = -1, yearW = 0;
      while (d <= MBUtil.d(to)) {
        const next = new Date(d.getFullYear(), d.getMonth() + 3, 1);
        const w = Math.round(MBUtil.diffDays(d, next) * ppd);
        minor += '<div style="width:' + w + 'px">Q' + (Math.floor(d.getMonth() / 3) + 1) + '</div>';
        lines += '<div class="gantt-grid-line" style="left:'
          + Math.round(MBUtil.diffDays(from, d) * ppd) + 'px"></div>';
        if (curYear >= 0 && d.getFullYear() !== curYear) {
          major += majorCell(yearW, String(curYear));
          yearW = 0;
        }
        curYear = d.getFullYear(); yearW += w;
        d = next;
      }
      major += majorCell(yearW, String(curYear));
    }
    return { html: '<div class="gantt-head"><div class="gantt-head-major">' + major + '</div>'
      + '<div class="gantt-head-minor">' + minor + '</div></div>', lines: lines };
  }

  function majorCell(w, label) {
    return '<div style="width:' + Math.max(0, Math.round(w)) + 'px">' + E(label) + '</div>';
  }
  function yearOf(from, dayOffset) {
    return MBUtil.addDays(from, dayOffset).getFullYear();
  }

  /* -------------------------------------------------------- bar tone ----- */
  function tone(t) {
    const slip = MBData.taskSlip(t);
    if (t.pct === 0 && MBUtil.d(t.start) > MBUtil.today()) return 'b-plan';
    if (slip > 10) return 'b-late';
    if (slip > 0) return 'b-risk';
    return 'b-ontime';
  }

  function tipTask(t) {
    const slip = MBData.taskSlip(t);
    return PMSTip.rows([
      ['Baseline', MBUtil.fmtDate(t.baseStart) + ' – ' + MBUtil.fmtDate(t.baseEnd)],
      ['Thực tế', MBUtil.fmtDate(t.start) + ' – ' + MBUtil.fmtDate(t.end)],
      ['Lệch kết thúc', MBUtil.signed(slip, ' ngày')],
      ['Hoàn thành', t.pct + '%'],
      t.owner ? ['Phụ trách', E(t.owner)] : null,
      t.critical ? ['Đường găng', 'Có'] : null
    ]);
  }

  /* ---------------------------------------------------------- render ----- */
  function render() {
    const p = state.project;
    const zoom = state.zoom;
    const ppd = PPD[zoom];
    const r = range(p);
    const rows = buildRows(p, state.collapsed);
    const width = Math.round(MBUtil.diffDays(r.from, r.to) * ppd) + 40;
    const x = (date) => Math.round(MBUtil.diffDays(r.from, date) * ppd);

    /* --- WBS --- */
    const wbs = rows.map((row) => {
      if (row.kind === 'group') {
        const open = state.collapsed.indexOf(row.id) < 0;
        return '<div class="gantt-wbs-row is-group">'
          + '<button class="gantt-caret" data-grp="' + row.id + '" aria-label="Đóng/mở nhóm">'
          + '<span class="msym" style="font-size:16px">' + (open ? 'expand_less' : 'expand_more') + '</span></button>'
          + '<span class="gantt-wbs-name">' + E(row.name) + '</span>'
          + (row.isMsGroup ? '' : '<span class="gantt-wbs-pct">' + row.pct + '%</span>')
          + '</div>';
      }
      if (row.kind === 'ms') {
        return '<div class="gantt-wbs-row is-ms"><span class="gantt-indent"></span>'
          + '<span class="msym" style="font-size:14px">flag</span>'
          + '<span class="gantt-wbs-name">' + E(row.name) + '</span></div>';
      }
      return '<div class="gantt-wbs-row"><span class="gantt-indent"></span>'
        + '<span class="gantt-wbs-name">' + E(row.name) + '</span>'
        + '<span class="gantt-wbs-pct">' + row.pct + '%</span></div>';
    }).join('');

    /* --- bars --- */
    let bars = '';
    rows.forEach((row, i) => {
      const top = i * ROW_H;
      if (row.kind === 'group') {
        if (row.isMsGroup) return;
        bars += '<div class="gantt-bar gantt-bar-group" style="left:' + x(row.start) + 'px;top:'
          + (top + 13) + 'px;width:' + Math.max(4, x(row.end) - x(row.start)) + 'px"'
          + ' data-tip="' + E(PMSTip.rows([
            ['Baseline', MBUtil.fmtDate(row.baseStart) + ' – ' + MBUtil.fmtDate(row.baseEnd)],
            ['Thực tế', MBUtil.fmtDate(row.start) + ' – ' + MBUtil.fmtDate(row.end)],
            ['Hoàn thành', row.pct + '%']
          ])) + '"></div>';
        return;
      }
      if (row.kind === 'ms') {
        const cls = row.status === 'done' ? 'm-done' : row.status === 'late' ? 'm-late' : '';
        const slip = MBUtil.diffDays(row.baseDate, row.date);
        bars += '<div class="gantt-ms ' + cls + '" style="left:' + (x(row.date) - 6) + 'px;top:'
          + (top + 11) + 'px" data-tip="' + E(PMSTip.rows([
            ['Baseline', MBUtil.fmtDate(row.baseDate)],
            ['Dự kiến/thực tế', MBUtil.fmtDate(row.date)],
            ['Lệch', MBUtil.signed(slip, ' ngày')]
          ])) + '"></div>'
          + '<div class="gantt-ms-label" style="left:' + (x(row.date) + 12) + 'px;top:' + (top + 11) + 'px">'
          + MBUtil.fmtDate(row.date) + (slip > 0 ? ' (+' + slip + 'd)' : '') + '</div>';
        return;
      }
      /* baseline + thực tế */
      bars += '<div class="gantt-baseline" style="left:' + x(row.baseStart) + 'px;top:' + (top + 24)
        + 'px;width:' + Math.max(3, x(row.baseEnd) - x(row.baseStart)) + 'px"></div>';
      const w = Math.max(4, x(row.end) - x(row.start));
      bars += '<div class="gantt-bar ' + tone(row) + '" data-task="' + row.id + '"'
        + ' style="left:' + x(row.start) + 'px;top:' + (top + 6) + 'px;width:' + w + 'px"'
        + ' data-tip="' + E(tipTask(row)) + '">'
        + '<span class="gantt-bar-fill" style="width:' + Math.round(w * row.pct / 100) + 'px"></span></div>';
    });

    /* --- dependency arrows --- */
    const idx = {};
    rows.forEach((row, i) => { if (row.kind === 'task') idx[row.id] = { row: row, i: i }; });
    let paths = '';
    rows.forEach((row, i) => {
      if (row.kind !== 'task' || !row.deps) return;
      row.deps.forEach((dep) => {
        const from = idx[dep];
        if (!from) return;  /* nhóm của task tiền nhiệm đang bị thu gọn */
        const x1 = x(from.row.end), y1 = from.i * ROW_H + 13;
        const x2 = x(row.start), y2 = i * ROW_H + 13;
        const mid = x2 - 10 > x1 + 10 ? (x1 + 10) : (x1 + 14);
        const crit = row.critical && from.row.critical;
        paths += '<path class="' + (crit ? 'critical' : '') + '" d="M' + x1 + ' ' + y1
          + ' H' + mid + ' V' + y2 + ' H' + (x2 - 4) + '"/>'
          + '<path class="' + (crit ? 'critical' : '') + '" d="M' + (x2 - 4) + ' ' + (y2 - 3)
          + ' L' + x2 + ' ' + y2 + ' L' + (x2 - 4) + ' ' + (y2 + 3) + '"/>';
      });
    });

    const todayX = x(MBUtil.iso(MBUtil.today()));
    const h = header(r.from, r.to, zoom, ppd);
    const rowBgs = rows.map((row) => '<div class="gantt-row-bg' + (row.kind === 'group' ? ' is-group' : '') + '"></div>').join('');

    state.el.innerHTML =
      '<div class="gantt-wbs">'
      + '<div class="gantt-wbs-head">Cấu trúc công việc (WBS)</div>'
      + '<div class="gantt-wbs-body">' + wbs + '</div></div>'
      + '<div class="gantt-scroll" id="gantt-scroll">'
      + '<div class="gantt-canvas" style="width:' + width + 'px">'
      + h.html
      + '<div class="gantt-rows" style="height:' + (rows.length * ROW_H) + 'px">'
      + rowBgs
      + '<div class="gantt-grid">' + h.lines + '</div>'
      + (todayX >= 0 && todayX <= width
        ? '<div class="gantt-today" style="left:' + todayX + 'px"><span class="gantt-today-flag">Hôm nay</span></div>'
        : '')
      + '<div class="gantt-bars">' + bars + '</div>'
      + '<svg class="gantt-deps" width="' + width + '" height="' + (rows.length * ROW_H) + '">' + paths + '</svg>'
      + '</div></div></div>';

    /* đóng/mở nhóm */
    state.el.querySelectorAll('[data-grp]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.grp;
        const i = state.collapsed.indexOf(id);
        if (i < 0) state.collapsed.push(id); else state.collapsed.splice(i, 1);
        render();
      });
    });

    /* tooltip cho bar/milestone */
    PMSTip.bind(state.el, '[data-tip]', (t) => t.dataset.tip);

    /* cuộn tới vùng "hôm nay" lần đầu */
    if (!state.scrolled) {
      const sc = state.el.querySelector('#gantt-scroll');
      if (sc && todayX > 0) sc.scrollLeft = Math.max(0, todayX - sc.clientWidth / 2);
      state.scrolled = true;
    }
  }

  /** mount: container (DOM), project, zoom ban đầu */
  function mount(el, project, zoom) {
    state = { el: el, project: project, zoom: zoom || 'month', collapsed: [], scrolled: false };
    render();
  }
  function setZoom(z) { state.zoom = z; state.scrolled = false; render(); }
  function expandAll() { state.collapsed = []; render(); }
  function collapseAll() {
    state.collapsed = state.project.schedule.groups.map((g) => g.id).concat(['MS']);
    render();
  }

  return { mount, setZoom, expandAll, collapseAll };
})();
