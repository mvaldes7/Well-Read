-- LOCAL throwaway Postgres only (scripts/test-db-local.sh). Cap fix (20261105000000): a failed or rejected attempt
-- gives back its lesson slot; calls stay counted; never below kept lessons; server-only EXECUTE.
-- Runs after drilldowns.test.sql (reuses its t.* helpers); uses its own users.
insert into auth.users values ('00000000-0000-0000-0000-0000000000d7', now()), ('00000000-0000-0000-0000-0000000000d8', now());
create function t.usage(p uuid) returns text language sql security definer as $$
  select coalesce((select lessons || '/' || calls from public.drilldown_usage_user
    where user_id = p and day = (now() at time zone 'America/Los_Angeles')::date), 'none') $$;
create function t.glessons() returns integer language sql security definer as $$
  select lessons from public.drilldown_usage_global where day = (now() at time zone 'America/Los_Angeles')::date $$;
grant execute on all functions in schema t to public;
-- drilldowns.test.sql filled today's global caps; start this file from an empty global row (test cluster only).
update public.drilldown_usage_global set lessons = 0, calls = 0 where day = (now() at time zone 'America/Los_Angeles')::date;

-- ---- only drilldown_server may release
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d7';
select t.expect_error($$select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7')$$, '42501');
commit;
begin;
set local role anon;
select t.expect_error($$select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7')$$, '42501');
commit;
begin;
set local role service_role;
select t.expect_error($$select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7')$$, '42501');
commit;

begin;
set local role drilldown_server;
create temp table g0 on commit drop as select t.glessons() as n;
-- nothing reserved: release is a no-op (no row, no error); null user refused
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), 'none', 'no-op without a reservation');
select t.expect_error($$select public.drilldown_release_lesson(null)$$, '22023');
-- failed attempt: reserve a lesson + 2 calls, release -> lesson back, calls stay
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 0, true);
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 2, false);
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '1/2', 'reserved');
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '0/2', 'lesson released, calls kept');
select t.eq(t.glessons(), (select n from g0), 'global lesson released too');
-- a second release can't go below real usage
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '0/2', 'never below zero / kept');
-- success: the slot backs a kept lesson, so release does nothing
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 0, true);
select public.drilldown_save_lesson('00000000-0000-0000-0000-0000000000d7', 'gen_eeeeeee101', 'les_fr02', 'robespierre', 'v', 'm',
  'pending', '{"title":"Kept"}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]');
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '1/2', 'kept lesson holds its slot');
-- rejected draft: saved for review but doesn't count; release gives the slot back
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 0, true);
select public.drilldown_save_lesson('00000000-0000-0000-0000-0000000000d7', 'gen_eeeeeee102', 'les_fr02', 'x', 'v', 'm',
  'rejected', '{"title":"Rejected"}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]');
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '1/2', 'rejected draft releases its slot');
-- the QA scenario: 1 success + failures earlier still allows the 2nd lesson today
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 0, true);
select public.drilldown_save_lesson('00000000-0000-0000-0000-0000000000d7', 'gen_eeeeeee103', 'les_fr02', 'y', 'v', 'm',
  'flagged', '{"title":"Second"}', '[{"url":"https://a.edu"}]', '{}', '[{"ref":"fact1","claim":"c","reason":"r"}]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d7'), '2/2', 'second lesson after a failure');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d7', 0, true)$$, 'WR429');
-- releasing one user's slot never touches another user's counters
select public.drilldown_reserve('00000000-0000-0000-0000-0000000000d8', 1, true);
select public.drilldown_release_lesson('00000000-0000-0000-0000-0000000000d7');
select t.eq(t.usage('00000000-0000-0000-0000-0000000000d8'), '1/1', 'other user untouched');
commit;
select 'release.test.sql: all assertions passed';
