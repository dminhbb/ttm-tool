<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Multi-database — local + Aiven + Supabase

This project runs against up to three Postgres targets in parallel: the developer's local instance,
a hosted Aiven instance, and a hosted Supabase instance (see `src/lib/db.ts`, `.env.example`,
`scripts/migrate-db.js`). Whenever you change the schema (new/altered table, column, constraint,
index — i.e. anything you add under `db/migrations/`), apply it to **every profile currently in
use** before considering the change done:

```bash
npm run db:migrate:local
npm run db:migrate:aiven
npm run db:migrate:supabase
```

Never leave one database ahead of the others on schema. Application code (`src/lib/db.ts`) always
targets whichever profile `DB_CONNECTION` in `.env.local` selects (`local` / `aiven` / `supabase`),
so a schema drift between profiles silently breaks whichever one isn't currently selected. Aiven's
free tier has a very low connection cap (see the `ALERT_HISTORY_RECORDING_ENABLED` flag in
`src/lib/epic-alert-phase-service.ts`, added because of it) — Supabase was added as a profile for
the same reason; prefer its "Transaction pooler" connection string (port 6543, see `.env.example`)
over the direct connection for the same reason `db.ts` caps `max` low on both hosted profiles.

# Version stamp

After finishing each user request that changes the app, regenerate `version.json` at the repo root
with a fresh build stamp: `"yymmdd.hhmm"` — build date `yymmdd`, build time `hhmm` in 24h format,
separated by a dot (e.g. `260817.1748`), using the actual current date/time. This is surfaced on
the login screen footer (`src/app/login/page.tsx`) via `GET /api/system/status`
(`src/lib/version.ts` reads the file).
