-- Drill-downs P2 (docs/plans/topic-drilldowns.md, section 6): generated lessons, quiz keys, reports,
-- usage counters for the caps, and drill-down progress.
--
-- STATUS: UNAPPLIED. Do not run against any Supabase project until Mike has
-- reviewed and approved it. Apply via the normal migration process only, as
-- version 20261102231600 (must match this filename; after 20261102210548 / recorded 20261102212005).
-- Tested only against a throwaway local Postgres (scripts/test-db-local.sh, tests/db/drilldowns.sql).
--
-- Who can write what (the core decision):
-- * authenticated (end users, own session): READ their own private lessons and every published lesson; write
--   ONLY their own reports (lesson_id, reason) and their own drill-down progress. They have NO insert/update on
--   generated_lessons, generated_quiz_keys or the usage counters, so they cannot publish, edit a lesson, or reset
--   or skip a cap. Counter rows are owner-readable (to show "1 of 2 left today") but never client-writable.
-- * service_role (server-only, used ONLY by the P3 generation server action, never shipped to the browser):
--   inserts generated lessons as 'pending'/'flagged'/'rejected', inserts quiz keys, and reserves cap usage through
--   public.drilldown_reserve(). This would be the app's first service-role use (supabase/README.md says app code
--   never uses it), which is why it is confined to these tables and needs Mike's approval in P3. A shared cache
--   that one user writes and others read needs a privilege above authenticated; the alternative, a SECURITY
--   DEFINER RPC, was rejected to keep every function SECURITY INVOKER with a pinned search_path (REV-011/012).
-- * drilldown_admin (NOLOGIN role; Mike, via dashboard SQL as the owner/postgres role or a role granted
--   drilldown_admin): the ONLY path to 'published'. Enforced by a BEFORE trigger, so even service_role cannot
--   publish. There is no user-facing or app-facing publish.
--
-- Caps (config.mjs DRILLDOWN_CAPS): 2 lessons per user per LA day, 25 lessons globally, 100 provider calls
-- globally (hard stop). Enforced by CHECK constraints on the counter tables (a backstop no writer can exceed)
-- and atomically by drilldown_reserve() (advisory lock per day, raises SQLSTATE 'WR429').
--
-- Conventions as in earlier migrations: user_id default auth.uid() references auth.users on delete cascade;
-- policies "to authenticated" with (select auth.uid()); revoke all from anon/authenticated, then minimal
-- (column-level) grants; functions SECURITY INVOKER, set search_path = '', fully qualified; EXECUTE revoked
-- from public/anon/authenticated (triggers don't check it). Quiz answers stay server-side (REV-007).

-- ---------------------------------------------------------------- admin role
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'drilldown_admin') then
    create role drilldown_admin nologin;
  end if;
end;
$$;

-- ---------------------------------------------------------------- generated_lessons
create table public.generated_lessons (
  id                 text        primary key,
  created_by         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  parent_lesson_id   text        not null,
  choice_id          text        not null,
  prompt_version     text        not null,
  model              text        not null,
  ai_generated       boolean     not null default true,
  review_status      text        not null default 'pending',
  -- Public lesson body only: title, sections, keyFacts, quiz questions + options. Answers live in generated_quiz_keys.
  lesson             jsonb       not null,
  sources            jsonb       not null,
  citations          jsonb       not null default '{}'::jsonb,
  unconfirmed_claims jsonb       not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz,
  published_at       timestamptz,
  constraint generated_lessons_id_format check (id ~ '^gen_[a-z0-9]{8,16}$'),
  constraint generated_lessons_parent_format check (parent_lesson_id ~ '^les_[a-z0-9]{4,12}$'),
  constraint generated_lessons_choice_format check (choice_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(choice_id) <= 80),
  constraint generated_lessons_prompt_version_length check (char_length(prompt_version) between 1 and 40),
  constraint generated_lessons_model_length check (char_length(model) between 1 and 80),
  constraint generated_lessons_ai_generated check (ai_generated),
  constraint generated_lessons_status_check check (review_status in ('pending', 'flagged', 'published', 'rejected')),
  constraint generated_lessons_lesson_object check (jsonb_typeof(lesson) = 'object'),
  constraint generated_lessons_no_answers check (not jsonb_path_exists(lesson, '$.quiz[*] ? (exists(@.answerIndex) || exists(@.explanation))')),
  constraint generated_lessons_sources_array check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) >= 1),
  constraint generated_lessons_citations_object check (jsonb_typeof(citations) = 'object'),
  constraint generated_lessons_claims_array check (jsonb_typeof(unconfirmed_claims) = 'array' and jsonb_array_length(unconfirmed_claims) <= 1),
  -- Fact-check rule: pending = 0 unconfirmed claims; flagged = exactly 1 (delivered to the owner, awaiting Mike).
  constraint generated_lessons_claims_rule check (
    (review_status <> 'pending' or jsonb_array_length(unconfirmed_claims) = 0)
    and (review_status <> 'flagged' or jsonb_array_length(unconfirmed_claims) = 1)),
  constraint generated_lessons_published_at check ((review_status = 'published') = (published_at is not null))
);

comment on table public.generated_lessons is
  'AI-generated drill-down lessons. Private to created_by (pending/flagged) until Mike publishes; published = readable by every signed-in user.';

create index generated_lessons_created_by_idx on public.generated_lessons (created_by);
create index generated_lessons_cache_idx on public.generated_lessons (parent_lesson_id, choice_id, prompt_version, model) where review_status = 'published';

create function public.generated_lessons_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  is_admin boolean := pg_catalog.pg_has_role(current_user, 'drilldown_admin', 'MEMBER');
begin
  if tg_op = 'INSERT' then
    if new.review_status = 'published' and not is_admin then
      raise exception 'only an admin can publish a generated lesson' using errcode = 'WR403';
    end if;
  else
    if new.review_status is distinct from old.review_status and new.review_status = 'published' and not is_admin then
      raise exception 'only an admin can publish a generated lesson' using errcode = 'WR403';
    end if;
    if not is_admin and (new.id, new.created_by, new.parent_lesson_id, new.choice_id, new.prompt_version, new.model, new.lesson, new.sources, new.citations, new.created_at)
        is distinct from (old.id, old.created_by, old.parent_lesson_id, old.choice_id, old.prompt_version, old.model, old.lesson, old.sources, old.citations, old.created_at) then
      raise exception 'generated lesson content is immutable' using errcode = 'WR403';
    end if;
    if new.review_status is distinct from old.review_status then
      new.reviewed_at := pg_catalog.now();
    end if;
  end if;
  new.published_at := case when new.review_status = 'published'
    then coalesce(case when tg_op = 'UPDATE' then old.published_at end, pg_catalog.now()) end;
  return new;
end;
$$;

revoke all on function public.generated_lessons_guard() from public, anon, authenticated;

create trigger generated_lessons_guard
  before insert or update on public.generated_lessons
  for each row execute function public.generated_lessons_guard();

alter table public.generated_lessons enable row level security;

revoke all on table public.generated_lessons from anon, authenticated, service_role;
grant select on table public.generated_lessons to authenticated;
grant select, insert on table public.generated_lessons to service_role;
-- service_role may only move review_status (e.g. pending -> rejected, published -> flagged on a report) and
-- record the unconfirmed claim; the trigger still blocks 'published'.
grant update (review_status, unconfirmed_claims) on table public.generated_lessons to service_role;
grant select, insert, update, delete on table public.generated_lessons to drilldown_admin;

create policy "generated_lessons_select_own_or_published"
  on public.generated_lessons for select
  to authenticated
  using (review_status = 'published'
         or (created_by = (select auth.uid()) and review_status in ('pending', 'flagged')));

-- ---------------------------------------------------------------- generated_quiz_keys (REV-007)
create table public.generated_quiz_keys (
  lesson_id    text  primary key references public.generated_lessons (id) on delete cascade,
  answers      jsonb not null,
  explanations jsonb not null,
  constraint generated_quiz_keys_answers check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 6),
  constraint generated_quiz_keys_explanations check (jsonb_typeof(explanations) = 'array' and jsonb_array_length(explanations) = 6)
);

comment on table public.generated_quiz_keys is 'Answer keys for generated quizzes. No client access; read only server-side for grading.';

alter table public.generated_quiz_keys enable row level security;
revoke all on table public.generated_quiz_keys from anon, authenticated, service_role;
grant select, insert on table public.generated_quiz_keys to service_role;
grant select, insert, update, delete on table public.generated_quiz_keys to drilldown_admin;
-- No policies: authenticated has no grant at all.

-- ---------------------------------------------------------------- lesson_reports
create table public.lesson_reports (
  id          bigint      generated always as identity primary key,
  lesson_id   text        not null references public.generated_lessons (id) on delete cascade,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text        not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  constraint lesson_reports_reason_length check (char_length(btrim(reason)) between 1 and 500),
  constraint lesson_reports_one_per_user unique (user_id, lesson_id)
);

comment on table public.lesson_reports is
  'A user flags a generated lesson. The server (service_role) moves a published lesson back to flagged; Mike resolves.';

alter table public.lesson_reports enable row level security;
revoke all on table public.lesson_reports from anon, authenticated, service_role;
grant select on table public.lesson_reports to authenticated;
grant insert (lesson_id, reason) on table public.lesson_reports to authenticated;
grant select on table public.lesson_reports to service_role;
grant select, update (resolved_at) on table public.lesson_reports to drilldown_admin;

create policy "lesson_reports_select_own"
  on public.lesson_reports for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The EXISTS runs under the caller's RLS: a user can only report a lesson they can see.
create policy "lesson_reports_insert_own_visible"
  on public.lesson_reports for insert
  to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.generated_lessons g where g.id = lesson_id));

-- ---------------------------------------------------------------- usage counters (caps)
create table public.drilldown_usage_user (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null,
  lessons integer not null default 0,
  calls   integer not null default 0,
  constraint drilldown_usage_user_pkey primary key (user_id, day),
  constraint drilldown_usage_user_lessons_cap check (lessons between 0 and 2),
  constraint drilldown_usage_user_calls_cap check (calls between 0 and 8)
);

create table public.drilldown_usage_global (
  day     date    primary key,
  lessons integer not null default 0,
  calls   integer not null default 0,
  constraint drilldown_usage_global_lessons_cap check (lessons between 0 and 25),
  constraint drilldown_usage_global_calls_cap check (calls between 0 and 100)
);

comment on table public.drilldown_usage_user is 'Per-user daily drill-down usage (America/Los_Angeles day). Caps: 2 lessons, 8 calls.';
comment on table public.drilldown_usage_global is 'Global daily drill-down usage (America/Los_Angeles day). Caps: 25 lessons, 100 calls (hard stop).';

alter table public.drilldown_usage_user enable row level security;
alter table public.drilldown_usage_global enable row level security;
revoke all on table public.drilldown_usage_user from anon, authenticated, service_role;
revoke all on table public.drilldown_usage_global from anon, authenticated, service_role;
grant select on table public.drilldown_usage_user to authenticated;
grant select, insert, update on table public.drilldown_usage_user to service_role;
grant select, insert, update on table public.drilldown_usage_global to service_role;
grant select, insert, update, delete on table public.drilldown_usage_user, public.drilldown_usage_global to drilldown_admin;

create policy "drilldown_usage_user_select_own"
  on public.drilldown_usage_user for select
  to authenticated
  using (user_id = (select auth.uid()));
-- drilldown_usage_global: no authenticated grant or policy.

-- Atomically reserve usage before provider calls. p_new_lesson counts one lesson toward the per-user and global
-- lesson caps; p_calls counts provider calls. Raises WR429 (cap name in the message) and changes nothing on a cap.
create function public.drilldown_reserve(p_user uuid, p_calls integer, p_new_lesson boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
  l integer := case when p_new_lesson then 1 else 0 end;
  u public.drilldown_usage_user%rowtype;
  g public.drilldown_usage_global%rowtype;
begin
  if p_user is null or p_calls is null or p_calls < 0 or p_calls > 4 then
    raise exception 'bad reservation' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('drilldown_usage:' || d::text, 0));
  insert into public.drilldown_usage_global (day) values (d) on conflict (day) do nothing;
  insert into public.drilldown_usage_user (user_id, day) values (p_user, d) on conflict (user_id, day) do nothing;
  select * into g from public.drilldown_usage_global where day = d for update;
  select * into u from public.drilldown_usage_user where user_id = p_user and day = d for update;
  if g.calls + p_calls > 100 then raise exception 'drilldown cap: hard_stop' using errcode = 'WR429'; end if;
  if g.lessons + l > 25 then raise exception 'drilldown cap: global_cap' using errcode = 'WR429'; end if;
  if u.lessons + l > 2 then raise exception 'drilldown cap: user_cap' using errcode = 'WR429'; end if;
  if u.calls + p_calls > 8 then raise exception 'drilldown cap: user_calls' using errcode = 'WR429'; end if;
  update public.drilldown_usage_global set calls = calls + p_calls, lessons = lessons + l where day = d;
  update public.drilldown_usage_user set calls = calls + p_calls, lessons = lessons + l where user_id = p_user and day = d;
end;
$$;

revoke all on function public.drilldown_reserve(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.drilldown_reserve(uuid, integer, boolean) to service_role, drilldown_admin;

-- ---------------------------------------------------------------- generated_lesson_completions (progress)
create table public.generated_lesson_completions (
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id    text        not null references public.generated_lessons (id) on delete cascade,
  score        integer     not null,
  total        integer     not null,
  passed       boolean     not null,
  completed_at timestamptz not null default now(),
  constraint generated_lesson_completions_pkey primary key (user_id, lesson_id),
  constraint generated_lesson_completions_total_positive check (total > 0),
  constraint generated_lesson_completions_score_range check (score >= 0 and score <= total),
  constraint generated_lesson_completions_passed_rule check (passed = (score * 10 >= total * 7))
);

comment on table public.generated_lesson_completions is
  'Best quiz attempt per user and generated lesson (same rules as lesson_completions). Not counted toward mastery.';

alter table public.generated_lesson_completions enable row level security;
revoke all on table public.generated_lesson_completions from anon, authenticated;
grant select, insert on table public.generated_lesson_completions to authenticated;
grant update (score, total, passed, completed_at) on table public.generated_lesson_completions to authenticated;

create policy "generated_lesson_completions_select_own"
  on public.generated_lesson_completions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "generated_lesson_completions_insert_own_visible"
  on public.generated_lesson_completions for insert
  to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.generated_lessons g where g.id = lesson_id));

create policy "generated_lesson_completions_update_own"
  on public.generated_lesson_completions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- admin review policies
-- drilldown_admin is not BYPASSRLS, so it gets explicit full-access policies. The owner role Mike uses in the
-- dashboard SQL editor owns these tables and is not subject to RLS (no FORCE ROW LEVEL SECURITY).
create policy "generated_lessons_admin_all" on public.generated_lessons for all to drilldown_admin using (true) with check (true);
create policy "generated_quiz_keys_admin_all" on public.generated_quiz_keys for all to drilldown_admin using (true) with check (true);
create policy "lesson_reports_admin_all" on public.lesson_reports for all to drilldown_admin using (true) with check (true);
create policy "drilldown_usage_user_admin_all" on public.drilldown_usage_user for all to drilldown_admin using (true) with check (true);
create policy "drilldown_usage_global_admin_all" on public.drilldown_usage_global for all to drilldown_admin using (true) with check (true);
