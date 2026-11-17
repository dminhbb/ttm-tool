import versionFile from '../../version.json';

/**
 * App build stamp, "yymmdd.hhmm" (24h) — from version.json at the repo root, which an AI agent regenerates after
 * finishing each request (see AGENTS.md). Shown on the login screen footer and via GET /api/system/status.
 *
 * The file is imported (bundled by `next build`), not read from disk at runtime: reading
 * `process.cwd()/version.json` returned 'unknown' wherever the server is started from another working directory
 * (Windows service / PM2 / scheduled task on the company's internal deployment) or the runtime folder does not carry
 * the file. The stamp therefore always matches the code that was built.
 */
export function getAppVersion(): string {
  const build: unknown = (versionFile as { build?: unknown }).build;
  return typeof build === 'string' && build.trim() ? build : 'unknown';
}
