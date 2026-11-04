-- Drill-downs P4 (docs/plans/topic-drilldowns.md, "P4: owner review"): Mike's review-and-publish screen.
--
-- STATUS: DRAFT, UNAPPLIED. Do not run against any Supabase project until Mike has reviewed and approved it.
-- Apply via the normal migration process only, as version 20261104214500 (must match this filename), AFTER
-- 20261102231600_drilldowns.sql. Tested only against a throwaway local Postgres (scripts/test-db-local.sh).
-- Does not edit any earlier migration.
--
-- Adds, with no service_role anywhere:
-- * public.drilldown_owner: a single row holding the owner's auth.users id. Empty after this migration; Mike inserts
--   his own id by owner SQL (see the plan). No grants to any API role or to drilldown_server.
-- * generated_lessons.fact_check: per-claim fact-check results ([{ref, supported, note}], at most 12). NOT granted
--   to authenticated (column-level grants from 20261102231600 stay as they are), so only the owner functions read it.
-- * drilldown_save_fact_check(): drilldown_server stores the results right after drilldown_save_lesson().
-- * drilldown_review_queue() / drilldown_review_action(): owner-only SECURITY DEFINER functions, EXECUTE only for
--   drilldown_server. The server passes the user id from the verified session (getClaims); each function checks it
--   against drilldown_owner (and a confirmed email) and raises WR403 otherwise. The owner id lives in the DB, not in env.

-- ---------------------------------------------------------------- owner
create table public.drilldown_owner (
  singleton boolean primary key default true,
  user_id   uuid    not null unique references auth.users (id) on delete cascade,
  constraint drilldown_owner_singleton check (singleton)
);

comment on table public.drilldown_owner is
  'The one account allowed to review/publish AI drill-down lessons. Set by owner SQL only; no API or server role access.';

alter table public.drilldown_owner enable row level security;
revoke all on table public.drilldown_owner from public, anon, authenticated, service_role;

-- Raises WR403 unless p_user is the configured owner with a confirmed email. Internal helper.
create function public.drilldown_require_owner(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (
    select 1 from public.drilldown_owner o join auth.users u on u.id = o.user_id
    where o.user_id = p_user and u.email_confirmed_at is not null) then
    raise exception 'drilldown: not the owner' using errcode = 'WR403';
  end if;
end;
$$;

revoke all on function public.drilldown_require_owner(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- per-claim fact-check results
alter table public.generated_lessons
  add column fact_check jsonb not null default '[]'::jsonb,
  add constraint generated_lessons_fact_check_array check (
    jsonb_typeof(fact_check) = 'array' and jsonb_array_length(fact_check) <= 12
    and not jsonb_path_exists(fact_check, '$[*] ? (@.type() != "object" || !exists(@.ref) || !exists(@.supported))'));

comment on column public.generated_lessons.fact_check is
  'Per-claim fact-check results [{ref, supported, note}] from the final attempt. Owner review only (no authenticated grant).';

-- drilldown_server: store fact-check results once, for p_user's own lesson created today (LA), never after review.
create function public.drilldown_save_fact_check(p_user uuid, p_id text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
  n integer;
begin
  if p_user is null or p_id is null or p_items is null then raise exception 'bad fact check' using errcode = '22023'; end if;
  update public.generated_lessons g
    set fact_check = p_items
    where g.id = p_id and g.created_by = p_user and g.review_status in ('pending', 'flagged', 'rejected')
      and g.reviewed_at is null and g.fact_check = '[]'::jsonb
      and (g.created_at at time zone 'America/Los_Angeles')::date = d;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'drilldown: fact check not saved' using errcode = 'WR404'; end if;
end;
$$;

revoke all on function public.drilldown_save_fact_check(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.drilldown_save_fact_check(uuid, text, jsonb) to drilldown_server;

-- ---------------------------------------------------------------- owner review queue
-- Pending, flagged, and any lesson with an unresolved report (including published ones). Never quiz answers or
-- the creator's id; report rows carry no reporter id.
create function public.drilldown_review_queue(p_owner uuid)
returns table (id text, parent_lesson_id text, choice_id text, review_status text, model text, prompt_version text,
               lesson jsonb, sources jsonb, citations jsonb, unconfirmed_claims jsonb, fact_check jsonb,
               created_at timestamptz, published_at timestamptz, open_reports jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.drilldown_require_owner(p_owner);
  return query
    select g.id, g.parent_lesson_id, g.choice_id, g.review_status, g.model, g.prompt_version, g.lesson, g.sources,
           g.citations, g.unconfirmed_claims, g.fact_check, g.created_at, g.published_at,
           coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'reason', r.reason, 'created_at', r.created_at)
                       order by r.created_at)
                     from public.lesson_reports r where r.lesson_id = g.id and r.resolved_at is null), '[]'::jsonb)
    from public.generated_lessons g
    where g.review_status in ('pending', 'flagged')
       or exists (select 1 from public.lesson_reports r where r.lesson_id = g.id and r.resolved_at is null)
    order by g.created_at desc
    limit 200;
end;
$$;

revoke all on function public.drilldown_review_queue(uuid) from public, anon, authenticated, service_role;
grant execute on function public.drilldown_review_queue(uuid) to drilldown_server;

-- ---------------------------------------------------------------- owner actions
-- publish: pending/flagged -> published (readable by every signed-in user via the existing RLS policy).
-- reject: pending/flagged -> rejected (never shared; hidden from the creator too); resolves open reports.
-- unpublish: published -> rejected (hidden from everyone again); resolves open reports. Reuses 'rejected' because the
--   20261102231600 status check allows only pending/flagged/published/rejected and rejected is already visible to no one.
-- clear_report: resolve the lesson's open reports; status unchanged.
-- Returns the resulting review_status. WR403 = not the owner; WR404 = unknown lesson or action not allowed now.
create function public.drilldown_review_action(p_owner uuid, p_lesson_id text, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text;
  n integer;
begin
  perform public.drilldown_require_owner(p_owner);
  select g.review_status into s from public.generated_lessons g where g.id = p_lesson_id for update;
  if s is null then raise exception 'drilldown: no such lesson' using errcode = 'WR404'; end if;
  if p_action = 'publish' then
    if s not in ('pending', 'flagged') then raise exception 'drilldown: cannot publish %', s using errcode = 'WR404'; end if;
    update public.generated_lessons set review_status = 'published' where id = p_lesson_id;
    return 'published';
  elsif p_action = 'reject' then
    if s not in ('pending', 'flagged') then raise exception 'drilldown: cannot reject %', s using errcode = 'WR404'; end if;
    update public.generated_lessons set review_status = 'rejected' where id = p_lesson_id;
    update public.lesson_reports set resolved_at = pg_catalog.now() where lesson_id = p_lesson_id and resolved_at is null;
    return 'rejected';
  elsif p_action = 'unpublish' then
    if s <> 'published' then raise exception 'drilldown: cannot unpublish %', s using errcode = 'WR404'; end if;
    update public.generated_lessons set review_status = 'rejected' where id = p_lesson_id;
    update public.lesson_reports set resolved_at = pg_catalog.now() where lesson_id = p_lesson_id and resolved_at is null;
    return 'rejected';
  elsif p_action = 'clear_report' then
    update public.lesson_reports set resolved_at = pg_catalog.now() where lesson_id = p_lesson_id and resolved_at is null;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'drilldown: no open reports' using errcode = 'WR404'; end if;
    return s;
  end if;
  raise exception 'drilldown: bad action' using errcode = '22023';
end;
$$;

revoke all on function public.drilldown_review_action(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.drilldown_review_action(uuid, text, text) to drilldown_server;
