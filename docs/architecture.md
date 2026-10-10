# Architecture

Stack (as of TSK-004):

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
- **Lesson ids (REV-001):** every lesson has a permanent, hand-assigned `id` (`les_` + 4-12 lowercase
  letters/digits, e.g. `les_rr01`), separate from its URL `slug`. Ids are never derived from the slug and never
  reused, even if a lesson is deleted. Saved progress (`lesson_completions.lesson_id`) is keyed on this id, so
  slugs and titles can change freely. `src/content/ids.mjs` rejects missing, malformed or duplicate ids
  (globally, across all disciplines) when the content loads and in unit tests.
- **Routes:** `/`, `/d/[discipline]`, `/d/[discipline]/[topic]`, `/d/[discipline]/[topic]/[lesson]`, all
  prerendered via `generateStaticParams`. `src/proxy.ts` (Next 16 Proxy) returns a real 404 for unknown
  `/d/...` slugs, because with Cache Components a `notFound()` in a streamed page keeps a 200 status.
- **Auth (TSK-004):** Supabase email/password via `@supabase/ssr` + `@supabase/supabase-js`.
  Clients in `src/lib/supabase/` (browser, server via `cookies()` getAll/setAll, proxy session refresh).
  `src/proxy.ts` refreshes the session and verifies it with `getClaims()` on every matched request, then
  (1) redirects signed-out users on any protected path to `/login?next=…`, and signed-in users on
  `/login`/`/signup` to `/`; (2) for signed-in users only, returns 404 for unknown `/d/...` slugs.
  Pure decision logic (route classes, redirects, `next` sanitising, error messages) lives in
  `src/lib/auth/logic.mjs` (JSDoc + `// @ts-check`, type-checked by `tsc` via `allowJs`) so `node:test`
  can import it. The header's user menu reads cookies inside `<Suspense>` (required by Cache Components).
  Env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is optional at build time;
  when it's missing, auth is treated as not configured and every protected page redirects to `/login`.
  `NEXT_PUBLIC_*` values are inlined at build time, so build with the env present for a working login.
- **Tooling outside the app:** `scripts/ledger.mjs` (zero-dependency task ledger CLI) with `node:test` unit tests in `tests/unit/`.
- **CI:** GitHub Actions, single job `checks` (`.github/workflows/ci.yml`).
- **Not yet decided/added:** database, auth, hosting/deployment, E2E tests.

See `docs/decisions/` for ADRs.
