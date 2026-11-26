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

- No open pull requests as of Nov 17, 2026.
- Owner review of pending AI lessons in `/review`: approve the Meiji Restoration lesson (`gen_2bf3df36d29b`) if it reads well, and reject the Louisiana Purchase test lesson (`gen_b31e9fc6253f`). Waiting on Mike.

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
