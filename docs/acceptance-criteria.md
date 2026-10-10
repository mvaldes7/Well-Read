# Acceptance Criteria

Source: approved product brief (Mike, 2026-10-09), `docs/product-brief.md`.

## Product-level criteria

| ID | Criterion | Task |
| --- | --- | --- |
| AC-1 | Content is organised as discipline → topic → lesson, and each lesson has a quiz. | TSK-003 / TSK-005 |
| AC-2 | A lesson counts as complete only when its quiz is passed with a score of 70% or higher; a lower score doesn't complete it. | TSK-005 |
| AC-3 | Completion is saved to Supabase and syncs for the signed-in user. | TSK-005 |
| AC-4 | Per-topic level: 0 completed lessons = no level; 1-4 = L1; 5-9 = L2; then +1 level per further 5 lessons (level = 1 + floor(completed / 5) for completed >= 1). | TSK-008 |
| AC-5 | The bookshelf shows one book per topic with at least one passed lesson, grouped by discipline; books in the same discipline share a cover color. | TSK-006 |
| AC-6 | A separate achievements menu exists (the final achievement list is not yet defined). | TSK-008 |
| AC-7 | Login uses Supabase email/password. Public sign-ups are disabled later, only with Mike's approval. | TSK-004 |

## TSK-003: Browse and read lessons from seed files

| ID | Criterion |
| --- | --- |
| TSK-003-1 | Seed content is stored in the repo as typed data (`src/content/`), checked against a TS schema: Discipline {slug, title, description, topics} > Topic {slug, title, kind: person/event/era/style, summary, lessons} > Lesson {slug, title, sections[{heading, body}], keyFacts[], quiz[{question, options[4], answerIndex}]}. |
| TSK-003-2 | The seed includes 2 disciplines (World History, Philosophy), each with 2 topics, and 1-2 short, factually accurate lessons per topic. |
| TSK-003-3 | Every lesson has 3-5 quiz questions, each with exactly 4 options and one correct `answerIndex` (0-3). Quiz data is stored but not rendered. |
| TSK-003-4 | `/` shows the site title "Curio" and lists disciplines. |
| TSK-003-5 | `/d/[discipline]` lists topics; `/d/[discipline]/[topic]` lists lessons; `/d/[discipline]/[topic]/[lesson]` renders the lesson's sections and key facts. |
| TSK-003-6 | An unknown discipline, topic or lesson slug returns a real HTTP 404 with a not-found page. |
| TSK-003-7 | Pages use semantic HTML, have breadcrumb/back links and plain, readable styling, with no new dependencies. |
| TSK-003-8 | Unit tests (`pnpm test`) check: 3+ quiz questions per lesson, exactly 4 options each, answerIndex within 0-3, unique slugs per scope, non-empty disciplines/topics, and valid topic kinds. |
| TSK-003-9 | `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally and in CI. |

## TSK-004: Supabase email/password login

| ID | Criterion |
| --- | --- |
| TSK-004-1 | `/login` signs in with email + password; `/signup` creates an account and shows "check your email" when no session is returned. Links between the two. |
| TSK-004-2 | The whole app requires login: signed-out requests to `/` and `/d/*` redirect to `/login` (with a same-origin `next`); signed-in users on `/login` or `/signup` go to `/`. |
| TSK-004-3 | The header shows the signed-in email and a sign-out button that redirects to `/login`. |
| TSK-004-4 | Errors: empty fields, "Invalid email or password." (no account enumeration), unconfirmed email, and a generic fallback. No credentials are logged. |
| TSK-004-5 | Protection decisions use `getClaims()` (never `getSession()`); the session is refreshed in `src/proxy.ts`. |
| TSK-004-6 | Build and CI pass without Supabase env; at runtime missing env fails safe (treated as signed out). |
