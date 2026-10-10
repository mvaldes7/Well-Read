# Product Brief: Curio

Display name **Curio** (renamed in TSK-009, Mike's choice). The repository and Vercel project keep their
original names and URLs.

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
- A separate **achievements** menu.
- Progress **syncs via Supabase email/password login**. Public sign-ups will be disabled
  later; that change needs Mike's approval.

## Explicit non-goals (for now)

- AI-generated lessons
- A final achievement list
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
| TSK-010 | Polish batch: reopen bug, first name, sharper look |
| TSK-011 | Levels + achievements |

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
