# Acceptance Criteria

Source: approved product brief (Mike, 2026-10-09), `docs/product-brief.md`.

## Product-level criteria

| ID | Criterion | Task |
| --- | --- | --- |
| AC-1 | Content is organised as discipline → topic → lesson, and each lesson has a quiz. | TSK-003 / TSK-005 |
| AC-2 | A lesson counts as complete only when its quiz is passed with a score of 70% or higher; a lower score doesn't complete it. | TSK-005 |
| AC-3 | Completion is saved to Supabase and syncs for the signed-in user. | TSK-005 |
| AC-4 | Per-topic level: 0 completed lessons = no level; 1-4 = L1; 5-9 = L2; then +1 level per further 5 lessons (level = 1 + floor(completed / 5) for completed >= 1). | TSK-007 |
| AC-5 | The bookshelf shows each topic, with each completed lesson shown as a book. | TSK-006 |
| AC-6 | A separate achievements menu exists (the final achievement list is not yet defined). | TSK-007 |
| AC-7 | Login uses Supabase email/password. Public sign-ups are disabled later, only with Mike's approval. | TSK-004 |

## TSK-003: Browse and read lessons from seed files

| ID | Criterion |
| --- | --- |
| TSK-003-1 | Seed content is stored in the repo as typed data (`src/content/`), checked against a TS schema: Discipline {slug, title, description, topics} > Topic {slug, title, kind: person/event/era/style, summary, lessons} > Lesson {slug, title, sections[{heading, body}], keyFacts[], quiz[{question, options[4], answerIndex}]}. |
| TSK-003-2 | The seed includes 2 disciplines (World History, Philosophy), each with 2 topics, and 1-2 short, factually accurate lessons per topic. |
| TSK-003-3 | Every lesson has 3-5 quiz questions, each with exactly 4 options and one correct `answerIndex` (0-3). Quiz data is stored but not rendered. |
| TSK-003-4 | `/` shows the site title "FoundationLearn" and lists disciplines. |
| TSK-003-5 | `/d/[discipline]` lists topics; `/d/[discipline]/[topic]` lists lessons; `/d/[discipline]/[topic]/[lesson]` renders the lesson's sections and key facts. |
| TSK-003-6 | An unknown discipline, topic or lesson slug returns a real HTTP 404 with a not-found page. |
| TSK-003-7 | Pages use semantic HTML, have breadcrumb/back links and plain, readable styling, with no new dependencies. |
| TSK-003-8 | Unit tests (`pnpm test`) check: 3+ quiz questions per lesson, exactly 4 options each, answerIndex within 0-3, unique slugs per scope, non-empty disciplines/topics, and valid topic kinds. |
| TSK-003-9 | `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally and in CI. |
