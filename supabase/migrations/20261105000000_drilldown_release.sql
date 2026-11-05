-- Drill-downs cap fix: a failed or rejected generation gives back its lesson slot (Gemini calls stay counted).
--
-- STATUS: DRAFT, UNAPPLIED. Apply via the normal migration process only, as version 20261105000000 (must match
-- this filename), AFTER 20261104214500_drilldown_review.sql. Tested only against a throwaway local Postgres
-- (scripts/test-db-local.sh). Does not edit any earlier migration.
--
-- * drilldown_release_lesson(p_user): SECURITY DEFINER, EXECUTE only for drilldown_server. The server calls it once
--   when an attempt that reserved a lesson slot (drilldown_reserve(..., true)) ends without a kept lesson. It lowers
--   today's per-user and global `lessons` by 1, but only while the user's reserved slots exceed the lessons they kept
--   today (pending/flagged/published), so it can never take the counter below real usage. `calls` are never released:
--   they are real provider spend and the 8-call/100-call caps still bound retries.
-- * drilldown_save_lesson(): replaced with the same signature and body, except that "lessons used today" no longer
--   counts rejected drafts (kept only for Mike's review), so a rejected draft does not hold a slot.

-- ---------------------------------------------------------------- release a lesson slot
create function public.drilldown_release_lesson(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
  reserved integer;
  kept integer;
begin
  if p_user is null then raise exception 'bad release' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('drilldown_usage:' || d::text, 0));
  select u.lessons into reserved from public.drilldown_usage_user u where u.user_id = p_user and u.day = d for update;
  select pg_catalog.count(*) into kept from public.generated_lessons g
    where g.created_by = p_user and (g.created_at at time zone 'America/Los_Angeles')::date = d
      and g.review_status <> 'rejected';
  if coalesce(reserved, 0) <= kept then return; end if;  -- nothing to give back
  update public.drilldown_usage_user set lessons = lessons - 1 where user_id = p_user and day = d;
  update public.drilldown_usage_global set lessons = lessons - 1 where day = d and lessons > 0;
end;
$$;

revoke all on function public.drilldown_release_lesson(uuid) from public, anon, authenticated, service_role;
grant execute on function public.drilldown_release_lesson(uuid) to drilldown_server;

-- ---------------------------------------------------------------- save: rejected drafts don't count as used
create or replace function public.drilldown_save_lesson(
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
    where g.created_by = p_user and (g.created_at at time zone 'America/Los_Angeles')::date = d
      and g.review_status <> 'rejected';  -- rejected drafts don't hold a lesson slot (20261105000000)
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

revoke all on function public.drilldown_save_lesson(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.drilldown_save_lesson(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to drilldown_server;
