import { readFileSync } from 'fs';
import path from 'path';

/**
 * App build stamp, "yymmdd.hhmm" (24h) — read from version.json at the repo root, which an AI
 * agent regenerates after finishing each request (see AGENTS.md). Shown on the login screen
 * footer and via GET /api/system/status.
 */
export function getAppVersion(): string {
  try {
    const raw = readFileSync(path.join(process.cwd(), 'version.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'build' in parsed && typeof parsed.build === 'string') {
      return parsed.build;
    }
  } catch {
    // Fall through to the placeholder below.
  }
  return 'unknown';
}
