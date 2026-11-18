# Well-Read: Instructions for Contributors and Reviewers

This file is the standing brief for any person or tool that writes, reviews or changes code in this
repository, including Cursor, Claude, Codex, Copilot, Grok and human reviewers. Read it before you start.
If this file and the code disagree, the code and the applied database are the source of truth. Flag the
mismatch in your PR instead of guessing.

Related docs: `ROADMAP.md` (shipped work, backlog, decisions), `docs/product-brief.md`, `docs/architecture.md`,
`docs/runbook.md`, `docs/plans/topic-drilldowns.md`, `docs/lesson-reminders.md`, `supabase/README.md`,
`docs/decisions/` (ADRs), `SECURITY.md`. `AGENTS.md` and `CLAUDE.md` are thin pointers to this file.

If this file, another doc, the code, or the applied database disagree, the code and the project's migration
history (`list_migrations`) win. `supabase/README.md`, `docs/architecture.md` and `docs/lesson-reminders.md` can
lag. Do not apply a migration just because a README lists it as unapplied.

## 1. What Well-Read is

- A personal learning web app with one owner (Mike). Production: https://well-read-learn.vercel.app.
- The name is **Well-Read**, always with the hyphen. Earlier names (FoundationLearn, Curio) are history only.
  Never put them in new code, copy or docs.
- Core flow: Discipline -> Topic -> Lesson -> Quiz. A lesson is complete when its quiz is passed with 70% or
  higher (`score*10 >= total*7`, graded on the server).
- Other features:
  - Dig deeper: AI-generated follow-up lessons. Dig deeper is offered on a lesson only after that lesson's
    quiz has been submitted (pass or fail).
  - `/review`: the owner-only queue for publishing or rejecting AI lessons.
  - Achievements and per-discipline mastery tiers (Novice 1, Apprentice 5, Scholar 10, Luminary 20).
  - Library bookshelf with a whole-library toggle.
  - Day streaks, the Reading List, and an opt-in daily lesson reminder (Web Push).
- Non-goals for now (product brief): multiple users, social features, native mobile apps.

## 2. Stack and layout

- Next.js 16.4.5 (App Router, Cache Components) with React 19.3.0 and TypeScript (`strict`). Node 24 (`.nvmrc`,
  `engines.node`); pnpm 10.33.4, pinned in `packageManager`.
- Supabase handles auth (email/password via `@supabase/ssr`) and Postgres with row-level security (RLS).
  Lesson content is file-based, not in the database.
- Vercel hosts the app (Hobby plan); `main` auto-deploys to production, and every PR gets a preview.
  Previews use the production Supabase project (see section 4).
- Web Push for reminders (`web-push`, service worker `public/sw.js`, Declarative Web Push for iOS).
- GitHub Actions runs `ci.yml` on every push and PR. `lesson-reminders.yml` sends the daily reminder at 02:00 UTC
  (6 PM PST / 7 PM PDT).
- AI generation uses the Gemini free tier, server-side only.

| Path | What lives there |
| --- | --- |
| `src/app/` | Routes: `/`, `/learn`, `/d/[discipline]/[topic]/[lesson]`, `/dig`, `/review`, `/bookshelf`, `/achievements`, `/progress`, `/reading-list`, `/account`, `/login`, `/signup`, `/auth/*`, `api/` |
| `src/components/` | React components (Quiz, DigDeeper, ReviewCard, BookshelfView, LessonReminder, ...) |
| `src/content/` | `disciplines.json` (all lessons), `schema.ts` (types), `index.ts` (runtime validator), `ids.mjs`, `sources.mjs`, `digdeeper.mjs` (Dig deeper choice validation), `topic-redirects.mjs`, `colors.mjs` |
| `src/lib/` | Feature logic by area: `auth`, `quiz`, `progress`, `streaks`, `reading-list`, `drilldowns`, `reminders`, `supabase`, `ui`, `account`, `bookshelf` |
| `src/achievements/` | Achievement definitions and badge icons |
| `src/proxy.ts` | Session refresh, auth redirects, real 404s for unknown `/d/...` slugs |
| `supabase/migrations/` | SQL migrations (`<version>_<name>.sql`); status in `supabase/README.md` |
| `scripts/` | Ledger CLI, reminder sender, local DB test runner, client bundle scan, drill-down prototype |
| `tests/unit/`, `tests/db/` | `node:test` unit tests; SQL/RLS tests run on a throwaway local Postgres |
| `tasks/ledger.json` | Task ledger, validated in CI (see ADR 0001) |
| `docs/` | Brief, architecture, runbooks, plans, ADRs, icon sources |

Pure logic goes in `.mjs` files with JSDoc and `// @ts-check` so that `node:test` can import it and `tsc` still
type-checks it. Follow that pattern.

## 3. Local setup and commands

```sh
nvm use                         # Node 24
corepack enable                 # pnpm 10.33.4 from packageManager
cp .env.example .env.local      # client-safe Supabase URL and publishable key only
pnpm install --frozen-lockfile
pnpm dev                        # http://localhost:3000
pnpm lint                       # ESLint 9 flat config
pnpm typecheck                  # next typegen && tsc --noEmit
pnpm test                       # node --test tests/unit/*.test.mjs
pnpm test:db                    # throwaway local Postgres; needs initdb/pg_ctl/psql; refuses if DB env vars are set
pnpm build
pnpm check:bundle               # fails if server-only names reach the client bundle
node scripts/ledger.mjs validate
```

CI (`checks` job) runs all of the above except `pnpm dev`, in that order. Without `.env.local` the app still
builds, but every protected route redirects to `/login` (`/login`, `/signup` and `/auth/*` do not). Never point
local tools or tests at the production database.

Tests and prototypes must mock Gemini, email and Web Push, even when keys are present in your environment.
`scripts/drilldown-prototype.mjs` can make real Gemini calls if a key is set; do not run it against real keys
without the owner's approval.

## 4. How work flows

- **One PR per change, branched off `main`.** Never push to `main` directly. `main` has no technical branch
  protection (ADR 0001), so this rule depends on discipline.
- **Merges need the owner's explicit approval of that PR's head.** Agents that write or review code never
  merge. A PR is squash-merged (branch deleted, `--match-head-commit` on the approved SHA) only after the owner
  explicitly approves it, either by the owner or by the coordinating agent (Product Lead) acting on that approval. Approval
  passed along by another agent does not count.
- **CI must be green** before a merge is requested.
- **Merging is a production release:** `main` auto-deploys to production on Vercel.
- **Previews hit production data.** Vercel Preview uses the same production Supabase project as the live site.
  Applying a migration, or writing/deleting hosted data, from Preview or any deploy other than a throwaway
  local Postgres hits production. Don't do it without the owner's approval.
- **Migrations do not run on deploy.** They are applied separately, only with the owner's approval, then
  recorded in `supabase/README.md`.
  - Never edit, rename or re-apply an applied migration. Some applied versions differ from their filenames;
    see `supabase/README.md`.
  - Reconciling migration history (`supabase migration repair`) needs approval.
  - New migrations go in a new file and need RLS tests in `tests/db/`.
- **Each of these needs separate owner approval:**
  - Changes to env vars or secrets (Vercel, GitHub).
  - Changes to schedules or cron (`lesson-reminders.yml`).
  - Turning a feature flag or notification sending on or off.
  - Supabase dashboard settings.
  - Writes or deletes on production data, including publishing or rejecting AI lessons on someone else's behalf.
  - New accounts, services or cloud resources.
- **Feature flags:**
  - `WELL_READ_DRILLDOWNS` enables Dig deeper when exactly `1`. `/api/drilldowns` and `/dig` check it at
    request time; the lesson pages read it at build time, so only the Dig deeper choices on lesson pages need a
    redeploy to appear or disappear.
  - `WELL_READ_LESSON_REMINDERS` gates reminder sending; it is a repo variable for the scheduler.
- **Keep docs current:** update `ROADMAP.md` when something ships or is planned, and the relevant `docs/` file
  when behavior changes.
- **PR descriptions:** say what changed, why, and how it was verified (commands run, results), and call out any
  migration, env, flag or data impact. Use a link and a short summary; no screenshots needed.

## 5. Content rules

Lessons live in `src/content/disciplines.json` and are validated at load time (a bad file fails `next build`)
and in `tests/unit/content.test.mjs`.

- **Lesson shape** (`src/content/schema.ts`):
  - `id`: permanent, `les_` plus 4-12 lowercase letters or digits. Never reused or derived from the slug;
    progress is keyed on it.
  - `slug`, `title`.
  - `sections`: usually 3, each with a `heading` and a plain-text `body`. Separate paragraphs with a blank
    line; no single newlines inside a paragraph.
  - `keyFacts`: usually 5.
  - `quiz`: at least 3 questions, each with exactly 4 `options`, an `answerIndex` and a required `explanation`.
  - `sources`: required in practice; https only, unique per lesson, with `publisher` and `title`.
  - Optional `digDeeper`: 3-4 choices drawn from the lesson.
- **Quiz secrets stay on the server.** Only `question` and `options` reach the client before grading.
- **Broad topics:** a topic holds several granular lessons. Do not add single-lesson topics; extend or broaden
  an existing topic, or propose a merge.
- **Topic kinds** (`TOPIC_KINDS`): person, event, era, style, technique, process, concept, network, school,
  institution, series, civilization. Adding a kind changes the schema and its tests.
- **U.S. Presidents:** every president lesson goes in the American Civics topic "U.S. Presidents" (kind
  `series`), in office order. A president gets their own topic only if they have several lessons.
- **Merged topics stay merged:** The Renaissance (Italian and Northern), Early twentieth-century art (Cubism and
  Surrealism) and Protestant Christianity (formerly the Reformation).
- **Redirects:** when a topic or lesson URL changes, add a permanent redirect in
  `src/content/topic-redirects.mjs`. Progress is keyed on lesson ids, so URL changes need no data migration.
- **Sources:** cite real, reachable sources. Some sites block server fetches (for example Britannica and the
  Met). For lessons used by Dig deeper, include at least one fetchable source.
- **AI-generated lessons:**
  - Always labeled AI-generated.
  - Generated only from fetched source text and fact-checked against an approved source list, with at most
    1 unconfirmed claim (that lesson is flagged).
  - Shared with others only after the owner publishes it in `/review`.
  - Readers can report a lesson.
  - Caps and the 4-call limit per lesson live in `src/lib/drilldowns/config.mjs`. Lowering them is free;
    raising them needs approval.

## 6. Design rules

- **Visual system:** design "C2" in plain CSS (`src/app/globals.css`). Use the existing CSS custom properties
  (charcoal `--char` #232326, brass/gold `--brass` #a8915f, ink, paper) and the dark-mode overrides.
  - No Tailwind, CSS frameworks or web fonts.
  - Discipline colors come from tokens in `src/content/colors.mjs`, mapped only in CSS.
- **Icon:** the flat charcoal-and-gold book-spines mark (option B, polished Nov 11, 2026), with the same art at
  every size. Do not introduce realistic, ornate or bright-color icon styles, or a separate simplified tab
  icon. Sources are in `docs/design/icons/`.
- **Phone first:** 390px is the target width, with a 600px breakpoint. Touch targets are at least 44px.
  Check layouts at 375px.
- **Accessibility:**
  - Semantic elements and labels on every control.
  - Focus always visible (gold rings).
  - Keyboard support for menus and dialogs.
  - Motion off under `prefers-reduced-motion`.
  - Text contrast of at least 4.5:1.
- **Emoji:** use SVG icons in the UI, not emoji glyphs (see the badge icons in `src/achievements/icons.mjs`).
- **Public files:** add them to the public-path allowlist explicitly (`PUBLIC_PATHS` in `src/lib/auth/logic.mjs`
  and the proxy matcher). A file extension does not make a path public.

## 7. Security and privacy

- **RLS:** every user table has own-row RLS. Server reads use the user's cookie session.
- **No service role:** the app never uses the Supabase service-role key.
- **Narrow roles for privileged server work:**
  - `drilldown_server` uses `DRILLDOWN_DB_URL` and is read only by `src/lib/drilldowns/server-db.mjs`.
  - `lesson_reminder_sender` uses `LESSON_REMINDER_DB_URL` and is used by the reminder sender.
  - Both go through SECURITY DEFINER functions with revoked defaults.
- **New SQL functions:** new SECURITY DEFINER functions must use `set search_path = ''`. Revoke EXECUTE from
  PUBLIC, anon, authenticated, and service_role (hosted default ACLs grant all three). Grant EXECUTE only to the
  intended narrow role (`drilldown_server` or `lesson_reminder_sender`). Prove it in `tests/db/` with
  `has_function_privilege`. `drilldown_owner` stays RLS-on with no grants to any API or server role. Do not
  grant `fact_check` to authenticated.
- **Server-only values:** `GEMINI_API_KEY`, `DRILLDOWN_DB_URL`, `LESSON_REMINDER_DB_URL`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` (a sender setting).
  - Never give them a `NEXT_PUBLIC_` prefix.
  - Modules that read them import `server-only`.
  - `pnpm check:bundle` enforces this.
  - Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are client-safe env vars.
  - `VAPID_PUBLIC_KEY` is not `NEXT_PUBLIC_`; the Account page reads it on the server and passes it to the
    reminder component as a prop.
- **No secrets anywhere:** not in code, commits, PR text, logs, screenshots or chat. `.env.local` is
  git-ignored. If a secret is exposed, stop work and report it so it can be rotated.
- **Column-granted tables:** no wildcard reads (`select('*')`, bare `.select()`, `.insert().select()`) on
  `generated_lessons` or `lesson_reports`. A unit test checks for this.
- **Auth:**
  - Re-check `getClaims()` in every server action.
  - Never trust client-sent scores or user ids.
  - `user_metadata` is display-only.
  - Keep password-reset replies non-enumerating.
- **Testing production:** use test accounts only. Never test with the owner's account or data, never ask
  for passwords, and never send real reset emails to real accounts.
- **Vulnerability reports:** follow `SECURITY.md`.

## 8. Constraints

- **Free tiers only:** Vercel Hobby, Supabase free, Gemini free tier, GitHub Actions.
- **Approval first:** no paid services, paid AI tiers, new accounts or new cloud resources without the
  owner's approval.
- **Keep changes small and on scope.** Prefer existing dependencies; justify any new one in the PR. Avoid
  unrelated refactors and upgrades.
- **Times are Pacific:** America/Los_Angeles for dates and schedules (achievement dates, Dig deeper daily caps,
  reminders).

## 9. Review checklist

Run this on every PR:

- [ ] Scope matches the request; no unrelated changes.
- [ ] CI `checks` is green (lint, typecheck, unit, DB, build, bundle scan, ledger).
- [ ] New logic has tests, including failure paths; no tests were weakened or skipped.
- [ ] No secrets, tokens or real personal data in the diff, the PR text or logs.
- [ ] No server-only env var or module reaches client code.
- [ ] No service-role usage; new tables have RLS and `tests/db/` coverage; new SECURITY DEFINER functions set
      `search_path = ''`, revoke defaults and are proven with `has_function_privilege`.
- [ ] Nothing in the PR, its preview or its tests writes to the hosted database or calls Gemini, email or Web
      Push for real.
- [ ] No applied migration edited; any new migration is called out as needing separate approval.
- [ ] Env, flag, cron or production-data changes are listed as separate approval steps, not done in the PR.
- [ ] Content: valid lesson shape, permanent new ids, sources present, broad topics, presidents in "U.S.
      Presidents", redirects for moved URLs.
- [ ] UI: works at 375px, 44px targets, visible focus, labeled controls, no emoji glyphs, existing tokens used.
- [ ] Name is "Well-Read" everywhere; no stray old names.
- [ ] Stays on free tiers; no new paid service or account.
- [ ] `ROADMAP.md` and relevant docs updated if behavior or plans changed.

## 10. Decided against

Do not reopen these without the owner asking. Details are in `ROADMAP.md`.

- Realistic, ornate or bright-color icons; a simplified tab icon.
- Broadening Buddhism, Judaism and Islam topics; moving Judicial Review into the Constitution topic.
- Single-lesson topics.
- A separate staging branch (use Vercel PR previews).
- Paid AI tiers or paid fallbacks.
- Multiple users, social features, native apps (current non-goals).
