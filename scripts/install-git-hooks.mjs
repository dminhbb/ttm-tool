#!/usr/bin/env node
// `npm run prepare` (runs on every `npm install`): point git at the committed .githooks/ directory, so the pre-commit
// hook that enforces the version.json build stamp (AGENTS.md "Version stamp") is active in every clone.
//
// Plain Node instead of a shell one-liner (2026-11-26, REQ-20261126-02): the former
// `command -v git >/dev/null && git config … || true` is POSIX shell syntax, which npm runs through cmd.exe on Windows —
// it failed there ("The system cannot find the path specified") and silently skipped the hook on fresh Windows clones.
// Never fails the install: no git on the machine (Docker / CI images) or not inside a git work tree (e.g. a Vercel build
// folder) → nothing to do.
import { spawnSync } from 'node:child_process';

const insideWorkTree = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
if (insideWorkTree.error || insideWorkTree.status !== 0) process.exit(0);

const configured = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (configured.error || configured.status !== 0) {
  console.warn('[install-git-hooks] Could not set core.hooksPath to .githooks — run it by hand: git config core.hooksPath .githooks');
}
process.exit(0);
