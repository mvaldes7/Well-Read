-- REV-011 nit 3: per-user rate limit on activity_log inserts.
--
-- STATUS: UNAPPLIED. Do not run against any Supabase project until Mike has
-- reviewed and approved it. Apply via the normal migration process only, as
-- version 20261102210548 (must match this filename; after 20261015023134).
-- The app tolerates this migration being absent or present: a rate-limited insert
-- returns "rate_limited" from insertActivity and quiz submission is unaffected.
--
-- Notes:
-- * The app writes exactly one 'quiz_attempt' row per graded quiz submission, so
--   normal use is a handful of rows per minute at most. Limits: 20 rows per rolling
--   minute and 300 per rolling hour, per user. That allows a submission every 3 s
--   for a minute, which no real reader hits, while capping self-flooding via direct
--   PostgREST calls at 7,200 rows/day.
-- * Exceeding a limit raises SQLSTATE 'WR429' (custom, class WR) with a fixed
--   message; PostgREST returns it as an error with code 'WR429'.
-- * SECURITY INVOKER with search_path = '': the count runs under the caller's RLS
--   (own rows only), which is exactly the set being limited. EXECUTE is revoked;
--   triggers don't check it (REV-012).
-- * A transaction-scoped advisory lock per user serialises concurrent inserts from
--   the same user so parallel requests can't overshoot the limit.
-- * Uses the existing (user_id, occurred_at) index. Counts by occurred_at, which a
--   client can set; a forged old occurred_at could evade the window, so the
--   trigger also pins occurred_at to now() on insert (the app never sets it).
-- * No schema, policy or grant changes; existing rows are untouched.

create function public.activity_log_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  per_minute integer;
  per_hour   integer;
begin
  new.occurred_at := pg_catalog.now();

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('activity_log:' || new.user_id::text, 0));

  select count(*) filter (where a.occurred_at > pg_catalog.now() - interval '1 minute'),
         count(*)
    into per_minute, per_hour
    from public.activity_log a
   where a.user_id = new.user_id
     and a.occurred_at > pg_catalog.now() - interval '1 hour';

  if per_minute >= 20 or per_hour >= 300 then
    raise exception 'activity_log rate limit exceeded'
      using errcode = 'WR429',
            hint = 'At most 20 activity rows per minute and 300 per hour per user.';
  end if;

  return new;
end;
$$;

revoke all on function public.activity_log_rate_limit() from public, anon, authenticated;

create trigger activity_log_rate_limit
  before insert on public.activity_log
  for each row execute function public.activity_log_rate_limit();
