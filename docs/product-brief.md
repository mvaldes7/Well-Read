# Product Brief: Well-Read

Display name **Well-Read** (TSK-013, Mike's choice). Production: https://well-read-learn.vercel.app.

## Brand

- **Name:** Well-Read, always with the hyphen.
- **Icon:** option B, "book spines on a shelf" (chosen 2026-10-13). A simplified, pixel-aligned version is
  used for the 16/32 px tab icon. All options are kept in `docs/design/icons/`.
- **History:** FoundationLearn (original working name) → Curio (TSK-009) → Well-Read (TSK-013).
- **Renames done:** the GitHub repository is github.com/mvaldes7/Well-Read and the Vercel project is
  `well-read` (vercel.com/michaelvaldes07-8585/well-read). Production is https://well-read-learn.vercel.app;
  curio-learn.vercel.app redirects there.

Status: **Approved** by Mike, 2026-10-09.

## Problem & user

A single-user app for Mike to learn foundational subjects: the arts, philosophy,
world history and poets.

## Core flow

Discipline → Topic → Lesson → Quiz.

- A lesson counts as **complete only when its quiz is passed with a score of 70% or higher**.
- **Per-topic levels:** 1 completed lesson = Level 1, 5 completed lessons = Level 2,
  then +1 level for every further 5 completed lessons.
- The bookshelf shows one book per topic with at least one passed lesson, grouped by discipline; books in the same discipline share a cover color.
- A separate **achievements** menu (starter set in TSK-011: First Lesson, Perfect Score, Discipline Explorer,
  a level achievement per topic, and a Completionist per discipline; see AC-6).
- **Lessons** have about 3 sections, 5 key facts, a quiz whose questions each carry an explanation (shown
  after grading), and a list of sources. Content: 6 disciplines (World History, Philosophy, Ancient History,
  American Civics, Art History, Poetry & Literature) as of TSK-012.
- Achievement dates are exact once the first pass time is recorded (`first_passed_at`, TSK-012); older
  records show "Earned by <date>".
- Progress **syncs via Supabase email/password login**. Public sign-ups will be disabled
  later; that change needs Mike's approval.

## Explicit non-goals (for now)

- AI-generated lessons
- A final achievement list (a starter set ships in TSK-011; more can be added later)
- Multiple users
- Social features
- Mobile apps

## Planned order

| Task | Scope |
| --- | --- |
| TSK-003 | Browse and read lessons from seed files (done) |
| TSK-004 | Login (Supabase email/password) (done) |
| TSK-005 | Quiz + lesson completion saved to Supabase (done) |
| TSK-006 | Bookshelf (done) |
| TSK-007 | Node 24 upgrade (done) |
| TSK-008 | Design pass (done) |
| TSK-009 | Rename display name to Curio (done) |
| TSK-010 | Polish batch: reopen bug, first name, sharper look (done) |
| TSK-011 | Levels + achievements (done) |
| TSK-012 | Content batch + sources + explanations + first_passed_at (done) |
| TSK-013 | Rename to Well-Read + icon |

Order updated 2026-10-09: a design pass was added before levels and achievements.
Order updated 2026-10-10: Node 24 upgrade inserted as TSK-007 (Vercel deprecated Node 20 builds on 2026-10-01);
design pass is now TSK-008, levels + achievements TSK-009.
Order updated 2026-10-10: Curio rename inserted as TSK-009; levels + achievements is now TSK-010.
Order updated 2026-10-10: polish batch inserted as TSK-010; levels + achievements is now TSK-011.

## Roadmap

Not built now; listed so later tasks can plan for it.

- Topic drill-downs: from a topic, explore a sub-topic (e.g. the fall of Rome) and generate a new lesson plan for it. Depends on AI-generated content.

## Tech stack

Next.js 16 + TypeScript, pnpm, GitHub Actions CI (see `docs/architecture.md`).
Supabase for auth and progress from TSK-004 onward.
