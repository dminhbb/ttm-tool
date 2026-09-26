<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Multi-database — local + Supabase (Aiven retired)

This project runs against two Postgres targets in parallel: the developer's local instance and a
hosted Supabase instance (see `src/lib/db.ts`, `.env.example`, `scripts/migrate-db.js`). Whenever
you change the schema (new/altered table, column, constraint, index — i.e. anything you add under
`db/migrations/`), apply it to **both** before considering the change done:

```bash
npm run db:migrate:local
npm run db:migrate:supabase
```

**Aiven is no longer used** (the owner retired it on 2026-09-26; its host no longer resolves). Do
NOT run `npm run db:migrate:aiven` / `db:init:aiven`, don't treat a missing Aiven migration as
schema drift, and don't point `DB_CONNECTION` at `aiven`. The `aiven` profile code in `db.ts` and
the npm scripts are left in place only so nothing breaks — they are not part of the workflow.

Never leave one database ahead of the other on schema. Application code (`src/lib/db.ts`) always
targets whichever profile `DB_CONNECTION` in `.env.local` selects (`local` / `supabase`; production
on Vercel uses `supabase`), so a schema drift between the two silently breaks whichever one isn't
currently selected. Hosted connection caps are low (see the `ALERT_HISTORY_RECORDING_ENABLED` flag
in `src/lib/epic-alert-phase-service.ts`, originally added for Aiven's free tier) — prefer
Supabase's "Transaction pooler" connection string (port 6543, see `.env.example`) over the direct
connection, for the same reason `db.ts` caps `max` low on the hosted profile.

# Version stamp

After finishing each user request that changes the app, regenerate `version.json` at the repo root
with a fresh build stamp: `"build": "yymmdd.hhmm"` — build date `yymmdd`, build time `hhmm` in 24h
format, separated by a dot (e.g. `260817.1748`), using the actual current date/time. This is
surfaced on the login screen footer (`src/components/layout/SystemStatusFooter.tsx`) via
`GET /api/system/status` (`src/lib/version.ts` reads the `build` field — keep the field name as
`build`, not `version`).

This rule applies regardless of which coding agent is doing the work — Claude Code, Codex, Cursor,
Antigravity, a human, whatever reads this file — since the whole point is a single, reliable
version trail across every environment (production/UAT) no matter who or what shipped the change.
As a backstop beyond just following this instruction, `.githooks/pre-commit` (activated via the
`prepare` npm script's `git config core.hooksPath .githooks` — run once per clone via `npm install`)
blocks any commit that changes app files without also staging an updated `version.json`. That hook
is the actual enforcement; this section is what tells you *why* and *how* to satisfy it before you
hit the block.

# Daily change log

This project is developed continuously across multiple machines/sessions (see `.env.local` per
machine and the "Multi-database" section above), so nobody can rely on scrollback or a single
machine's shell history to know what changed. `daily_change_log.md` at the repo root exists so the
next session — on any machine, by any agent — can catch up by reading one file instead of replaying
`git log`.

After finishing each user request that changes app code, schema, or config (not needed for
pure-review/read-only requests that changed nothing), append a short entry to
`daily_change_log.md`:

- Find today's date heading (`## yyyy-mm-dd`, using the actual current date). If it doesn't exist
  yet, create it as a new block at the very TOP of the file, right under the title/intro — newest
  date first.
- Add your summary as one or more new bullets under that heading. Never rewrite, merge away, or
  delete bullets already there from earlier requests the same day — entries accumulate; each run
  only adds to the pile.
- Keep each bullet short (what changed and, if not obvious, why) — this is a supplement to git
  history and the diff itself, not a replacement, so don't restate the whole diff. Reference
  `file/paths.ts` when it helps a future reader jump straight to the code.
- Write it in the same language the user used for the request (Vietnamese in this project, unless
  told otherwise).

Like the version-stamp rule above, this applies no matter which coding agent is doing the work —
Claude Code, Codex, Cursor, Antigravity, a human, whatever reads this file — since the point is one
reliable running log that every environment and every agent can trust and add to.

# Icons standard — phosphoricons.com

All UI icons across the application must be imported exclusively from Phosphor Icons (`@phosphor-icons/react` from `phosphoricons.com`).
When designing or updating Epic list screens (`/epic-alerts-15`, `/epic-in-po`, `/epic-alerts`, `/reports`):
- In the Epic column, use `Warning` icon for alert triggers and `ArrowSquareOut` icon for opening Jira in a new tab.
- Prepend `CaretRight` icon before date text in the START-E2E column/cell, styled with muted font-size (11px) and lighter color (`#64748b`).
- Prepend `CaretLineRight` icon before date text in the START-CNTT column/cell, styled with muted font-size (11px) and lighter color (`#64748b`).
- In status/phase stage cells, prepend `ArrowBendUpRight` icon before the baseline date text on the EXACT SAME line, using a lighter muted color (e.g. `#64748b`).
- Prepend the `Checks` icon before the actual recorded date text in the R4Golive and Released columns/cells, using solid BLACK color (`#000000`).



