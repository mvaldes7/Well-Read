# Architecture: Well-Read

Stack (as of TSK-011). Display name: **Well-Read** (TSK-013); the repo is github.com/mvaldes7/Well-Read and the Vercel project is `well-read`; production is https://well-read-learn.vercel.app.

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
  Applied migrations and their versions: see `supabase/README.md`. The `STATUS:` headers inside
  migration files are historical and may be stale.
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
- **Cache Components and per-user state (TSK-010):** Next keeps visited routes mounted inside React
  `<Activity>` and only hides them on navigation, so client state survives a reopen. `Quiz` starts a fresh
  attempt in an effect cleanup (Activity runs it on hide), so a reopened lesson always shows the quiz form
  under the server-rendered "Completed" line; Retake stays available after a pass. The Supabase server client
  awaits `connection()` before supabase-js loads the session (it calls `Date.now()`, which isn't allowed in the
  prerender/runtime stage), and catches around Supabase calls call `unstable_rethrow` first so Next's internal
  aborts are never turned into an error state.
- **Names and /account (TSK-010):** signup asks for first and last name; `validateNames` in
  `src/lib/account/names.mjs` (pure, tested) trims, NFC-normalises, allows any script, requires 1–50
  characters (code points) and rejects control and bidi-override characters. They're stored only in Supabase
  Auth `user_metadata` (`first_name`, `last_name`) via `signUp({ options: { data } })`; no tables or migrations.
  `/account` (protected like every non-public path) edits them with the `updateName` server action: validate,
  re-check `getClaims()`, `auth.updateUser({ data })` with the cookie client, then `refreshSession()` and
  `refresh()`. The header ("Hi, <first name>" linking to `/account`, email fallback, full name + email in
  `title`, ellipsis for long values) reads the name from the **verified JWT claims' `user_metadata`** via
  `getClaims()`, which it already calls: no extra network round trip per page. Claims only change when a new
  access token is issued, hence the `refreshSession()` after saving; if that refresh failed, the new name would
  appear at the next token refresh. `user_metadata` is user-editable, so names are display only and never used
  for authorization. React escapes them; no `dangerouslySetInnerHTML`.
- **Mastery (TSK-019, AC-4; replaces the TSK-011 per-topic levels):** `src/lib/progress/mastery.mjs` (pure,
  tested). Per-discipline tiers from n = the discipline's count of distinct passed lessons across all its topics
  (`passedInDiscipline` over the deduped per-lesson lookup, so only ids in content count): **Novice 1, Apprentice
  5, Scholar 10, Luminary 20**; n = 0 is "Not started". `masteryFor(n)` returns `{passed, tier, tierIndex, next,
  toward, needed, remaining}`; bad input is clamped (non-numbers, NaN, negatives -> 0; fractions floored).
  `masteryLine` gives "N lessons · Tier", `nextTierText` "3/5 to Apprentice" / "Highest tier reached". Computed
  per request from content + completions, so new lessons count automatically; nothing is stored. Shown as
  mastery cards (4-step tier track) on `/achievements` and as a tier badge + `<progress>` on the topic page.
  Bookshelf spines carry no level; the per-topic brass-tag count uses `passedInTopic` in `logic.mjs`.
- **Achievements (TSK-011, AC-6):** defined in ONE file, `src/achievements/definitions.mjs` (JSDoc types).
  Each definition is `single` or `perDiscipline` (generated from content) with a pure evaluator over
  a context built once from the user's rows + content (`bestCompletions`: best attempt per known lesson,
  with its `completed_at`). `evaluateAchievements(rows, content)` returns results in definition/content order.
  To add one, append a definition. Nothing is stored; `/achievements` computes the board on the server from
  `getMyProgress()` (which now also selects `completed_at`, read-only) + `src/content`. Ids for generated
  achievements use slugs (`mastery:<discipline>`, `completionist:<discipline>`), UI-only and never stored (REV-007).
  Set (TSK-019): 3 milestones + per discipline one mastery achievement (current tier) and one Completionist.
  **Date semantics:** `completed_at` is rewritten whenever a better attempt is saved, so it is the time of the
  BEST attempt and never earlier than the real pass. Without `first_passed_at` (see TSK-012 below) a date is
  therefore an upper bound and the UI says **"Earned by <date>"**: an achievement needing k passed lessons uses the k-th earliest `completed_at` among
  qualifying lessons ("any" = earliest, "all of" = latest; a discipline's mastery tier uses k = the tier threshold 1/5/10/20, i.e. the date of the k-th lesson first passed in it;
  Discipline Explorer = latest of each discipline's earliest). Rows without a date are skipped; when fewer than k
  are dated, the date is omitted ("Earned"). Dates are formatted on the server, en-US, in
  **America/Los_Angeles** (`formatEarnedDate`), so they don't depend on the server's time zone.
- **Sources and explanations (TSK-012):** `Lesson.sources?` and the required `QuizQuestion.explanation` are
  checked by `src/content/sources.mjs` (https-only URLs via `new URL`, required publisher/title, per-lesson URL
  dedupe, explanations, and a citation-markup scan of every text field), used by both `src/content/index.ts` and
  `node:test`. Quiz secrets stay on the server: the lesson page passes `toPublicQuestions(quiz)`
  (`src/lib/quiz/public.mjs`, a whitelist of `question` + `options`) to the client `Quiz`; `gradeQuiz` adds each
  question's `explanation` to the per-question results that `submitQuiz` returns after grading. Section bodies
  are plain text with blank-line paragraphs (`paragraphs()` in `src/lib/ui/paragraphs.mjs`).
- **first_passed_at (TSK-012):** migration `20261010181930_first_passed_at.sql` (applied to dev 2026-10-10 with Mike's approval)
  adds a nullable `first_passed_at`, backfills passed rows from `completed_at` (so backfilled values are upper
  bounds), and checks `passed or first_passed_at is null`. `saveBestAttempt` stamps it without a read: the
  insert includes it when the first attempt passes; for later passing attempts the first update step matches
  only a NOT-passed row (so it's the first pass) and stamps it, and the second step improves an already-passed
  row without touching it. Each step is atomic in Postgres, so concurrent passes can't overwrite the stamp. The
  value uses the app server's clock. Until the migration is applied, `isMissingColumnError` (42703/PGRST204
  naming the column) makes writes retry without the column and `getMyProgress` re-select without it.
  Achievements then use `first_passed_at` for exact dates ("Earned <date>") when every qualifying lesson has
  one, else the `completed_at` upper bound ("Earned by <date>"); Perfect Score always uses `completed_at`
  (its event is the first perfect attempt, not the first pass).
- **Path guard:** only `/_next/static/*`, `/_next/image*`, `/_next/webpack-hmr` (dev), `/auth/confirm`, `/auth/forgot`, `/auth/reset` (TSK-018) and the exact
  icon/manifest paths `/favicon.ico`, `/icon.svg`, `/apple-icon.png`, `/manifest.webmanifest`,
  `/icons/well-read-192.png` and `/icons/well-read-512.png` (TSK-013) are public (`PUBLIC_PATHS`/`PUBLIC_PREFIXES` in `src/lib/auth/logic.mjs`, kept in sync
  with the proxy matcher). A file extension doesn't make a path public. Add any future `public/` files to
  the allowlist explicitly.
- **Email confirmation:** `GET /auth/confirm?token_hash&type&next` calls `verifyOtp` and redirects to a safe
  `next` (or `/`), or to `/login?error=confirm_failed`. It's only used once the Supabase "Confirm signup"
  email template links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`.
  That's a dashboard change needing Mike's approval and hasn't been made. It also exchanges a PKCE `?code`
  (`exchangeCodeForSession`) and sends recovery failures to `/auth/reset?error=invalid_link`.
- **Password reset (TSK-018):**
  - `/auth/forgot` calls `resetPasswordForEmail` with `redirectTo = <trusted origin>/auth/confirm?next=/auth/reset`.
    The trusted origin is the request origin only if it's the production URL, this Vercel deployment's
    `VERCEL_URL`/`VERCEL_BRANCH_URL`/`VERCEL_PROJECT_PRODUCTION_URL`, or localhost off Vercel; otherwise production.
  - **Anti-enumeration:** the reply is always "If that account exists, we sent a link." (plus a "try again later"
    hint). The Supabase result is ignored entirely, including rate limits: the per-address limit only hits existing
    accounts. The action takes at least 1.2 s to blunt timing differences.
  - Links: the default template (`{{ .ConfirmationURL }}`) works through the PKCE `?code` exchange (same browser
    only, `amr` = `recovery`). The cross-device option is the token-hash template
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset` (`amr` = `otp`), a
    dashboard change needing Mike's approval.
  - `/auth/reset` shows the form only for a **recovery session**: verified JWT `amr` contains `recovery`, `otp` or
    `magiclink` (Supabase's own `Session.IsRecovery()` rule) from the last 15 minutes. The server action
    re-checks this before `updateUser({ password })`, then redirects to `/?notice=password_updated`. A normal
    signed-in session is sent to `/account`; no session or a failed link shows the invalid-link message.
  - `/account` → Change password: current + new + confirm. The current password is re-checked with
    `signInWithPassword` on a throwaway in-memory client, so the user's cookies are untouched. Its extra session
    is ended at once with `signOut({ scope: "local" })`, never `global`. `current_password` is also passed to
    `updateUser`, so Supabase enforces it if "require current password" is turned on.
  - Supabase signs out the user's other sessions after any password change.
  - Rules: min 8 characters, max 72 bytes (bcrypt), must match.
- **Tooling outside the app:** `scripts/ledger.mjs` (zero-dependency task ledger CLI) with `node:test` unit tests in `tests/unit/`.
- **CI:** GitHub Actions, single job `checks` (`.github/workflows/ci.yml`).
- **Not yet decided/added:** database, auth, hosting/deployment, E2E tests.

See `docs/decisions/` for ADRs.
