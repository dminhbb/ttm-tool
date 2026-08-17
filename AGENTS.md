<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dual database — local + Aiven

This project runs against two Postgres databases in parallel: the developer's local instance and a
hosted Aiven instance (see `src/lib/db.ts`, `.env.example`, `scripts/migrate-db.js`). Whenever you
change the schema (new/altered table, column, constraint, index — i.e. anything you add under
`db/migrations/`), apply it to **both** databases before considering the change done:

```bash
npm run db:migrate:local
npm run db:migrate:aiven
```

Never leave one database ahead of the other on schema. Application code (`src/lib/db.ts`) always
targets whichever profile `DB_CONNECTION` in `.env.local` selects, so a schema drift between the
two silently breaks whichever one isn't currently selected.

# Version stamp

After finishing each user request that changes the app, regenerate `version.json` at the repo root
with a fresh build stamp: `"yymmdd.hhmm"` — build date `yymmdd`, build time `hhmm` in 24h format,
separated by a dot (e.g. `260817.1748`), using the actual current date/time. This is surfaced on
the login screen footer (`src/app/login/page.tsx`) via `GET /api/system/status`
(`src/lib/version.ts` reads the file).
