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
- **Real, verified sources:** the model may cite only from an allowlisted candidate set that the server supplies. Candidates come from
  (a) the topic's existing hand-curated `sources` and (b) optional search grounding restricted to allowlisted domains (britannica.com,
  plato.stanford.edu, metmuseum.org, uscourts.gov, loc.gov, archives.gov, smarthistory.org, ...). After generation, the server fetches each
  URL (HTTPS only, `isHttpsUrl`). It must return 200 and its page title must match. It must also contain key terms from the claims cited to it.
  If any source fails, the lesson is rejected or regenerated. URLs are never invented and never rendered unchecked.

## 4. Quality and safety checks
1. Schema validation (above). On failure, regenerate up to 2 times, then show "couldn't generate".
2. Source checks (above), plus a deduplication check.
3. Fact check: a second cheap model call checks that each key fact and each quiz answer is supported by the fetched source text. Unsupported
   items get flagged, and the lesson is rejected. Also check `answerIndex` against the explanation.
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

## 6. DB changes (future migration; NOT written, needs Mike's approval)
Follow the repo's existing patterns from `supabase/migrations/*` and the REV-011/REV-012 reviews: `user_id uuid default auth.uid()
references auth.users on delete cascade`, check constraints, policies `to authenticated` using `(select auth.uid())`, `revoke all ... from
anon`, minimal column-level grants (REV-012 nit 2), trigger functions with `set search_path = ''` and EXECUTE revoked. No service role in app code
(supabase/README.md). Keep the app tolerant of absent tables (the "Not available yet" pattern used for reading_list), so code can deploy before the migration.
Also follow REV-007: answers stay server-side.
- `generated_lessons` (id text pk `gen_…`, cache_key unique, discipline/topic slugs, lesson jsonb, status, model, prompt_version,
  created_by, created_at). RLS: select only where `status = 'published'` or (`created_by = (select auth.uid())` and status in ('private','flagged')). No policy
  lets any client role set `status = 'published'`; only Mike (dashboard SQL/owner role, or a future admin RPC gated on his user id) can. **No** insert/update grant for
  `authenticated`. Writes go through a `security definer` RPC with a pinned search_path that validates and rate-limits, or through Mike-run
  review. Because quiz answers are inside `lesson`, clients must not select that column directly. Either expose a view/RPC that strips
  `answerIndex`/`explanation`, or store the quiz key in a separate table with no client select grant.
- `generated_quiz_keys` (lesson_id, answers jsonb, explanations jsonb). No client grants at all. It is read only by the grading RPC.
- `drilldown_requests` (id, user_id default auth.uid(), source_lesson_id text, choice_id text, generated_lesson_id, created_at).
  `choice_id` is checked against the slug format. The app validates that it belongs to the lesson, because content lives in JSON, not the DB.
  Insert policy (the completion gate in SQL):
  `with check (user_id = (select auth.uid()) and exists (select 1 from public.lesson_completions c where c.user_id = (select auth.uid()) and c.lesson_id = source_lesson_id))`.
- `lesson_reports` (id, lesson_id, user_id default auth.uid(), reason text check length<=500, created_at). Own-row insert/select only;
  one open report per user per lesson (unique). Insert trigger sets the lesson to `flagged` (security definer, `search_path=''`, EXECUTE revoked).
- `generation_usage` (user_id, day, calls). Used for caps. Own-row select only. Writes happen inside the RPC.

Open question: generation needs a server-side LLM key, and writes to a shared cache need a privilege above `authenticated`. The cleanest
no-service-role design is a SECURITY DEFINER RPC that accepts already-validated JSON from the server action. That still trusts the
caller, though, so the review flow (status = pending_review) is the real safeguard. This needs an architect review.

## 7. UI entry point
- Lesson page, after the quiz result: a "Dig deeper" button, shown only when signed in, the lesson's quiz is completed and the flag is on.
- It opens a small panel with the lesson's 3-4 stored choices as buttons. There is no text box. Picking one posts `{ lessonId, choiceId }` to a server action.
  The result shows at `/d/[discipline]/[topic]/[lesson]/deeper/[choice]`. It reuses the
  lesson page components and `Quiz.tsx` unchanged. An "AI-generated · sources verified <date>" badge sits above the Sources list.
- Generation runs in a server action with a loading state. The 20-60 s path should stream or poll, not block.

## 8. Caps and the hard stop (conservative, free tier)
Counted in **provider calls**, not lessons. Calls per item: lesson = 1 generate + 1 fact-check + at most 1 retry, so 3 calls in the worst case.
- **Per user per day:** 2 generated lessons, so at most 6 calls. A cached published lesson costs 0 calls and doesn't count.
- **Global per day:** 30 lessons, so at most 90 calls, with a **hard stop at 100 calls/day**. That is 20% of the assumed 500 RPD free quota,
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
- [ ] **P1b, offline prototype:** a script that generates a lesson for one topic into a local JSON file and runs the validator, source
  fetch-check and fact check. Free-tier key only. *(Mike approval: create the Google AI Studio project/key)*
- [ ] **P2, migration draft:** tables, RLS, report trigger and usage counters (section 6), tested in a throwaway local Postgres. **Not
  applied.** *(Mike approval to write; separate approval to apply)*
- [ ] **P3, server + UI behind the flag:** the "Dig deeper" panel and server action (using the P0 gate), private lessons with the AI-generated label, the Report button, caps and
  the hard stop. Preview only. *(Mike approval)*
- [ ] **P4, Mike's review view:** an admin page or SQL runbook to publish, reject or clear flags. Sharing across users turns on here.
  *(Mike approval)*
- [ ] **P5, production enablement:** apply the migration, set the key, turn the flag on. *(Mike approval, explicit release)*

## Not verified
- Free-tier RPM/RPD numbers come from a third-party summary. Confirm them in AI Studio before P3.
- Confirmed from the migration that `lesson_completions` rejects non-`les_` ids, so a separate progress table is planned.
