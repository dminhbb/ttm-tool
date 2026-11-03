/**
 * One-off fill of ttm_dashboard_metric_history (owner 2026-11-03) — the first deployment of "Xu hướng biến động chỉ số":
 * the frozen daily series starts empty, so the ~31 newest data layers (and the previous week / month comparison days) are
 * judged once, as the Epics stood on each date, with TODAY's rules (rows marked BACKFILL). Existing rows are never touched.
 * After that the cache refresh only writes the newest layer; nothing here is part of a normal run.
 *
 * Plain Node, outside the Vercel time limit — one layer takes ~30-40 s of database and CPU work, so it is slow on purpose:
 * layers run one at a time with a pause between them (a free-tier database).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/script-register.mjs \
 *        scripts/backfill-ttm-metric-history.ts              # lists what it would do (writes nothing)
 *   … scripts/backfill-ttm-metric-history.ts --confirm        # does it, against DB_CONNECTION of .env.local
 *   … --confirm --limit=2 --pause-ms=5000                     # only the first 2 missing layers, 5 s between layers
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env') as { loadEnvConfig: (dir: string) => unknown };
loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const numberArg = (name: string, fallback: number) => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const { default: pool, resolveDbConnectionTarget } = await import('@/lib/db');
const { backfillLayerHistory, listNeededHistoryDates, missingHistoryDates, refreshDashboardTrendCache } = await import('@/lib/ttm-dashboard-trend-service');

try {
  const target = resolveDbConnectionTarget();
  const { all, layers } = await listNeededHistoryDates();
  const latest = layers[0];
  // The newest layer is written by the normal refresh at the end, not judged again here.
  const missing = (await missingHistoryDates(all.filter((date) => date !== latest))).sort().reverse();
  const limit = numberArg('limit', missing.length);
  const todo = missing.slice(0, limit);

  console.log(`Database: ${target}. Newest layer: ${latest ?? '(none)'}.`);
  console.log(`Layers wanted: ${all.length}; already in the history: ${all.length - missing.length - (all.includes(latest) ? 1 : 0)}; to fill: ${missing.length}${limit < missing.length ? ` (this run: ${limit})` : ''}.`);
  for (const date of todo) console.log(`  - ${date}`);

  if (!flag('confirm')) {
    console.log('\nNothing written. Add --confirm to fill them (about 30-40 s per layer).');
  } else {
    const pauseMs = numberArg('pause-ms', 3_000);
    const startedAt = Date.now();
    for (const [index, date] of todo.entries()) {
      const layerStart = Date.now();
      const { scopes } = await backfillLayerHistory(date);
      console.log(`[${index + 1}/${todo.length}] ${date}: ${scopes} scopes in ${Math.round((Date.now() - layerStart) / 1000)}s`);
      if (index < todo.length - 1) await sleep(pauseMs);
    }
    const written = await refreshDashboardTrendCache();
    console.log(`Newest layer written and the dashboard rows rebuilt (${written} scopes). Done in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
  }
} finally {
  await pool.end();
}
