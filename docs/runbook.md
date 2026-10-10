# Runbook

## Prerequisites

- Node.js >= 20.9.0 (CI uses Node 20)
- pnpm 10.33.4 (`corepack enable` picks it up from `packageManager`, or `npm i -g pnpm@10.33.4`)

## Environment

Copy `.env.example` to `.env.local` and fill in the dev Supabase project's URL and publishable key
(client-safe values only; never a service-role/secret key). `.env.local` is git-ignored.
Without it the app builds and runs, but login is unavailable and every page redirects to `/login`.

## Local development

```sh
pnpm install            # use --frozen-lockfile to match CI
pnpm dev                # http://localhost:3000 (use --port <n> to change)
```

## Checks (same as CI job `checks`)

```sh
pnpm install --frozen-lockfile
pnpm lint               # eslint . (flat config)
pnpm typecheck          # next typegen && tsc --noEmit
pnpm test               # node --test tests/unit/
pnpm build              # next build
node scripts/ledger.mjs validate
```

## Database migrations

- Migrations live in `supabase/migrations/<UTC timestamp>_<name>.sql` and are applied only with Mike's approval.
- **Never edit an applied migration** (not even comments). Keep it byte-identical to what was applied.
- New schema changes go in **new migration files with new timestamps**.

## Task ledger

```sh
node scripts/ledger.mjs list
node scripts/ledger.mjs status <id> "<State>" --note "<text>" --actor <name>
```

Use `LEDGER_PATH=/tmp/copy.json` (or `--file`) to experiment without touching `tasks/ledger.json`.
