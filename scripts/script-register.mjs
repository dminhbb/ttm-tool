// For one-off maintenance scripts that import app code (scripts/backfill-ttm-metric-history.ts): the test loader's
// "@/" alias and extensionless imports, plus `server-only` — a marker module Next.js resolves by itself (it is not an
// npm dependency of this repo), which plain Node cannot find. Never used by the app or by `npm test`.
import { registerHooks } from 'node:module';
import './test-register.mjs';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
