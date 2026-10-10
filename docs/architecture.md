# Architecture

Stack (as of TSK-003):

- **Framework:** Next.js 16.4.0 (App Router, Turbopack), React 19.3.0, source in `src/app/`.
- **Language:** TypeScript 5.x, `strict: true` (`tsconfig.json`), import alias `@/*` → `src/*`.
- **Runtime:** Node.js >= 20.9.0 (Next.js engines requirement); CI uses Node 20.
- **Package manager:** pnpm 10.33.4 (pinned via `packageManager`), lockfile `pnpm-lock.yaml` committed.
  `pnpm-workspace.yaml` leaves the `sharp` and `unrs-resolver` install scripts un-run (`ignoredBuiltDependencies`).
- **Lint:** ESLint 9 flat config (`eslint.config.mjs`) with `eslint-config-next` (core-web-vitals + typescript).
  `next lint` is not available in Next.js 16, so the ESLint CLI is used directly.
- **Styling:** none yet (no Tailwind).
- **Next config:** create-next-app 16.4.0 defaults (`cacheComponents`, `partialPrefetching`) plus `agentRules: false` so `next dev` does not generate `AGENTS.md`.
- **Content (TSK-003):** seed lessons in `src/content/disciplines.json`, types in `src/content/schema.ts`,
  and a loader in `src/content/index.ts` that checks the JSON at runtime and narrows it to those types
  (a bad seed file fails `next build`). The JSON is also read directly by `tests/unit/content.test.mjs`.
- **Routes:** `/`, `/d/[discipline]`, `/d/[discipline]/[topic]`, `/d/[discipline]/[topic]/[lesson]`, all
  prerendered via `generateStaticParams`. `src/proxy.ts` (Next 16 Proxy) returns a real 404 for unknown
  `/d/...` slugs, because with Cache Components a `notFound()` in a streamed page keeps a 200 status.
- **Tooling outside the app:** `scripts/ledger.mjs` (zero-dependency task ledger CLI) with `node:test` unit tests in `tests/unit/`.
- **CI:** GitHub Actions, single job `checks` (`.github/workflows/ci.yml`).
- **Not yet decided/added:** database, auth, hosting/deployment, E2E tests.

See `docs/decisions/` for ADRs.
