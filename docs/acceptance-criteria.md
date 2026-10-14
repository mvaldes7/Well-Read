# Acceptance Criteria

Source: approved product brief (Mike, 2026-10-09), `docs/product-brief.md`.

## Product-level criteria

| ID | Criterion | Task |
| --- | --- | --- |
| AC-1 | Content is organised as discipline → topic → lesson, and each lesson has a quiz. Each quiz question has an explanation, shown only after the quiz is graded (never in the page before submit). Lessons list their sources (publisher, linked title, optional note; https links opening in a new tab). | TSK-003 / TSK-005 / TSK-012 |
| AC-2 | A lesson counts as complete only when its quiz is passed with a score of 70% or higher; a lower score doesn't complete it. | TSK-005 |
| AC-3 | Completion is saved to Supabase and syncs for the signed-in user. | TSK-005 |
| AC-4 | Per-discipline mastery from the discipline's count n of distinct passed lessons (ids in content, across all its topics): n = 0 = "Not started"; Novice at 1, Apprentice at 5, Scholar at 10, Luminary at 20, with progress n of the next threshold ("3/5 to Apprentice"). Shown as a mastery card per discipline on `/achievements` ("N lessons · Tier" + 4-step track) and as a tier badge + progress on the topic page; bookshelf spines show no level. (Replaced the TSK-011 per-topic levels.) | TSK-011 / TSK-019 |
| AC-5 | The bookshelf shows one book per topic with at least one passed lesson, grouped by discipline; books in the same discipline share a cover color. | TSK-006 |
| AC-6 | A protected `/achievements` page, linked from the sidebar's **Badges** link (TSK-015), lists the starter set; earned ones show "Earned <date>" when the exact first-pass time is known (`first_passed_at`, TSK-012) and otherwise "Earned by <date>" (an upper bound from `completed_at`), locked ones are dimmed with their requirement (text >= 4.5:1). Starter set: **First Lesson** (pass any lesson); **Perfect Score** (best attempt with score = total on any lesson); **Discipline Explorer** (pass a lesson in every discipline); **<Discipline>: <Tier>**, one per discipline (earned at Novice, shows the current tier, dated by the k-th first pass with k = the tier threshold; locked: "Pass a lesson in <Discipline>."); **Completionist: <Discipline>**, one per discipline (pass every lesson in it). | TSK-011 / TSK-012 / TSK-019 |
| AC-7 | Login uses Supabase email/password. Public sign-ups are disabled later, only with Mike's approval. | TSK-004 |

## TSK-003: Browse and read lessons from seed files

| ID | Criterion |
| --- | --- |
| TSK-003-1 | Seed content is stored in the repo as typed data (`src/content/`), checked against a TS schema: Discipline {slug, title, description, topics} > Topic {slug, title, kind: person/event/era/style, summary, lessons} > Lesson {slug, title, sections[{heading, body}], keyFacts[], quiz[{question, options[4], answerIndex}]}. |
| TSK-003-2 | The seed includes 2 disciplines (World History, Philosophy), each with 2 topics, and 1-2 short, factually accurate lessons per topic. |
| TSK-003-3 | Every lesson has 3-5 quiz questions, each with exactly 4 options and one correct `answerIndex` (0-3). Quiz data is stored but not rendered. |
| TSK-003-4 | `/` shows the site title (now "Well-Read", TSK-013) and lists disciplines. |
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

## TSK-012: Content batch, sources, explanations, first_passed_at

| ID | Criterion |
| --- | --- |
| TSK-012-1 | Mike's 6 lessons are imported verbatim minus citations, in 4 new disciplines (order: World History, Philosophy, Ancient History, American Civics, Art History, Poetry & Literature), each with a slug, one-line description and color. |
| TSK-012-2 | `Lesson.sources?` = `{publisher, title, url, note?}[]` (https only, unique per lesson); `QuizQuestion.explanation` is required. Both are validated in the TS loader and the `.mjs` validators, with tests. No citation markers remain in any text field. |
| TSK-012-3 | Each lesson ends with a Sources list; links use `target="_blank"` and `rel="noopener noreferrer"` with a screen-reader hint. |
| TSK-012-4 | `toPublicQuestions` sends only question text and options; `submitQuiz` returns explanations only after grading; neither answers nor explanations appear in client bundles or prerendered HTML/RSC. |
| TSK-012-5 | The 6 seed lessons are rewritten in the long format (3 sections × 3 paragraphs, 5 key facts, 6 applied questions with explanations, reputable sources), keeping their ids and slugs. |
| TSK-012-6 | A new migration (`20261010181930_first_passed_at.sql`, applied to dev 2026-10-10 with Mike's approval) adds `lesson_completions.first_passed_at` (backfilled from `completed_at` for passed rows, check `passed or first_passed_at is null`). The app sets it once on the first pass and works with or without the column. |
