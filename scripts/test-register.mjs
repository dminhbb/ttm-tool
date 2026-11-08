// Lets `node --test` run the TypeScript sources directly (Node's built-in type stripping): maps the
// tsconfig "@/*" alias to src/* and resolves extensionless imports to .ts/.tsx/index.ts, the way
// Next's bundler does. Used by `npm test` only.
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const srcRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts'];

function resolveFile(basePath) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (existsSync(candidate) && (suffix !== '' || path.extname(candidate))) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    if (specifier === 'next/server') return { url: 'data:text/javascript,export function after(fn) { try { fn(); } catch {} } export class NextResponse {} export class NextRequest {}', shortCircuit: true };
    if (specifier.startsWith('@/')) {
      const file = resolveFile(path.join(srcRoot, specifier.slice(2)));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const file = resolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
