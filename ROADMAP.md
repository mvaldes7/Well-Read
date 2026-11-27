# Well-Read Roadmap

Well-Read is a single-user web app for learning foundational subjects (history, philosophy, civics, art, literature
and religion). The flow is Discipline, then Topic, then Lesson, then Quiz; a lesson counts as complete when its quiz
is passed with 70% or higher. Production: https://well-read-learn.vercel.app.

Name history: FoundationLearn (working name), then Curio (Oct 10, 2026, PR #9), then Well-Read (Oct 13, 2026, PR #13).

Sources for this file: merged PRs, `tasks/ledger.json`, `docs/` (product brief, plans, runbooks) and recorded
product decisions. Items whose status could not be confirmed are marked **(status unclear)**.

## Shipped

Dates are merge dates (Pacific time).

### Foundation (Oct 9-10, 2026)

- Task ledger and baseline CI (TSK-001, [#1](https://github.com/mvaldes7/Well-Read/pull/1)); Next.js + TypeScript scaffold (TSK-002, [#2](https://github.com/mvaldes7/Well-Read/pull/2)).
- Approved product brief; browse and read lessons (TSK-003, [#3](https://github.com/mvaldes7/Well-Read/pull/3)).
- Supabase email/password login with progress synced across devices (TSK-004, [#4](https://github.com/mvaldes7/Well-Read/pull/4)).
- Quizzes with saved lesson completion (TSK-005, [#5](https://github.com/mvaldes7/Well-Read/pull/5)).
- Bookshelf: one book per topic, grouped and colored by discipline (TSK-006, [#6](https://github.com/mvaldes7/Well-Read/pull/6)).
- Node 24 upgrade (TSK-007, [#7](https://github.com/mvaldes7/Well-Read/pull/7)); design pass "C2" (TSK-008, [#8](https://github.com/mvaldes7/Well-Read/pull/8)).
- Renamed to Curio (TSK-009, [#9](https://github.com/mvaldes7/Well-Read/pull/9)); polish batch: reopen bug, first name on Account, sharper look (TSK-010, [#10](https://github.com/mvaldes7/Well-Read/pull/10)).
- Levels and achievements (TSK-011, [#11](https://github.com/mvaldes7/Well-Read/pull/11)).
- Content batch across 6 disciplines with sources, quiz explanations and exact earned dates (`first_passed_at`) (TSK-012, [#12](https://github.com/mvaldes7/Well-Read/pull/12)).

### Well-Read rename and core features (Oct 13-23, 2026)

- Renamed to Well-Read with the book-spines icon (option B) (TSK-013, [#13](https://github.com/mvaldes7/Well-Read/pull/13), Oct 13).
- Password reset (TSK-018, [#14](https://github.com/mvaldes7/Well-Read/pull/14), Oct 13); later fixes for reset links landing on the site root ([#46](https://github.com/mvaldes7/Well-Read/pull/46), Nov 9) and recovery routing ([#47](https://github.com/mvaldes7/Well-Read/pull/47), Nov 9).
- Lessons batch of 6 (TSK-014, [#15](https://github.com/mvaldes7/Well-Read/pull/15), Oct 14).
- Per-discipline mastery tiers: Novice, Apprentice, Scholar, Luminary (TSK-019, [#16](https://github.com/mvaldes7/Well-Read/pull/16), [#17](https://github.com/mvaldes7/Well-Read/pull/17), Oct 14).
- Sidebar, dashboard and Progress page (TSK-015, [#18](https://github.com/mvaldes7/Well-Read/pull/18), Oct 14).
- Daily streaks from an append-only activity log (TSK-016, [#19](https://github.com/mvaldes7/Well-Read/pull/19), Oct 14).
- Reading List (To Read, In Progress, Completed) (TSK-017, [#20](https://github.com/mvaldes7/Well-Read/pull/20), Oct 14).
- Polish: mobile menu focus trap, hover vs active states (TSK-020, [#21](https://github.com/mvaldes7/Well-Read/pull/21), Oct 14).
- SECURITY.md ([#22](https://github.com/mvaldes7/Well-Read/pull/22), Oct 17).
- New lessons, including a new Civics topic (TSK-022, [#23](https://github.com/mvaldes7/Well-Read/pull/23), Oct 17); Religious Studies discipline: Buddhism, Judaism, Reformation ([#24](https://github.com/mvaldes7/Well-Read/pull/24), Oct 23).
- Next.js 16.4.3 security upgrade ([#25](https://github.com/mvaldes7/Well-Read/pull/25), Oct 23).

### Dig deeper: AI-generated lessons (Nov 2-11, 2026)

Approved plan: `docs/plans/topic-drilldowns.md`. Free tiers only, AI-generated label, owner approval before a lesson is shared.

- 5 lessons: Judicial Review, Cubism, Stoicism, Five Pillars of Islam, Silk Roads ([#26](https://github.com/mvaldes7/Well-Read/pull/26), Nov 2).
- Per-user rate limit on activity log inserts (REV-011, [#27](https://github.com/mvaldes7/Well-Read/pull/27), Nov 2).
- P0 plan and groundwork, shipped switched off; Dig deeper unlocks after any completed quiz, pass or fail ([#28](https://github.com/mvaldes7/Well-Read/pull/28), Nov 2).
- P1 stored Dig deeper choices ([#29](https://github.com/mvaldes7/Well-Read/pull/29)); P1b offline free-tier prototype ([#30](https://github.com/mvaldes7/Well-Read/pull/30)); P2 database schema ([#31](https://github.com/mvaldes7/Well-Read/pull/31)); P3 server and in-app UI behind the flag ([#32](https://github.com/mvaldes7/Well-Read/pull/32)) (Nov 2).
- Blocked-source handling and fetchable sources for 6 lessons ([#33](https://github.com/mvaldes7/Well-Read/pull/33), [#34](https://github.com/mvaldes7/Well-Read/pull/34), Nov 4).
- P4 owner-only `/review` queue to publish or reject generated lessons ([#35](https://github.com/mvaldes7/Well-Read/pull/35), [#36](https://github.com/mvaldes7/Well-Read/pull/36), Nov 4).
- Failed generations don't use up the daily lesson cap ([#37](https://github.com/mvaldes7/Well-Read/pull/37), Nov 4).
- P5 production enablement: Dig deeper turned on in production (Nov 4).
- Account link "Review AI lessons (N)" for the owner ([#44](https://github.com/mvaldes7/Well-Read/pull/44), Nov 9).
- Fallback to reachable sources (Wikipedia, SEP, .gov, .edu) when curated sources are blocked ([#49](https://github.com/mvaldes7/Well-Read/pull/49), Nov 10).
- Latency bounds and provider-failure logging ([#52](https://github.com/mvaldes7/Well-Read/pull/52)); citations limited to fetched sources ([#53](https://github.com/mvaldes7/Well-Read/pull/53)) (Nov 10).
- Better fallback search for choices starting with "The", "A" or "An" ([#55](https://github.com/mvaldes7/Well-Read/pull/55), Nov 11).

### Daily lesson reminders (Nov 9-10, 2026)

- Opt-in daily "learn a lesson" Web Push, skipped on days a lesson was finished ([#38](https://github.com/mvaldes7/Well-Read/pull/38), [#39](https://github.com/mvaldes7/Well-Read/pull/39), Nov 9).
- Scheduler on GitHub Actions first shipped as a once-daily 6 PM Pacific / 7 PM PDT run ([#40](https://github.com/mvaldes7/Well-Read/pull/40), Nov 9). The send window is now 2-9 PM Pacific, with hourly GitHub Actions slots (`0 11-23,0-2 * * *`, 16 runs a day) spread earlier in UTC so a 6h40m-10h04m scheduler lag can still land after 2 PM. The first in-window run sends; later runs that day and late-night starts do not claim. Web Push TTL is 4 hours ([#70](https://github.com/mvaldes7/Well-Read/pull/70)).
- Tapping the reminder opens Learn, finished with Declarative Web Push for iOS ([#41](https://github.com/mvaldes7/Well-Read/pull/41), [#42](https://github.com/mvaldes7/Well-Read/pull/42), [#43](https://github.com/mvaldes7/Well-Read/pull/43), Nov 9); confirmed working on Mike's phone Nov 10.
- Runbook: `docs/lesson-reminders.md`.

### Achievements, library and content (Nov 9-11, 2026)

- Subject icons on badge medallions ([#45](https://github.com/mvaldes7/Well-Read/pull/45), Nov 9).
- 10 lessons: Unreliable Narrator, Meiji Restoration, Utilitarianism, Surrealism, Electoral College, and five U.S. Presidents ([#48](https://github.com/mvaldes7/Well-Read/pull/48), Nov 10).
- "U.S. Presidents" series topic in American Civics, one lesson per president in office order, with redirects from old URLs ([#50](https://github.com/mvaldes7/Well-Read/pull/50), Nov 10).
- Bookshelf "By discipline / Whole library" toggle, with mixed-subject shelves on phones ([#51](https://github.com/mvaldes7/Well-Read/pull/51), Nov 10).
- Content and topic consolidation ([#54](https://github.com/mvaldes7/Well-Read/pull/54), Nov 11): presidents Madison through Van Buren; Athens, Ashoka and Ancient Egypt (new `civilization` topic kind); Reformation broadened into Protestant Christianity; merged topics The Renaissance and Early twentieth-century art, with redirects.
- Polished flat charcoal-and-gold book-spines icon, one artwork at every size ([#56](https://github.com/mvaldes7/Well-Read/pull/56), Nov 11).

### Maintenance (Nov 2026)

- Next.js 16.4.5 security upgrade, November 2026 advisories ([#57](https://github.com/mvaldes7/Well-Read/pull/57), Nov 16).

## In progress

- UI PR 1, mobile tap targets and sticky-bar focus ([#71](https://github.com/mvaldes7/Well-Read/pull/71)); see "UI audit plan" below.
- Owner review of pending AI lessons in `/review`: approve the Meiji Restoration lesson (`gen_2bf3df36d29b`) if it reads well, and reject the Louisiana Purchase test lesson (`gen_b31e9fc6253f`). Waiting on Mike.

## UI audit plan (Nov 27, 2026)

An audit of the whole UI against the web-interface-guidelines and make-interfaces-feel-better skills, iPhone first
(390x844), then desktop (1440x900). Mike approved adding all three PRs here and starting PR 1 (Nov 27). PRs 2 and 3
each wait for his separate OK. House rules for all three: 44px mobile hit areas (24px floor on desktop), plain CSS
in `globals.css`, no new libraries, motion libraries or paid fonts, no emojis, and the gallery/bookshelf look and
sidebar layout stay as they are. Finding IDs: H = high, M = medium, L = low.

- **PR 1: mobile tap targets and sticky-bar focus** (in progress, [#71](https://github.com/mvaldes7/Well-Read/pull/71)). Findings H1-H4, L1, L6, L13.
  - H1: 44px sidebar and top-bar controls: Menu/Close, nav links, Sign out, account link, logo.
  - H2: lesson-flow links and buttons: breadcrumbs, the back link, Dig deeper choices, Report a problem, review buttons.
  - H3: signed-in page controls: bookshelf view toggle, reading-list buttons, the daily reminder switch, dashboard card links, /learn titles and auth links.
  - H4: the sticky mobile top bar never covers focused or scrolled-to elements (scroll padding).
  - L1: touch-action and a brass tap highlight. L6: press feedback (opacity) on secondary controls. L13: breadcrumb separators stay with their crumb when they wrap.
- **PR 2: quiz and form flow** (planned, needs Mike's OK). Findings H5, M2, M3, M4, M5, M6, M9.
  - H5: focus and scroll to the score after grading, and to the first question on Retry.
  - M2: pending buttons keep their label and show a CSS spinner. M3: loading skeletons that mirror the real layout (no layout shift).
  - M4: "Try again" or "Sign in" on error states (no dead ends). M5: the quiz's own "answer every question" message with inline per-question errors.
  - M6: focus the first field error on submit. M9: report-form polish (focus, styling, Cmd/Ctrl+Enter) and spellcheck/autocapitalize off on email and URL inputs.
- **PR 3: accessibility and polish** (planned, needs Mike's OK). Findings M1, M7, M8 (option A), L2, L3, L4, L5, L7, L8, L9, L10, L11, L12.
  - M1: "Skip to content" link. M7: input and ghost-button borders at 3:1 or better. M8 (A): dark-mode theme-color matches the header.
  - L2: tabular numbers. L3: balanced heading wraps. L4: font smoothing. L5: hover styles only on devices that hover. L7: SVG icons instead of text glyphs (☰ ✕ ↗).
  - L8: undefined `--rule` token. L9: shelf overflow. L10: delete dialog scrolls on small screens. L11: `100dvh`. L12: streak stat label for screen readers.
- **Optional follow-up: M8 option B**, full-bleed iPhone safe areas (`viewport-fit=cover`). Only if Mike wants the charcoal bar under the status bar, and only after a check on a real home-screen iPhone.

### Desktop findings (1440x900)

Most findings are mobile-first. These are the ones that also show up, or only show up, on desktop:

- Breadcrumb links 15px tall and the "Back to ..." link 17px tall, under the 24px desktop floor (H2, PR 1).
- Dashboard card link ("Continue: ...") 20px tall and the auth page links ("Forgot password?", "Create one", "Sign in") 19px tall, under 24px (H3, PR 1).
- Nine Tab presses through the sidebar before reaching page content; there's no "Skip to content" link (M1, PR 3).
- Shelf overflow would clip the first book spines: `.books` centers its spines with `justify-content: center`, and only phones have the auto-margin workaround (L9, PR 3). Latent today, since no discipline has more than 4 topics.
- Unwanted scrollbars: `body`, `.shell` and the desktop `.sidebar` use `100vh`, which can add an extra scrollbar where the browser toolbar collapses (Safari, iPad); move to `100dvh` (L11, PR 3). No horizontal overflow was measured at 390 or 1440 wide.
- Hover-only effects (spine brightness, sidebar link tint, quiz option border) are desktop affordances that stick after a tap on touch screens; scope them to `@media (hover: hover)` (L5, PR 3).
- The desktop sidebar has no left safe-area padding for iPad or landscape home-screen use (part of M8 option B, optional follow-up).
- Not scheduled: lesson source links are 20px tall on both desktop and mobile. They're citation links inside running text, which WCAG 2.5.8 exempts, so they're left as they are.

## Planned / backlog

- `/review` returns a real HTTP 404 for non-owners instead of a soft 404.
- Better sources for lessons whose sources are all blocked for Dig deeper (for example Britannica- or Met-only lessons added in #54), so generation does not depend on the fallback.
- Optional maskable home-screen icons, with the art inset to the 80% safe zone (left out of #56).
- Check the subject badge icons from #45 on a real device **(status unclear)**.
- Topic consolidation round 2 (plan approved by Mike, Nov 18): two content-only PRs, World and Ancient History (#66) and Philosophy, Civics, Art History and Poetry & Literature. Single-lesson topics left by decision: Utilitarianism (until a second modern-ethics lesson), Marbury v. Madison, and the Buddhism, Judaism and Islam topics.
- More U.S. Presidents lessons, added to the existing series topic.
- Quizzes on Dig deeper lessons ([plan](docs/plans/dig-deeper-quizzes.md), approved Nov 18, credit = streaks only): 1) quiz quality guards, 2) quiz on `/dig` with server-side grading, 3) progress migration (needs Mike's OK to apply), 4) streak logging after 3 is applied.
- Dig deeper follow-ups noted in the plan: reuse already-published lessons instead of generating new ones; a short multi-lesson plan per choice; automated handling of reported lessons.
- Disable public sign-ups (AC-7), only with Mike's approval **(status unclear; an Oct 10 check found sign-ups already off)**.
- Repair the Supabase migration history: several migrations were applied with versions that differ from their repo filenames (see `supabase/README.md`).

## Decided against

- Realistic, ornate or bright-color icon concepts (Nov 11); the simplified 16/32 px tab icon (Nov 11).
- Broadening Buddhism, Judaism and Islam into wider topics; moving Judicial Review into the Constitution topic (Nov 11).
- A separate staging branch; Vercel per-PR previews are the test step (Oct 10).
- A Ledger page in the sidebar (Oct 14).
- Custom SMTP for password reset emails, for now (Oct 13).
- Paid AI tiers or paid fallbacks for Dig deeper.
- Non-goals in the product brief: multiple users, social features, native mobile apps.

## Product principles

- Broad topics: a topic should hold several granular lessons, not one. People with a single lesson go into a series topic (for example U.S. Presidents).
- Free tiers only (Vercel Hobby, Supabase free, Gemini free tier, GitHub Actions).
- Consequential changes need Mike's explicit approval each time: merges, migrations, data changes, deploys, sends, and new accounts or cloud resources.
- AI-generated lessons are labeled, fact-checked against trusted sources, and shared with others only after Mike approves them.
- Lessons keep a consistent format: about 3 sections, 5 key facts, a quiz with explanations, and sources.
