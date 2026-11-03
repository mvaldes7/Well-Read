# Plan: Topic drill-downs (AI-generated lesson plans + lessons)

Status: APPROVED by Mike 2026-11-02 with changes (AI-generated label; share only after Mike approves; Report button; FREE tiers only).
P0 = this doc + no-risk groundwork (flag off, caps, validators). No provider calls, accounts, keys or migrations in P0.
Based on github.com/mvaldes7/Well-Read at main bc75131. Every phase below needs Mike's approval before it starts.

## 1. What the feature is
After a signed-in user has **completed a lesson's quiz**, the lesson page shows **"Dig deeper"**. Clicking it shows **3-4 suggested
choices drawn from that lesson's content** (key people, places, events, ideas, subtopics). The user picks one. **There is no free-text
input anywhere.** The chosen item drives generation of one AI-generated lesson in exactly the same shape as the hand-written lessons in
`src/content/disciplines.json`. A short plan of several follow-ups can come later; P3 starts with one lesson per choice.

**Choices are precomputed and stored per lesson** in a validated content field, `digDeeper: [{ id, label, kind }]`. It has 3-4 items, `id` is a
slug unique within the lesson, `kind` is one of person | place | event | idea | subtopic, and it is checked at build time by
`src/content/digdeeper.mjs`. Mike reviews the choices as ordinary content in PRs. The server accepts **only** `{ lessonId, choiceId }`
where `choiceId` is one of that lesson's stored ids. Any extra field (for example a "prompt") is rejected outright. The generation prompt
is built server-side from the lesson and the choice's stored label, so user-typed text never reaches the model, which also removes the
prompt-injection path.

**Completion gate (server-side):** "Dig deeper" requires a `lesson_completions` row for (user, lesson), meaning the quiz was graded at least
once, pass or fail. It is enforced in three places, not just by hiding the button:
1. In the server action, by `checkDigDeeperRequest()` (`src/lib/drilldowns/gate.mjs`, P0), which reads the user's own completion rows with the
   session client (RLS: own rows).
2. In SQL, by the insert policy of any future drill-down table (section 6).
3. In the UI, which hides the button. That is a convenience only.

## 2. AI provider: FREE tiers only (no paid fallback)
Mike's decision: everything stays on free tiers. There is **no paid fallback**. When a free quota or our own cap is reached, the feature
switches off gracefully ("Deeper lessons are resting for today, try again tomorrow"), and static lessons and cached generated lessons keep working.

Candidate (free tier, from https://ai.google.dev/gemini-api/docs/pricing, read 2026-11-02): Gemini Flash-Lite (`gemini-3.1-flash-lite`
or `gemini-2.5-flash-lite`). Input and output are "Free of charge" on the free tier. Free-tier rate limits are per project. A third-party
summary (https://www.scriptbyai.com/gemini-api-free-tier-limits/, NOT an official source; check it in AI Studio before relying on it) lists
10 RPM and 500 requests/day for the Flash-Lite models. Google Search grounding is **not available** on the free tier for Gemini 3.x
Flash-Lite, so sources come only from our curated allowlist (section 3).

**Fallback model (Mike, 2026-11-02):** when `gemini-3.1-flash-lite` returns HTTP 503 / UNAVAILABLE or a "high demand" error, switch once to
`gemini-3.5-flash-lite` (also free tier). The fallback call counts against the same per-lesson and daily caps. **Free tier only:** if any
response mentions billing, a paid tier or payment (or returns HTTP 402), stop immediately, never retry or fall back, and report it to Mike.
Cost: $0 per lesson and $0 per month, by construction. Our caps (section 8) keep usage well under the free quota.

**Data-use tradeoff:** the pricing page marks the free tier "Used to improve our products: Yes". Google may use prompts and outputs to
improve its products, and they may be seen by human reviewers. Mitigations:
- send only public lesson content, topic slugs and the user's short drill-down prompt;
- never send names, emails, user ids, reading lists or progress;
- warn users on the drill-down form: "Your topic request is sent to Google's free Gemini API and may be used to improve Google products.
  Nothing you type is sent." There is no typing; only the lesson and the chosen item are sent.

If Mike later wants that data not used, the only fix is a paid tier, which is out of scope by decision.
No API key exists yet. Creating a Google AI Studio project/key is a **new account action that needs Mike's approval** (phase P2).

## 3. Matching the existing lesson format
- Generate JSON that conforms to the existing `Lesson` type in `src/content/schema.ts`: `{ id, slug, title, sections[{heading, body}],
  keyFacts[], quiz[{question, options[4], answerIndex, explanation}], sources[{publisher, title, url, note?}] }`. Use the provider's
  structured-output / JSON-schema mode.
- Validate it with the **same validators** the seed content uses: `src/content/index.ts` checks, `sourceProblems`,
  `explanationProblems`, `citationMarkerProblems` (`src/content/sources.mjs`), and the `LESSON_ID_PATTERN` rules (`src/content/ids.mjs`).
  Move the per-lesson parts of the loader into a reusable `validateLesson()` so seed content and generated content share one gate.
- Use the shape of the existing long lessons: 4 sections, 6 key facts, 6 quiz questions with explanations, deduplicated sources, and no
  `[1]`-style markers in the text.
- Ids: generated lessons get a distinct prefix (for example `gen_` + random), so they can never collide with the hand-assigned `les_` ids
  (REV-001: ids are never reused).
- **Quiz secrecy (REV-007):** the client only ever gets `toPublicQuestions()` (`src/lib/quiz/public.mjs`), meaning question + options.
  `answerIndex` and `explanation` stay in the DB/server and come back only from the grading server action, as `submitQuiz` does today
  (`src/lib/quiz/actions.ts`).
- **Real, verified sources:** the model may cite only from a candidate set that the server supplies; URLs are never invented and never
  rendered unchecked. Candidates come from (a) the topic's existing hand-curated `sources` (trusted as reviewed) and (b) extra
  candidate URLs on the trusted-source allowlist below. Search grounding isn't available on the 3.x free tier, so (b) is a hand-picked or
  server-built list. After generation, the server fetches each URL (HTTPS only). It must return 200 and its page title must match. The fetched
  text must also mention the chosen item. If any source fails, the lesson is rejected or regenerated within the caps.

### 3a. Trusted-source allowlist (`src/lib/drilldowns/sources.mjs`)
Matching rules: HTTPS only, no credentials or explicit port, no IP literals, no punycode (`xn--`) labels. A host matches only if it is
exactly the domain or a subdomain on a `.` boundary, so `evilhistory.com`, `history.com.evil.net` and `notwikipedia.org` never match.
`.org` is **not** wildcarded.

| Tier | Domains |
| --- | --- |
| trusted | history.com, nationalgeographic.com, every `.gov` host (loc.gov, archives.gov, nps.gov, ...), every `.edu` host (university pages), si.edu (and subdomains such as americanhistory.si.edu), smithsonianmag.com, khanacademy.org, plato.stanford.edu, iep.utm.edu, worldhistory.org, pbs.org |
| trusted, scholarly (named, no wildcard) | jstor.org (only `/stable/` pages), plos.org, doaj.org, gutenberg.org (primary texts) |
| supplementary | wikipedia.org. It can be cited, but **never as a lesson's only source**: at least one curated or trusted source must also pass the fetch check. |

Judgment calls:
- **Wikipedia is lower-trust.** It is fetchable and broad, but its pages are edited openly, so it can only support a trusted source, never stand alone.
- **JSTOR** is limited to `/stable/` pages, because checking open access needs more than a URL check.
- **`.edu`** is a whole-TLD rule like `.gov`, as approved. Some `.edu` pages are student or personal, so the fetch-and-fact check still applies.
- **"Smithsonian .org domains":** I couldn't confirm any official Smithsonian `.org` hosts, so none are listed. The Smithsonian uses si.edu and smithsonianmag.com.

### 3b. Fetchability (plain script fetch, measured 2026-11-02)
The fetch sent an honest User-Agent, `Well-Read source check (+https://github.com/mvaldes7/Well-Read)`. There was no evasion, proxy or
header spoofing, and requests went about 4 s apart, one or two pages per domain. "Readable" means a 200 response with more than 1,500
characters of extracted text.

| Domain | Page tried | HTTP | Readable text |
| --- | --- | --- | --- |
| history.com | /articles/french-revolution; /articles/genghis-khan | 200; 200 | yes (16.5k chars); yes (11.3k chars) |
| nationalgeographic.com | /history/article/silk-road (redirected) | 200 | yes (9k chars). A guessed /culture/article/genghis-khan URL returned 404 (bad URL, not a block). |
| loc.gov | Constitutional Convention essay | 200 | yes (4.9k chars) |
| archives.gov | /founding-docs/bill-of-rights-transcript | 200 | yes (12k chars) |
| nps.gov | /inde/.../places-independencehall.htm; /subjects/womenshistory/ | 200; 200 | yes (2.7k chars); yes (2.5k chars). A first, guessed URL returned 404. |
| plato.stanford.edu | /entries/seneca/ | 200 | yes (111k chars) |
| iep.utm.edu | /seneca/ | 200 | yes (64k chars) |
| worldhistory.org | /Genghis_Khan/; /Maximilien_Robespierre/ | 200; 200 | yes (26k chars); yes (30k chars) |
| pbs.org | /wnet/religionandethics/; /empires/thegreeks/background/ | 200; 403 | yes; no. The result is mixed across subsites. |
| wikipedia.org | Georges_Braque; Maximilien_Robespierre | 200; 200 | yes (33k chars); yes (228k chars) |
| .edu | avalon.law.yale.edu Federalist 51; afe.easia.columbia.edu page | 200; 404 | yes (12.7k chars); no (bad URL) |
| plos.org | journals.plos.org PLOS ONE article | 200 | yes (54k chars) |
| gutenberg.org | /ebooks/1497; Federalist HTML | 200; 200 | yes (3.2k chars); yes (1.15M chars) |
| khanacademy.org | linear-perspective article | 200 | **no.** The page is rendered by JavaScript, so a plain fetch gets 12 characters. |
| jstor.org | /stable/j.ctt1287k16 | 200 | **no.** A "Client Challenge" bot page came back. |
| si.edu | /spotlight/buddhism | 403 | **no.** A "Smithsonian request verification" page came back. |
| smithsonianmag.com | Genghis Khan article | 403 | **no.** A Cloudflare "Just a moment..." challenge came back. |
| doaj.org | journal TOC | 403 | **no.** A Cloudflare challenge came back. |
| britannica.com (curated) | Robespierre | 403 | **no.** A Cloudflare challenge came back. |
| metmuseum.org (curated) | /essays/cubism | 429 | **no.** A "Vercel Security Checkpoint" came back. |

**Blocked or unreadable with an honest plain fetch (for Mike to decide):** si.edu, smithsonianmag.com, doaj.org, jstor.org,
khanacademy.org (JavaScript-rendered), parts of pbs.org, and the already-curated britannica.com and metmuseum.org. The options are:
- keep them as human-curated sources that are trusted without a fetch;
- drop them as candidates for generated lessons;
- ask the site owners for access.

We do **not** bypass bot checks.

**Decision (Mike, 2026-11-02), enforced in code (`BLOCKED_SOURCES` / `isBlockedSource` in `src/lib/drilldowns/sources.mjs`):** the blocked
sites are si.edu, smithsonianmag.com, jstor.org, khanacademy.org, britannica.com, metmuseum.org, doaj.org and pbs.org/empires (subdomains
included; on pbs.org only the `/empires` path). A generated lesson may cite them **only alongside at least one fetchable trusted or curated
source** that passes the fetch check. They **never count toward the fact check**: they are not fetched, their text is never given to the fact
checker, and they never satisfy the tier rule, even when hand-curated on the parent lesson.

### 3c. Prototype rerun with the 4-call cap and blocked-site rule (2026-11-02)
Three lessons, 12 Gemini calls total, at most 4 calls/minute (about 65 s between lessons). No 503, so the fallback model was never used, and
no billing or paid-tier message appeared. All three were **rejected** after 4/4 calls and failed gracefully:

| Lesson / choice | Model | Calls | Unconfirmed (attempt 1 / 2) | Outcome | Sources cited |
| --- | --- | --- | --- | --- | --- |
| les_fr02 / robespierre | gemini-3.1-flash-lite | 4 | 3 / 3 | rejected | britannica.com x2 (blocked, not fetched), revolution.chnm.org (fetched, only fact-check text) |
| les_gk01 / temujin-early-life | gemini-3.1-flash-lite | 4 | 8 / 5 | rejected | britannica.com x2 (blocked, not fetched), worldhistory.org (fetched, only fact-check text) |
| les_st02 / seneca | gemini-3.1-flash-lite | 4 | 9 / 9 | rejected | plato.stanford.edu x2, iep.utm.edu (all fetched) |

Takeaway: the generator writes facts beyond what one fetched page says. Before P2 the prompt should give the generator the same fetched
source text the fact checker sees, rather than only the parent lesson (not done here; P1b stays prototype-only).

### 3d. Grounded generation (approved by Mike, 2026-11-02; prototype prompt `p1b-2-grounded`)
1. **Fetch first.** Before any model call, fetch every allowed candidate: the curated lesson sources and any allowlisted extras. Blocked
   sites (3b) are skipped and never fetched. Each fetch must return HTTP 200 and match the page title. If no usable source passes the tier
   rule, the run stops with **0 model calls**.
2. **Generate from fetched text only.** The generator gets relevant excerpts of the fetched pages, labelled S1..Sn (24k characters split
   across sources, chosen by overlap with the choice label and the lesson title), plus the parent lesson as context only. It is told to
   write claims only from the excerpts and to return `factSources` / `quizSources`: the id of the fetched source that supports each key
   fact and each quiz answer. An unknown id is a source problem and triggers a regenerate within the cap. The lesson's `sources` are
   exactly the fetched sources it cites, so a blocked site can never be a source.
3. **Fairer fact-check text.** Instead of an even head-of-page split, each of the 12 items gets up to 2,000 characters of the excerpts from
   **its own cited source** most relevant to that claim. Excerpts are deduplicated, grouped by source and capped at 24k characters in total.
   Each item also carries its cited URL. Blocked-site text never appears.
4. The caps are unchanged: 4 calls per lesson, a 100 calls/day hard stop, 25 lessons/day. The same fallback and billing stop apply.

**Rerun (2026-11-02), 3 lessons, 7 Gemini calls, 4 calls or fewer per minute:**

| Lesson / choice | Model | Calls | Unconfirmed per try | Outcome | Sources cited (all fetched) |
| --- | --- | --- | --- | --- | --- |
| les_fr02 / robespierre | gemini-3.1-flash-lite | 2 | 0 | pass | revolution.chnm.org: Paris and the Politics of Rebellion; War, Terror, and Resistance |
| les_gk01 / temujin-early-life | gemini-3.1-flash-lite for generate; **gemini-3.5-flash-lite** for the fact check after a 503 | 3 (one was the 503) | 0 | pass | afe.easia.columbia.edu conquests_2a; worldhistory.org/Genghis_Khan |
| les_st02 / seneca | gemini-3.1-flash-lite | 2 | 0 | pass | iep.utm.edu/seneca; plato.stanford.edu/entries/seneca; plato.stanford.edu/entries/marcus-aurelius |

Before grounding (3c), all three were rejected at 4/4 calls. No billing or paid-tier message appeared. Britannica was blocked and not fetched.

## 4. Quality and safety checks
1. Schema validation (above). On failure, regenerate up to 2 times, then show "couldn't generate".
2. Source checks (above), plus a deduplication check.
3. Fact check: a second cheap model call checks that each key fact and each quiz answer (12 items) is supported by the fetched source text.
   Each fetched source gets an equal share of the text budget. **Pass rule (decided by Mike, 2026-11-02; `factCheckOutcome` in
   `src/lib/drilldowns/config.mjs`):**
   - 0 unconfirmed items: **pass**.
   - Exactly 1 unconfirmed: **pass, flagged**. The lesson is delivered to the requesting user (private, with the AI-generated label) and
     flagged for Mike's review, recording which claim and why.
   - 2 or more, or an incomplete fact check: **reject**. Regenerate only if a full attempt (generate + fact check) still fits in the
     3-calls-per-lesson cap. Otherwise fail gracefully ("couldn't generate this one").
   With a cap of 3, a fact-check reject after one attempt (2 calls) cannot be retried. Only a schema retry fits. Raising the cap to 4
     would allow one real regeneration; that needs Mike's approval.
4. Content filters: there is no user text to filter, because the input is a stored choice id. Use the provider's safety settings plus a local check (small
   denylist, topic-relevance check) on the **output**. No second provider/account is used. Treat user text as data, not instructions (prompt-injection guard). Limit it to the current
   topic's subject, with a length cap (for example 200 characters).
5. Religious, political, and civics topics: keep the existing neutral "describes, doesn't ask the reader to affirm" tone in the system prompt.
6. **Approval flow (required, not optional):** `status` is one of `private` | `published` | `rejected` | `flagged`.
   - A new lesson is `private`: **only its generator can see it**, enforced by RLS, not only by the UI.
   - It becomes `published` (shared and cached for everyone) **only when Mike approves it**, through an admin review view (P5) or SQL
     run by Mike. The app's own code can never publish.
   - Every generated lesson always shows a visible **"AI-generated"** label (above the title and next to Sources), private or published.
   - A **Report** button on every generated lesson creates a report row. A published lesson with an open report goes back to `flagged`
     (hidden from others) until Mike reviews it.

## 5. Caching and reuse across users
- Cache key = (source lesson id, choice id, prompt version, model id). Choices are a fixed, small set, so caching works well.
- If a **published** (Mike-approved) lesson exists for that key, reuse it. A private lesson is reused only for its own generator. No LLM call is made, so cost drops toward zero as usage grows.
- Store each plan and lesson once. Users get a link row. Bump the prompt version to invalidate the cache.
- Progress: `lesson_completions` has `check (lesson_id ~ '^les_[a-z0-9]{4,12}$')`, so `gen_` ids **cannot** be stored there
  without a migration. Store generated-lesson progress in a separate `generated_lesson_completions` table with the same own-row RLS. Mastery/achievement math (`src/lib/progress/*`, `src/achievements/definitions.mjs`) currently counts
  only static content. Decide whether generated lessons count (recommendation: no, at first).

## 6. DB changes (P2 draft: `supabase/migrations/20261102231600_drilldowns.sql`, UNAPPLIED)
Approved by Mike to **write** (2026-11-02); revised the same day (no service role). It still needs separate approval to apply. Tested only
on a throwaway local Postgres (`pnpm test:db`: `scripts/test-db-local.sh` + `tests/db/*`, with a stub for Supabase's roles, `auth.users`
and `auth.uid()`, plus a concurrency test `tests/db/race.sh`). Conventions as before: `user_id default auth.uid()`, policies
`to authenticated` using `(select auth.uid())`, `revoke all` then minimal column grants, `set search_path = ''` with fully qualified names,
EXECUTE revoked from public/anon/authenticated. Answers stay server-side (REV-007).

**No service role.** supabase/README.md still forbids the service-role key. Instead:

- **`drilldown_server`** — a LOGIN role (NOINHERIT, NOBYPASSRLS), created **without a password**. It has **no table privileges**,
  only EXECUTE on three SECURITY DEFINER functions: `drilldown_reserve()`, `drilldown_save_lesson()`, `drilldown_quiz_key()`.
- The P3 server reaches it through the server-only env var **`DRILLDOWN_DB_URL`** (never `NEXT_PUBLIC_`), read only by
  `src/lib/drilldowns/server-db.mjs` (a P3 stub with a runtime browser guard; the repo does not use the `server-only` package).
  CI runs `pnpm check:bundle` after the build and fails if `DRILLDOWN_DB_URL`, `SERVICE_ROLE_KEY`, `service_role`, `GEMINI_API_KEY`
  or `drilldown_server` appears in `.next/static`.

| Table | Users (authenticated) | drilldown_server | Mike (owner SQL) |
| --- | --- | --- | --- |
| `generated_lessons` (gen_ id, created_by, parent/choice ids, prompt_version, model, `ai_generated` always true, `review_status`, public `lesson` with no answers, `sources`, `citations`, `unconfirmed_claims` 0 or 1) | column-level select (**not** `created_by` or `unconfirmed_claims`) on own pending/flagged + all published; own claims via `drilldown_my_lessons()`; no writes | only via `drilldown_save_lesson()` (pending/flagged/rejected, never published) | full |
| `generated_quiz_keys` | nothing | only via `drilldown_quiz_key(user, lesson)` for a lesson that user can see | full |
| `lesson_reports` (one per user per lesson) | insert own on a visible lesson; select own (not `user_id`) | nothing | full |
| `drilldown_usage_user` (LA day, lessons 2 or fewer, calls 8 or fewer) | select own; no writes | only via `drilldown_reserve()` | full |
| `drilldown_usage_global` (LA day, lessons 25 or fewer, calls 100 or fewer) | nothing | only via `drilldown_reserve()` | full |
| `generated_lesson_completions` | default privileges revoked; own select/insert, update of score columns, only on a visible lesson | nothing | full |

**Server flow (P3, documented in `server-db.mjs`; feature flag `WELL_READ_DRILLDOWNS` stays off):**
1. Verify the session server-side with `supabase.auth.getClaims()` (or `getUser()`). `user_id` = `claims.sub` only, never from the request.
2. `select public.drilldown_reserve(user_id, calls, true)`. It raises `WR403` if `auth.users.email_confirmed_at` is null and `WR429` on any cap.
3. Fetch the sources and call Gemini server-side.
4. `select public.drilldown_save_lesson(user_id, …)`. This needs an unused lesson reservation for that user today, accepts only
   pending/flagged/rejected, and checks email verification again.
5. Grade with `public.drilldown_quiz_key(user_id, lesson_id)`.

**Visibility:**
- `pending` and `flagged` are visible only to the generating user.
- `published` is visible to every signed-in user (not anon).
- `rejected` is visible only to Mike.
- Reports don't change a lesson automatically. Mike reviews them and unpublishes by owner SQL (P4). Automating this needs another definer function, which is deferred.

**Publish path:** owner SQL only. Mike runs `update public.generated_lessons set review_status = 'published' where id = 'gen_…';` in the dashboard
SQL editor as the table owner, and a trigger sets `published_at`/`reviewed_at`. No role, function or app path can write `published`.
`drilldown_admin` has been removed.

**Caps:** per user per LA day, 2 lessons and 8 calls; globally, 25 lessons and 100 calls (hard stop).
- `drilldown_reserve()` takes a per-day advisory lock, checks every cap, then increments. It raises `WR429` and changes nothing when a cap would be exceeded.
- CHECK constraints on the counters are a backstop.
- `tests/db/race.sh` checks two concurrent cases: 40 parallel reservations yield exactly 25 lessons and 100 calls, and 6 parallel reservations for one user yield exactly 2.

**Mike's setup (only once the migration is approved and applied; nothing here changes Vercel):**
1. In the Supabase SQL editor, run `alter role drilldown_server with password '<long random>';`. Generate the password locally and never paste it in chat or commit it.
2. Build the URL for that role from the dashboard connection string. Use the pooler (session mode) or the direct host, with `drilldown_server` in place of `postgres`.
3. Add it to Vercel as **`DRILLDOWN_DB_URL`**: Production (and Preview only if wanted), type Sensitive. It must never be named `NEXT_PUBLIC_…`.
4. To rotate, run `alter role … password` again and update the env var. To revoke, run `alter role drilldown_server nologin;`.

## 7. UI entry point
- Lesson page, after the quiz result: a "Dig deeper" button, shown only when signed in, the lesson's quiz is completed and the flag is on.
- It opens a small panel with the lesson's 3-4 stored choices as buttons. There is no text box. Picking one posts `{ lessonId, choiceId }` to a server action.
  The result shows at `/d/[discipline]/[topic]/[lesson]/deeper/[choice]`. It reuses the
  lesson page components and `Quiz.tsx` unchanged. An "AI-generated · sources verified <date>" badge sits above the Sources list.
- Generation runs in a server action with a loading state. The 20-60 s path should stream or poll, not block.

## 8. Caps and the hard stop (conservative, free tier)
Counted in **provider calls**, not lessons. Calls per item (raised from 3 to 4 by Mike, 2026-11-02): lesson = 1 generate + 1 fact-check,
and after a fact-check reject one full regenerate + fact-check, so **4 calls in the worst case**. A schema retry or a 503 fallback also uses one
of the 4; a new attempt starts only if a generate + fact-check pair still fits, otherwise the lesson fails gracefully.
- **Per user per day:** 2 generated lessons, so at most 8 calls. A cached published lesson costs 0 calls and doesn't count.
- **Global per day:** 25 lessons (lowered from 30 so 25 x 4 = 100 fits the hard stop), with the **hard stop unchanged at 100 calls/day**. That is 20% of the assumed 500 RPD free quota,
  which leaves wide headroom if Google lowers it.
- **Per minute:** no more than 4 calls/minute globally, below the assumed 10 RPM.
- **Hard stop / graceful disable:** before each call, check the global counter. At the cap, or on any provider 429/quota error, the
  feature flips to "resting" until the next America/Los_Angeles midnight. It never retries into a quota error, and it never falls back to a paid model.
- Plus `max_output_tokens` and a 60 s timeout on every call. The feature flag defaults **off** everywhere.
These defaults live in code (P0: `src/lib/drilldowns/config.mjs`). Lowering them is free; raising them needs Mike's approval.

## 9. Phases (each needs Mike's approval before it starts)
- [x] **P0, plan + no-risk groundwork** (approved 2026-11-02): commit this plan to `docs/plans/`. Add a feature flag defaulting off
  (`WELL_READ_DRILLDOWNS=1` to enable, server-side only), cap constants and the hard-stop check, and a pure validator for generated lessons
  (the `gen_` id, the long-lesson shape, the existing sources/explanation/citation checks). Also: the `digDeeper` content field with its validator, choices for
  the 5 newest lessons, and the pure server-side gate (stored choice id only, and completion required), all with tests. No provider calls, no UI, no
  keys, no migration.
- [ ] **P1, choices for every lesson:** add reviewed `digDeeper` choices to the remaining lessons (content PR). *(Mike approval)*
- [x] **P1b, offline prototype** (PR #30, `scripts/drilldown-prototype.mjs`; trusted-source allowlist and fetchability in section 3a/3b): a script that generates a lesson for one topic into a local JSON file and runs the validator, source
  fetch-check and fact check. Free-tier key only. *(Mike approval: create the Google AI Studio project/key)*
- [x] **P2, migration draft** (PR: feat/drilldowns-p2-schema, `20261102231600_drilldowns.sql`, local tests only, NOT applied): tables, RLS with column-level grants, the `drilldown_server` role with SECURITY DEFINER write functions (no service role), email verification, caps and an owner-SQL-only publish (section 6), tested in a throwaway local Postgres. **Not
  applied.** *(Mike approval to write; separate approval to apply)*
- [ ] **P3, server + UI behind the flag:** the "Dig deeper" panel and server action (using the P0 gate), private lessons with the AI-generated label, the Report button, caps and
  the hard stop. Preview only. *(Mike approval)*
- [ ] **P4, Mike's review view:** an admin page or SQL runbook to publish, reject or clear flags. Sharing across users turns on here.
  *(Mike approval)*
- [ ] **P5, production enablement:** apply the migration, set the key, turn the flag on. *(Mike approval, explicit release)*

## Not verified
- Free-tier RPM/RPD numbers come from a third-party summary. Confirm them in AI Studio before P3.
- Confirmed from the migration that `lesson_completions` rejects non-`les_` ids, so a separate progress table is planned.
