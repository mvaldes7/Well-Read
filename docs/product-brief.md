# Product Brief: FoundationLearn

Status: **Approved** by Mike, 2026-10-09.

## Problem & user

A single-user app for Mike to learn foundational subjects: the arts, philosophy,
world history and poets.

## Core flow

Discipline → Topic → Lesson → Quiz.

- A lesson counts as **complete only when its quiz is passed with a score of 70% or higher**.
- **Per-topic levels:** 1 completed lesson = Level 1, 5 completed lessons = Level 2,
  then +1 level for every further 5 completed lessons.
- A **bookshelf** shows each topic, with every completed lesson shown as a book.
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
| TSK-003 | Browse and read lessons from seed files |
| TSK-004 | Login (Supabase email/password) |
| TSK-005 | Quiz + lesson completion saved to Supabase |
| TSK-006 | Bookshelf |
| TSK-007 | Levels + achievements |

## Tech stack

Next.js 16 + TypeScript, pnpm, GitHub Actions CI (see `docs/architecture.md`).
Supabase for auth and progress from TSK-004 onward.
