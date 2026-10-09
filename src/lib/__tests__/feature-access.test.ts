import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiFeatureKey, fallbackPathFor, MCP_TOOL_FEATURES, mcpToolViewDenied, NO_ACCESS_PATH, pageFeatureKey } from '../feature-access';
import { formatTtmFailPct, formatTtmPassPct, hasTtmVerdict, summarizeTtmCnttFromCounts } from '../ttm-cntt-qa';

describe('feature-access — Ma trận phân quyền blocks the page (2026-10-05)', () => {
  it('maps every gated page, exact or by prefix, and never confuses look-alike paths', () => {
    assert.equal(pageFeatureKey('/ttm-dashboard-2'), 'ttm_dashboard_2');
    assert.equal(pageFeatureKey('/epic-alerts-15'), 'epic_alerts_15');
    assert.equal(pageFeatureKey('/epic-alerts'), 'epic_alerts_30');
    assert.equal(pageFeatureKey('/dashboard'), 'dashboard');
    assert.equal(pageFeatureKey('/dashboard-new'), 'dashboard_new');
    assert.equal(pageFeatureKey('/data-review/42'), 'data_source');
    assert.equal(pageFeatureKey('/admin/users'), 'users');
    assert.equal(pageFeatureKey('/'), 'data_source');
    assert.equal(pageFeatureKey('/login'), null);
    assert.equal(pageFeatureKey(NO_ACCESS_PATH), null);
    assert.equal(pageFeatureKey('/epic-alerts-15/extra'), null);
  });

  it('only page-exclusive data APIs are gated', () => {
    assert.equal(apiFeatureKey('/api/ttm-dashboard-2'), 'ttm_dashboard_2');
    assert.equal(apiFeatureKey('/api/ttm-dashboard-2/rows'), 'ttm_dashboard_2');
    assert.equal(apiFeatureKey('/api/reports'), 'epic_reports');
    assert.equal(apiFeatureKey('/api/epic-alerts-15'), null); // shared by several screens
    assert.equal(apiFeatureKey('/api/projects'), null);
  });

  it('falls back to the first landing page still allowed, never the denied page itself, else /no-access', () => {
    assert.equal(fallbackPathFor(new Set(), '/epic-in-po'), '/ttm-dashboard-2');
    assert.equal(fallbackPathFor(new Set(), '/ttm-dashboard-2'), '/epic-alerts-15');
    assert.equal(fallbackPathFor(new Set(['ttm_dashboard_2']), '/epic-in-po'), '/epic-alerts-15');
    const everything = new Set(['ttm_dashboard_2', 'epic_alerts_15', 'epic_reports', 'epic_in_po', 'visit_counter', 'dashboard_new']);
    assert.equal(fallbackPathFor(everything, '/reports'), NO_ACCESS_PATH);
  });
});

describe('feature-access — Ma trận phân quyền also gates the MCP tools (2026-10-08)', () => {
  it('a tool is refused only when "Xem" is unticked on every screen showing its data', () => {
    assert.equal(mcpToolViewDenied('get_ttm_dashboard', new Set(['ttm_dashboard_2'])), true);
    assert.equal(mcpToolViewDenied('get_ttm_dashboard', new Set(['dashboard_new', 'dashboard'])), false);
    // Quản trị Epic and Epic in PO read the same rows (/api/epic-alerts-15) — either one keeps the tool.
    assert.equal(mcpToolViewDenied('list_epic_alerts', new Set(['epic_alerts_15'])), false);
    assert.equal(mcpToolViewDenied('list_epic_alerts', new Set(['epic_alerts_15', 'epic_in_po'])), true);
    // Duyệt Epic opens from five screens — any of them still viewable keeps the tool.
    const epicDetailScreens = ['epic_alerts_15', 'epic_in_po', 'epic_reports', 'dashboard_new', 'dashboard'];
    for (const stillViewable of epicDetailScreens) {
      assert.equal(mcpToolViewDenied('get_epic_detail', new Set(epicDetailScreens.filter((key) => key !== stillViewable))), false, stillViewable);
    }
    assert.equal(mcpToolViewDenied('get_epic_detail', new Set(epicDetailScreens)), true);
    assert.equal(mcpToolViewDenied('search_product_docs', new Set(['product_docs'])), true);
    assert.equal(mcpToolViewDenied('get_product_doc_section', new Set()), false);
  });

  it('every tool names at least one feature', () => {
    for (const [tool, entry] of Object.entries(MCP_TOOL_FEATURES)) {
      assert.ok(entry.featureKeys.length > 0 && entry.screen, tool);
    }
    assert.equal(Object.keys(MCP_TOOL_FEATURES).length, 11);
  });
});

describe('TTM ratios with no verdict yet (2026-10-05) — "—", never 100%', () => {
  it('denominator 0 → "—" for Pass and Fail; otherwise the 1-decimal Vietnamese percentage', () => {
    const none = summarizeTtmCnttFromCounts(3, 0, 0, 5);
    assert.equal(hasTtmVerdict(none), false);
    assert.equal(formatTtmPassPct(none), '—');
    assert.equal(formatTtmFailPct(none), '—');
    const some = summarizeTtmCnttFromCounts(4, 3, 1, 6);
    assert.equal(hasTtmVerdict(some), true);
    assert.equal(formatTtmPassPct(some), '75,0%');
    assert.equal(formatTtmFailPct(some), '25,0%');
    assert.equal(formatTtmPassPct(null), '—');
  });
});
