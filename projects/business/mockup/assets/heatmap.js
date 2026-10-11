/* ============================================================================
   PMS Mockup — Ma trận rủi ro 5×5 (Xác suất × Tác động)
   Bespoke: DS của ias-design không có component heatmap/matrix, nên theo
   SKILL.md Step 2 mọi màu đều lấy từ semantic alias token (4 mức heat dùng
   --color-bg-success-solid / warning-solid / warning-400 / error-solid).
   ========================================================================== */

const PMSHeatmap = (function () {
  const E = MBUtil.esc;

  /**
   * render(container, risks, opts)
   *  risks : [{p, i, ...}] — chỉ truyền rủi ro đang mở
   *  opts  : { selected: 'p-i'|null, onSelect(cellKey|null) }
   */
  function render(el, risks, opts) {
    const o = opts || {};
    const counts = {};
    risks.forEach((r) => {
      const k = r.p + '-' + r.i;
      counts[k] = (counts[k] || 0) + 1;
    });

    let html = '<div class="hm-yaxis">Xác suất xảy ra →</div>';
    /* hàng p=5 ở trên cùng xuống p=1 */
    for (let p = 5; p >= 1; p--) {
      html += '<div class="hm-rowlab">' + p + ' · ' + E(MBData.RISK_P_LABEL[p - 1]) + '</div>';
      for (let i = 1; i <= 5; i++) {
        const k = p + '-' + i;
        const n = counts[k] || 0;
        const lv = MBData.riskLevel(p * i);
        const on = o.selected === k;
        html += '<div class="hm-cell ' + lv.cls + (n ? '' : ' empty') + (on ? ' on' : '') + '"'
          + ' data-cell="' + k + '" role="button" tabindex="0"'
          + ' aria-label="Xác suất ' + p + ', tác động ' + i + ': ' + n + ' rủi ro"'
          + ' data-tip="' + E(PMSTip.rows([
            ['Xác suất', p + ' · ' + MBData.RISK_P_LABEL[p - 1]],
            ['Tác động', i + ' · ' + MBData.RISK_I_LABEL[i - 1]],
            ['Điểm', String(p * i) + ' (' + lv.label + ')'],
            ['Số rủi ro', String(n)]
          ])) + '">'
          + (n || '·') + '<span class="hm-score">' + (p * i) + '</span></div>';
      }
    }
    /* trục X */
    html += '<div></div><div></div>';
    for (let i = 1; i <= 5; i++) {
      html += '<div class="hm-collab">' + i + '<br>' + E(MBData.RISK_I_LABEL[i - 1]) + '</div>';
    }
    html += '<div></div><div></div><div class="hm-xaxis">Mức độ tác động →</div>';

    el.className = 'heatmap';
    el.innerHTML = html;

    el.querySelectorAll('[data-cell]').forEach((c) => {
      const fire = () => {
        const k = c.dataset.cell;
        if (o.onSelect) o.onSelect(o.selected === k ? null : k);
      };
      c.addEventListener('click', fire);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    });
    PMSTip.bind(el, '[data-tip]', (t) => t.dataset.tip);
  }

  /** chú giải 4 mức rủi ro */
  function legend() {
    return '<div class="legend">'
      + '<span class="legend-item"><span class="legend-sw heat-low"></span>Thấp (1–5)</span>'
      + '<span class="legend-item"><span class="legend-sw heat-med"></span>Trung bình (6–11)</span>'
      + '<span class="legend-item"><span class="legend-sw heat-high"></span>Cao (12–19)</span>'
      + '<span class="legend-item"><span class="legend-sw heat-crit"></span>Nghiêm trọng (20–25)</span>'
      + '</div>';
  }

  return { render, legend };
})();
