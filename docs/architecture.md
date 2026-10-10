# Architecture

Stack (as of TSK-006):

- **Framework:** Next.js 16.4.0 (App Router, Turbopack), React 19.3.0, source in `src/app/`.
- **Language:** TypeScript 5.x, `strict: true` (`tsconfig.json`), import alias `@/*` → `src/*`.
- **Runtime:** Node.js 24 (`engines.node: "24.x"`, `.nvmrc`). CI uses Node 24; Vercel picks the major from
  `engines.node` (overriding the project setting). `@types/node` ^24. `pnpm test` passes test files explicitly
  (`tests/unit/*.test.mjs`) because Node 22+ treats `--test` arguments as globs, not directories.
- **Package manager:** pnpm 10.33.4 (pinned via `packageManager`), lockfile `pnpm-lock.yaml` committed.
  `pnpm-workspace.yaml` leaves the `sharp` and `unrs-resolver` install scripts un-run (`ignoredBuiltDependencies`).
- **Lint:** ESLint 9 flat config (`eslint.config.mjs`) with `eslint-config-next` (core-web-vitals + typescript).
  `next lint` is not available in Next.js 16, so the ESLint CLI is used directly.
- **Styling:** design C2 ("gallery", TSK-008) in plain CSS, `src/app/globals.css`, no Tailwind/CSS deps.
  Design tokens are CSS custom properties in `:root` (light) plus a `prefers-color-scheme: dark` override;
  system font stacks only (no network fonts). Mobile breakpoint at 600px (390px is the target width).
  Focus is always visible (`:focus-visible`), and transitions are disabled under `prefers-reduced-motion`.
  Bookshelf spines get a deterministic width, height, shade and title font size from `spineStyle()` in
  `src/lib/progress/logic.mjs` (FNV-1a hash of `discipline/topic`, title-aware so vertical titles fit).
  Bounds are measured from mockup C2: 60-74px wide, 250-286px tall in a 340px case (310px on mobile, same px).
  The header nav is in the static shell (client `MainNav`, no auth data); only the email + sign-out stream in.
  Focus rings are gold: `--ring` on light surfaces, `--ring-on-dark` on the header, cases and placard.
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
- **Quiz + completion (TSK-005):** the lesson page passes only `{question, options}` to the client `Quiz`
  component (no `answerIndex`). The `submitQuiz` server action takes `{lessonId, answers}`, re-checks auth with
  `getClaims()`, looks the lesson up by permanent id, validates and grades on the server
  (`src/lib/quiz/logic.mjs`; pass = `score*10 >= total*7`), and never accepts a client score.
  The best attempt is saved to `public.lesson_completions` with the user's session (RLS, no service role):
  `INSERT … ON CONFLICT DO NOTHING`, then one conditional `UPDATE` that only matches a worse row, so a
  passed row is never downgraded, even under concurrent submits. If saving fails (e.g. migration not applied),
  the graded result is still shown with a "couldn't be saved" note.
  Migration: `supabase/migrations/20261010040740_lesson_completions.sql`, applied to the dev project on
  2026-10-09 with Mike's approval. The file is kept byte-identical to what was applied, so its header still
  says "UNAPPLIED"; the applied status is tracked here and in the ledger, not by editing the file.
- **Progress reads (TSK-006):** `getMyProgress()` (`src/lib/progress/data.ts`, React `cache` per request)
  re-checks `getClaims()`, then selects only `lesson_id, score, total, passed` for the user with the cookie
  session (RLS). Errors become a non-leaky message, never a crash. Pure helpers in
  `src/lib/progress/logic.mjs` drop malformed rows and unknown lesson ids, dedupe duplicates with the
  best-attempt rule, and build the bookshelf as groups `[{discipline: {slug,title,color}, books}]`: one book
  per topic with 1+ passed lessons, grouped by discipline, **in content order** (discipline, then topic),
  with no empty groups. Each discipline has a required `color` token (`src/content/colors.mjs`: crimson, navy,
  forest, amber, plum, slate) validated by the loader and the .mjs validator; tokens map to real colors only
  in `globals.css` (`.cover-<token>` defines a 3-shade family `--shade-0..2`), all keeping spine titles
  (#efe3c8) >= 4.5:1 even under the spine highlight. Per-user UI (`/bookshelf` shelf, topic-list ✓ markers,
  the lesson "Completed – best X/Y" / "Best attempt so far" line) renders inside `<Suspense>`, so the page
  shells stay prerendered and only the user's part streams in.
- **Path guard:** only `/_next/static/*`, `/_next/image*`, `/_next/webpack-hmr` (dev), `/favicon.ico` and
  `/auth/confirm` are public (`PUBLIC_PATHS`/`PUBLIC_PREFIXES` in `src/lib/auth/logic.mjs`, kept in sync
  with the proxy matcher). A file extension doesn't make a path public. Add any future `public/` files to
  the allowlist explicitly.
- **Email confirmation:** `GET /auth/confirm?token_hash&type&next` calls `verifyOtp` and redirects to a safe
  `next` (or `/`), or to `/login?error=confirm_failed`. It's only used once the Supabase "Confirm signup"
  email template links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`.
  That's a dashboard change needing Mike's approval and hasn't been made.
- **Tooling outside the app:** `scripts/ledger.mjs` (zero-dependency task ledger CLI) with `node:test` unit tests in `tests/unit/`.
- **CI:** GitHub Actions, single job `checks` (`.github/workflows/ci.yml`).
- **Not yet decided/added:** database, auth, hosting/deployment, E2E tests.

See `docs/decisions/` for ADRs.
