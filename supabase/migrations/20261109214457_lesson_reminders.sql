-- UNAPPLIED: requires Mike's explicit approval. No credentials or scheduler are created.
create schema if not exists reminder_private;
revoke all on schema reminder_private from public, anon, authenticated, service_role;
-- One destination per account; enabling on another browser replaces the previous one.
create table public.lesson_reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint like 'https://%'),
  p256dh text not null check (p256dh ~ '^B[A-Za-z0-9_-]{86}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),
  updated_at timestamptz not null default now()
);
alter table public.lesson_reminder_settings enable row level security;
revoke all on public.lesson_reminder_settings from anon, authenticated, service_role;
grant select, insert, update on public.lesson_reminder_settings to authenticated;
create policy lesson_reminder_settings_own on public.lesson_reminder_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.lesson_reminder_finished_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key(user_id, day)
);
create table public.lesson_reminder_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  claimed_at timestamptz not null default now(),
  primary key(user_id, day)
);
alter table public.lesson_reminder_finished_days enable row level security;
alter table public.lesson_reminder_claims enable row level security;
revoke all on public.lesson_reminder_finished_days, public.lesson_reminder_claims from anon, authenticated, service_role;
grant insert on public.lesson_reminder_finished_days to authenticated;
create policy lesson_reminder_finished_insert_own on public.lesson_reminder_finished_days
  for insert to authenticated with check (
    user_id = (select auth.uid()) and day = (statement_timestamp() at time zone 'America/Los_Angeles')::date
  );

-- First passes/improved passing attempts are recorded in the same transaction as the quiz write.
create function reminder_private.lesson_reminder_track_pass() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.passed then
    insert into public.lesson_reminder_finished_days(user_id, day)
      values(new.user_id, (statement_timestamp() at time zone 'America/Los_Angeles')::date)
      on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function reminder_private.lesson_reminder_track_pass() from public, anon, authenticated, service_role;
create trigger lesson_reminder_pass after insert or update on public.lesson_completions
  for each row execute function reminder_private.lesson_reminder_track_pass();

-- A passing retake may not change the best-attempt row. Called by the verified quiz action.
-- Caller identity is auth.uid(), never an argument. Self-suppression cannot cause extra sends.
create function public.lesson_reminder_finished() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  insert into public.lesson_reminder_finished_days(user_id, day)
    values(auth.uid(), (statement_timestamp() at time zone 'America/Los_Angeles')::date)
    on conflict do nothing;
end;
$$;
revoke all on function public.lesson_reminder_finished() from public, anon, service_role;
grant execute on function public.lesson_reminder_finished() to authenticated;

-- No password/login is enabled by this migration. Provisioning a narrow sender login is a separate approval.
create role lesson_reminder_sender nologin;
grant usage on schema reminder_private to lesson_reminder_sender;

-- Claim BEFORE transport, permanently consuming today's attempt even if transport fails or crashes.
-- Unique (user, LA day) prevents duplicates across simultaneous jobs/re-enabling/multiple devices.
-- SKIP LOCKED keeps batches disjoint; the unique ledger remains the final concurrency guard.
create function reminder_private.lesson_reminder_claim_batch() returns table(user_id uuid, endpoint text, p256dh text, auth text, claim_day text)
language plpgsql security definer set search_path = '' as $$
declare today date := (statement_timestamp() at time zone 'America/Los_Angeles')::date;
begin
  return query
  with candidates as materialized (
    select s.user_id, s.endpoint, s.p256dh, s.auth from public.lesson_reminder_settings s
    where s.enabled
      and not exists(select 1 from public.lesson_reminder_finished_days f where f.user_id = s.user_id and f.day = today)
      -- Existing completions cover users who passed before this migration was installed today.
      and not exists(select 1 from public.lesson_completions c where c.user_id = s.user_id and c.passed
        and (coalesce(c.first_passed_at, c.completed_at) at time zone 'America/Los_Angeles')::date = today)
      and not exists(select 1 from public.lesson_reminder_claims c where c.user_id = s.user_id and c.day = today)
    order by s.user_id limit 100 for update of s skip locked
  ), claimed as (
    insert into public.lesson_reminder_claims(user_id, day)
    select c.user_id, today from candidates c on conflict do nothing returning lesson_reminder_claims.user_id
  )
  select c.user_id, c.endpoint, c.p256dh, c.auth, today::text from candidates c join claimed a on a.user_id = c.user_id;
end;
$$;
revoke all on function reminder_private.lesson_reminder_claim_batch() from public, anon, authenticated, service_role;
grant execute on function reminder_private.lesson_reminder_claim_batch() to lesson_reminder_sender;

-- An expired destination must not disable a newer replacement registered during this send.
create function reminder_private.lesson_reminder_expire(p_user uuid, p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  update public.lesson_reminder_settings set enabled = false
  where user_id = p_user and endpoint = p_endpoint;
$$;
revoke all on function reminder_private.lesson_reminder_expire(uuid, text) from public, anon, authenticated, service_role;
grant execute on function reminder_private.lesson_reminder_expire(uuid, text) to lesson_reminder_sender;

-- Recheck immediately before each network send: opt-out/completion after batch reservation wins.
create function reminder_private.lesson_reminder_ready(p_user uuid, p_endpoint text, p_day date) returns boolean
language sql security definer set search_path = '' as $$
  select p_day = (statement_timestamp() at time zone 'America/Los_Angeles')::date
    and exists(select 1 from public.lesson_reminder_settings s where s.user_id = p_user and s.endpoint = p_endpoint and s.enabled)
    and exists(select 1 from public.lesson_reminder_claims c where c.user_id = p_user and c.day = p_day)
    and not exists(select 1 from public.lesson_reminder_finished_days f where f.user_id = p_user and f.day = p_day)
    and not exists(select 1 from public.lesson_completions c where c.user_id = p_user and c.passed
      and (coalesce(c.first_passed_at, c.completed_at) at time zone 'America/Los_Angeles')::date = p_day);
$$;
revoke all on function reminder_private.lesson_reminder_ready(uuid, text, date) from public, anon, authenticated, service_role;
grant execute on function reminder_private.lesson_reminder_ready(uuid, text, date) to lesson_reminder_sender;
