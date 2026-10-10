# Runbook: Curio

## Prerequisites

- Node.js 24 (`engines.node: 24.x`, `.nvmrc` = `24`; CI and Vercel use Node 24). With `nvm`: `nvm use`.
  On older Node, pnpm only warns (`Unsupported engine`); the checks are only supported on 24.
- pnpm 10.33.4 (`corepack enable` picks it up from `packageManager`, or `npm i -g pnpm@10.33.4`)

## Environment

Copy `.env.example` to `.env.local` and fill in the dev Supabase project's URL and publishable key
(client-safe values only; never a service-role/secret key). `.env.local` is git-ignored.
Without it the app builds and runs, but login is unavailable and every page redirects to `/login`.

## Local development

```sh
pnpm install            # use --frozen-lockfile to match CI
pnpm dev                # http://localhost:3000 (use --port <n> to change)
```

## Checks (same as CI job `checks`)

```sh
pnpm install --frozen-lockfile
pnpm lint               # eslint . (flat config)
pnpm typecheck          # next typegen && tsc --noEmit
pnpm test               # node --test tests/unit/
pnpm build              # next build
node scripts/ledger.mjs validate
```

## Database migrations

- Migrations live in `supabase/migrations/<UTC timestamp>_<name>.sql` and are applied only with Mike's approval.
- **Never edit an applied migration** (not even comments). Keep it byte-identical to what was applied.
- New schema changes go in **new migration files with new timestamps**.

- `20261010181930_first_passed_at.sql` (TSK-012) was applied to dev on 2026-10-10 with Mike's approval. The app works with
  or without it: reads and writes fall back to the old columns on `42703`/`PGRST204` (unknown column).

## Content format

Content lives in `src/content/disciplines.json` and is validated at build time (`src/content/index.ts`)
and in `pnpm test` (shared `.mjs` validators). A content mistake fails the build.

**Authoring template** (markdown, one lesson per file; the format of Mike's `123b7557…` file):

```text
Discipline: Poetry & Literature
Topic: Classic Novels
Topic type: style            (person | event | era | style)
Topic summary: One or two sentences.

Lesson title: What Makes a Classic Novel?

## Heading: First section heading
Three paragraphs, separated by blank lines.

## Heading: Second section heading
...

## Heading: Third section heading
...

## Key facts
- Five short facts, one per line.

## Quiz
### Question 1: Question text?
A. Option
B. Option
C. Option
D. Option

Which option is correct: B. One-sentence explanation of why.
(6 questions; 4 options each; exactly one correct.)

## Sources
- Publisher, “Title” — optional note on what the source supports. https://example.org/page
```

**Conversion rules (markdown → JSON):**

- Keep the author's wording verbatim, except for citations. Section paragraphs are joined with a blank line
  (`"\n\n"`) in `sections[].body`; markdown emphasis (`*…*`, `**…**`) is removed (plain text only).
- **Citations are stripped** from every text field and moved into the lesson's `sources`: inline
  `([Name](url))` links, bare `[Name](url)` links, and `[S1]`-style markers (resolved against the file's
  Sources list). Fix the spacing and punctuation left behind (no space before `.`/`,`, no double spaces).
  `pnpm test` fails if `[S#]`, `([`, `](`, a bare URL or `**` survives in any text field.
- **Sources:** `{ "publisher", "title", "url", "note"? }`, in the file's order, deduped by URL within a
  lesson. `url` must be a valid **https** URL. Publisher and title come from the Sources list or the link
  text (for an inline link that only names the publisher, take the title from the linked page's heading).
  Only copy a `note` the file gives; don't invent one.
- **Quiz:** keep the questions, options, answer and explanation as written; `answerIndex` is 0–3 (A–D).
  **Every question needs an `explanation`** (required by the validator). If a file has none, report it;
  write one only when the lesson text clearly supports it, and flag it. Explanations are server-only until
  the quiz is graded.
- Quizzes need 3+ questions (current lessons have 5–6), each with exactly 4 options.

**Ids and slugs:**

- Every lesson has a permanent `id` matching `^les_[a-z0-9]{4,12}$`, unique across ALL content
  (convention: `les_` + 2-letter topic code + 2-digit number, e.g. `les_cc01`). Saved progress is keyed on
  it, so **never change or reuse an id**; when rewriting a lesson keep its id and slug.
- Slugs are lowercase kebab-case, unique within their scope (discipline, topic, lesson).

**Provenance:**

- Lesson content is drafted by Mike using Perplexity; the original dashboard/sidebar mockup ("The Well-Read") was made in Claude.
- The TSK-012 seed-lesson rewrites (`les_rr01`, `les_fr01`, `les_fr02`, `les_so01`, `les_st01`, `les_st02`) are agent-drafted from the sources listed in each lesson.

**Adding a discipline:** append it to the array (order = display order: World History, Philosophy, then the
TSK-012 disciplines) with `slug`, `title`, a one-line `description`, `color` and `topics`. `color` must be one of
the tokens in `src/content/colors.mjs` (`crimson`, `navy`, `forest`, `amber`, `plum`, `slate`), mapped to CSS
once in `globals.css` (`.cover-*`). **All six tokens are now in use**: a 7th discipline needs a new token in
`colors.mjs` plus its `.cover-<token>` shades in `globals.css` (recheck spine title contrast >= 4.5:1).

## Task ledger

```sh
node scripts/ledger.mjs list
node scripts/ledger.mjs status <id> "<State>" --note "<text>" --actor <name>
```

Use `LEDGER_PATH=/tmp/copy.json` (or `--file`) to experiment without touching `tasks/ledger.json`.
