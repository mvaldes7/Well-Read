-- Drill-downs P2 (docs/plans/topic-drilldowns.md, section 6): generated lessons, quiz keys, reports,
-- usage counters for the caps, and drill-down progress.
--
-- STATUS: UNAPPLIED. Do not run against any Supabase project until Mike has
-- reviewed and approved it. Apply via the normal migration process only, as
-- version 20261102231600 (must match this filename; after 20261102210548 / recorded 20261102212005).
-- Tested only against a throwaway local Postgres (scripts/test-db-local.sh, tests/db/*.test.sql).
--
-- Who can write what (the core decision). No service_role anywhere (supabase/README.md still forbids it):
-- * authenticated (end users, own session): column-level SELECT on generated_lessons (never created_by or
--   unconfirmed_claims), rows = their own pending/flagged lessons + every published lesson; their own flagged
--   claim via public.drilldown_my_lessons(); write ONLY their own reports and drill-down progress. No write on
--   lessons, quiz keys or usage counters, so they cannot publish, edit a lesson, or reset/skip a cap.
-- * drilldown_server (LOGIN role, NO password here; Mike sets one out of band, see supabase/README.md): the P3
--   generation server action connects as it via the server-only env var DRILLDOWN_DB_URL. It has NO table
--   privileges at all, only EXECUTE on the SECURITY DEFINER functions drilldown_reserve(), drilldown_save_lesson()
--   and drilldown_quiz_key(). Those take user_id as an argument that the server must take from the verified
--   session (getClaims/getUser), refuse users whose email is not confirmed, enforce the caps, and can never
--   write 'published'.
-- * Publishing: owner SQL only (Mike in the dashboard SQL editor as the table owner, postgres). No role, function,
--   or app path can publish.
--
-- Caps (config.mjs DRILLDOWN_CAPS): per user per LA day 2 lessons / 8 calls; global 25 lessons / 100 calls (hard
-- stop). Enforced atomically by drilldown_reserve() (advisory lock per day, raises SQLSTATE 'WR429') with CHECK
-- constraints on the counter tables as a backstop; drilldown_save_lesson() also needs an unused lesson reservation.
--
-- Conventions as in earlier migrations: user_id default auth.uid() references auth.users on delete cascade;
-- policies "to authenticated" with (select auth.uid()); revoke all, then minimal (column-level) grants. Every
-- function sets search_path = '' and fully qualifies names; EXECUTE revoked from public/anon/authenticated
-- (except the read-only drilldown_my_lessons(), granted to authenticated and scoped to auth.uid()).
-- SECURITY DEFINER functions run as the migration owner (postgres), which owns these tables, so RLS (not FORCEd)
-- does not apply inside them; each one checks its own inputs. Quiz answers stay server-side (REV-007).

-- ---------------------------------------------------------------- server role
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'drilldown_server') then
    create role drilldown_server login noinherit nobypassrls nocreatedb nocreaterole;
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

create function public.generated_lessons_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.review_status is distinct from old.review_status then
    new.reviewed_at := pg_catalog.now();
  end if;
  new.published_at := case when new.review_status = 'published'
    then coalesce(case when tg_op = 'UPDATE' then old.published_at end, pg_catalog.now()) end;
  return new;
end;
$$;

revoke all on function public.generated_lessons_timestamps() from public, anon, authenticated;

create trigger generated_lessons_timestamps
  before insert or update on public.generated_lessons
  for each row execute function public.generated_lessons_timestamps();

alter table public.generated_lessons enable row level security;

revoke all on table public.generated_lessons from public, anon, authenticated, service_role;
-- Column-level: never created_by or unconfirmed_claims (REV-013). Clients must list columns (no select *).
grant select (id, parent_lesson_id, choice_id, prompt_version, model, ai_generated, review_status, lesson, sources,
              citations, created_at, reviewed_at, published_at)
  on table public.generated_lessons to authenticated;

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
revoke all on table public.generated_quiz_keys from public, anon, authenticated, service_role;
-- No grants, no policies: read only through drilldown_quiz_key() (drilldown_server).

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
  'A user flags a generated lesson. Mike reviews reports and, by owner SQL, unpublishes or rejects.';

alter table public.lesson_reports enable row level security;
revoke all on table public.lesson_reports from public, anon, authenticated, service_role;
grant select (id, lesson_id, reason, created_at, resolved_at) on table public.lesson_reports to authenticated;
grant insert (lesson_id, reason) on table public.lesson_reports to authenticated;

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
revoke all on table public.drilldown_usage_user from public, anon, authenticated, service_role;
revoke all on table public.drilldown_usage_global from public, anon, authenticated, service_role;
grant select on table public.drilldown_usage_user to authenticated;

create policy "drilldown_usage_user_select_own"
  on public.drilldown_usage_user for select
  to authenticated
  using (user_id = (select auth.uid()));
-- drilldown_usage_global: no authenticated grant or policy.

-- Generation needs a confirmed email (auth.users.email_confirmed_at). Raises WR403 otherwise. Internal helper.
create function public.drilldown_require_verified(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
    raise exception 'drilldown: email not verified' using errcode = 'WR403';
  end if;
end;
$$;

revoke all on function public.drilldown_require_verified(uuid) from public, anon, authenticated;

-- SECURITY DEFINER, drilldown_server only. Atomically reserve usage before provider calls; p_user must come from
-- the verified session. p_new_lesson counts one lesson toward the per-user and global
-- lesson caps; p_calls counts provider calls. Raises WR429 (cap name in the message) and changes nothing on a cap.
create function public.drilldown_reserve(p_user uuid, p_calls integer, p_new_lesson boolean)
returns void
language plpgsql
security definer
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
  perform public.drilldown_require_verified(p_user);
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
grant execute on function public.drilldown_reserve(uuid, integer, boolean) to drilldown_server;

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
revoke all on table public.generated_lesson_completions from public, anon, authenticated, service_role;
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


-- ---------------------------------------------------------------- server write/read path (drilldown_server only)
-- Store one generated lesson + its quiz key. Status is pending/flagged/rejected only (never published). Needs an
-- unused lesson reservation for p_user today (drilldown_reserve(..., true)), so writes can't outrun the caps.
create function public.drilldown_save_lesson(
  p_user uuid, p_id text, p_parent_lesson_id text, p_choice_id text, p_prompt_version text, p_model text,
  p_review_status text, p_lesson jsonb, p_sources jsonb, p_citations jsonb, p_unconfirmed_claims jsonb,
  p_answers jsonb, p_explanations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
  reserved integer;
  used integer;
begin
  if p_user is null then raise exception 'bad lesson' using errcode = '22023'; end if;
  if p_review_status is null or p_review_status not in ('pending', 'flagged', 'rejected') then
    raise exception 'drilldown: server cannot write status %', p_review_status using errcode = 'WR403';
  end if;
  perform public.drilldown_require_verified(p_user);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('drilldown_usage:' || d::text, 0));
  select u.lessons into reserved from public.drilldown_usage_user u where u.user_id = p_user and u.day = d;
  select pg_catalog.count(*) into used from public.generated_lessons g
    where g.created_by = p_user and (g.created_at at time zone 'America/Los_Angeles')::date = d;
  if coalesce(reserved, 0) <= used then
    raise exception 'drilldown cap: no reservation' using errcode = 'WR429';
  end if;
  insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model,
      ai_generated, review_status, lesson, sources, citations, unconfirmed_claims)
    values (p_id, p_user, p_parent_lesson_id, p_choice_id, p_prompt_version, p_model,
      true, p_review_status, p_lesson, p_sources, coalesce(p_citations, '{}'::jsonb), coalesce(p_unconfirmed_claims, '[]'::jsonb));
  insert into public.generated_quiz_keys (lesson_id, answers, explanations) values (p_id, p_answers, p_explanations);
end;
$$;

revoke all on function public.drilldown_save_lesson(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.drilldown_save_lesson(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to drilldown_server;

-- Quiz key for grading, only for a lesson p_user may see (published, or own pending/flagged).
create function public.drilldown_quiz_key(p_user uuid, p_lesson_id text)
returns table (answers jsonb, explanations jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select k.answers, k.explanations
  from public.generated_quiz_keys k
  join public.generated_lessons g on g.id = k.lesson_id
  where k.lesson_id = p_lesson_id
    and (g.review_status = 'published' or (g.created_by = p_user and g.review_status in ('pending', 'flagged')));
$$;

revoke all on function public.drilldown_quiz_key(uuid, text) from public, anon, authenticated;
grant execute on function public.drilldown_quiz_key(uuid, text) to drilldown_server;

-- Owners read their own lessons' unconfirmed claim (the column is not client-selectable). Read-only, scoped to
-- auth.uid(), returns nothing for anon. The one definer function granted to authenticated.
create function public.drilldown_my_lessons()
returns table (id text, review_status text, unconfirmed_claims jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.review_status, g.unconfirmed_claims, g.created_at
  from public.generated_lessons g
  where g.created_by = (select auth.uid()) and g.review_status in ('pending', 'flagged')
  order by g.created_at desc;
$$;

revoke all on function public.drilldown_my_lessons() from public, anon, authenticated;
grant execute on function public.drilldown_my_lessons() to authenticated;

grant usage on schema public to drilldown_server;
