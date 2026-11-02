-- LOCAL throwaway Postgres only (scripts/test-db-local.sh). Drill-downs P2 migration: isolation, private until
-- published, no self-publish, quiz keys hidden, reports, progress, cap counters.
create schema t;
grant usage on schema t to public;
create function t.expect_error(stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', state, stmt;
exception when others then
  if sqlstate <> state then raise exception 'expected %, got % (%) from: %', state, sqlstate, sqlerrm, stmt; end if;
end $$;
create function t.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '%: got %, want %', what, got, want; end if;
end $$;
grant execute on all functions in schema t to public;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.lesson_completions (user_id, lesson_id, score, total, passed)
  values ('00000000-0000-0000-0000-00000000000a', 'les_fr02', 6, 6, true);

-- ---- server (service_role) stores lessons: A's pending one, A's flagged one, B's pending one
begin;
set local role service_role;
insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources, review_status, unconfirmed_claims) values
  ('gen_aaaaaaaa01', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'robespierre', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
   '{"title":"Robespierre","quiz":[{"question":"Q?","options":["a","b","c","d"]}]}', '[{"url":"https://revolution.chnm.org/x"}]', 'pending', '[]'),
  ('gen_aaaaaaaa02', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'reign-of-terror', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
   '{"title":"Terror"}', '[{"url":"https://revolution.chnm.org/y"}]', 'flagged', '[{"ref":"fact3","claim":"x","reason":"not in source"}]'),
  ('gen_bbbbbbbb01', '00000000-0000-0000-0000-00000000000b', 'les_gk01', 'temujin-early-life', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
   '{"title":"Temujin"}', '[{"url":"https://www.worldhistory.org/Genghis_Khan/"}]', 'pending', '[]');
insert into public.generated_quiz_keys values ('gen_aaaaaaaa01', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]');
-- server cannot publish, on insert or update
select t.expect_error($$insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources, review_status)
  values ('gen_cccccccc01', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'x', 'v', 'm', '{}', '[{"url":"https://a.edu"}]', 'published')$$, 'WR403');
select t.expect_error($$update public.generated_lessons set review_status = 'published' where id = 'gen_aaaaaaaa01'$$, 'WR403');
-- server cannot edit content (no column grant)
select t.expect_error($$update public.generated_lessons set lesson = '{}' where id = 'gen_aaaaaaaa01'$$, '42501');
-- answers inside the public lesson body are refused (REV-007)
select t.expect_error($$insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources)
  values ('gen_cccccccc02', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'x', 'v', 'm', '{"quiz":[{"question":"q","answerIndex":1}]}', '[{"url":"https://a.edu"}]')$$, '23514');
-- fact-check rule: flagged needs exactly 1 claim, pending none, never 2+
select t.expect_error($$insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources, review_status, unconfirmed_claims)
  values ('gen_cccccccc03', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'x', 'v', 'm', '{}', '[{"url":"https://a.edu"}]', 'flagged', '[]')$$, '23514');
select t.expect_error($$insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources, review_status, unconfirmed_claims)
  values ('gen_cccccccc04', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'x', 'v', 'm', '{}', '[{"url":"https://a.edu"}]', 'rejected', '[1,2]')$$, '23514');
commit;

-- ---- user A: sees own pending + flagged, not B's; no quiz keys; cannot write lessons or publish
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.eq((select string_agg(id, ',' order by id) from public.generated_lessons), 'gen_aaaaaaaa01,gen_aaaaaaaa02', 'A sees only own lessons');
select t.eq((select ai_generated from public.generated_lessons where id = 'gen_aaaaaaaa01'), true, 'AI-generated flag');
select t.expect_error($$select * from public.generated_quiz_keys$$, '42501');
select t.expect_error($$update public.generated_lessons set review_status = 'published' where id = 'gen_aaaaaaaa01'$$, '42501');
select t.expect_error($$insert into public.generated_lessons (id, parent_lesson_id, choice_id, prompt_version, model, lesson, sources, review_status)
  values ('gen_dddddddd01', 'les_fr02', 'x', 'v', 'm', '{}', '[{"url":"https://a.edu"}]', 'published')$$, '42501');
select t.expect_error($$delete from public.generated_lessons where id = 'gen_aaaaaaaa01'$$, '42501');
-- usage counters: readable own, never writable
select t.expect_error($$insert into public.drilldown_usage_user (user_id, day, lessons, calls) values ((select auth.uid()), current_date, 0, 0)$$, '42501');
select t.expect_error($$update public.drilldown_usage_user set lessons = 0$$, '42501');
select t.expect_error($$select * from public.drilldown_usage_global$$, '42501');
select t.expect_error($$update public.drilldown_usage_global set calls = 0$$, '42501');
select t.expect_error($$select public.drilldown_reserve((select auth.uid()), 1, true)$$, '42501');
-- reports: own lesson OK; B's (invisible) lesson refused; cannot report as someone else; one per lesson
insert into public.lesson_reports (lesson_id, reason) values ('gen_aaaaaaaa01', 'A date looks wrong');
select t.expect_error($$insert into public.lesson_reports (lesson_id, reason) values ('gen_bbbbbbbb01', 'x')$$, '42501');
select t.expect_error($$insert into public.lesson_reports (lesson_id, user_id, reason) values ('gen_aaaaaaaa02', '00000000-0000-0000-0000-00000000000b', 'x')$$, '42501');
select t.expect_error($$insert into public.lesson_reports (lesson_id, reason) values ('gen_aaaaaaaa01', 'again')$$, '23505');
select t.expect_error($$update public.lesson_reports set resolved_at = now()$$, '42501');
-- progress: own visible lesson OK, invisible lesson refused
insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_aaaaaaaa01', 5, 6, true);
select t.expect_error($$insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_bbbbbbbb01', 5, 6, true)$$, '42501');
select t.expect_error($$update public.generated_lesson_completions set user_id = '00000000-0000-0000-0000-00000000000b'$$, '42501');
commit;

-- ---- user B: sees only own; cannot read A's reports or progress
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select string_agg(id, ',') from public.generated_lessons), 'gen_bbbbbbbb01', 'B sees only own lesson before publish');
select t.eq((select count(*) from public.lesson_reports), 0::bigint, 'B cannot see A''s reports');
select t.eq((select count(*) from public.generated_lesson_completions), 0::bigint, 'B cannot see A''s progress');
commit;

-- ---- anon sees nothing
begin;
set local role anon;
select t.expect_error($$select * from public.generated_lessons$$, '42501');
select t.expect_error($$insert into public.lesson_reports (lesson_id, reason) values ('gen_aaaaaaaa01', 'x')$$, '42501');
commit;

-- ---- Mike publishes (admin role path), then B can read it; rejected lessons disappear for the owner
begin;
set local role drilldown_admin;
update public.generated_lessons set review_status = 'published' where id = 'gen_aaaaaaaa01';
select t.eq((select published_at is not null and reviewed_at is not null from public.generated_lessons where id = 'gen_aaaaaaaa01'), true, 'publish timestamps');
commit;
-- owner/SQL path also works (postgres, as in the dashboard SQL editor)
update public.generated_lessons set review_status = 'rejected' where id = 'gen_bbbbbbbb01';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select string_agg(id, ',') from public.generated_lessons), 'gen_aaaaaaaa01', 'B sees the published lesson, not its own rejected one');
select t.expect_error($$update public.generated_lessons set review_status = 'pending' where id = 'gen_aaaaaaaa01'$$, '42501');
insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_aaaaaaaa01', 4, 6, false);
commit;
-- a report moves a published lesson back to flagged (server), hiding it from others again
begin;
set local role service_role;
update public.generated_lessons set review_status = 'flagged', unconfirmed_claims = '[{"ref":"report","claim":"","reason":"user report"}]' where id = 'gen_aaaaaaaa01';
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select count(*) from public.generated_lessons), 0::bigint, 'flagged lesson hidden from non-owner');
commit;
select t.eq((select published_at from public.generated_lessons where id = 'gen_aaaaaaaa01'), null::timestamptz, 'unpublish clears published_at');

-- ---- caps via drilldown_reserve (service_role): 2 lessons/user, 8 calls/user, 25 lessons + 100 calls global
begin;
set local role service_role;
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 4, true);
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 4, true);
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 1, true)$$, 'WR429');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 1, false)$$, 'WR429');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 5, false)$$, '22023');
select t.eq((select lessons || '/' || calls from public.drilldown_usage_user where user_id = '00000000-0000-0000-0000-00000000000a'), '2/8', 'user counters unchanged by refused reservations');
-- direct writes past a cap are refused by the CHECK backstop
select t.expect_error($$update public.drilldown_usage_user set lessons = 3$$, '23514');
select t.expect_error($$update public.drilldown_usage_global set calls = 101$$, '23514');
select t.expect_error($$update public.drilldown_usage_global set lessons = 26$$, '23514');
commit;
-- global: fill to 92 calls / 24 lessons, then the hard stop and global lesson cap bite
update public.drilldown_usage_global set calls = 97, lessons = 24;
begin;
set local role service_role;
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000b', 3, true); -- 100 calls, 25 lessons
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000b', 1, false)$$, 'WR429');
commit;
update public.drilldown_usage_global set calls = 50;
begin;
set local role service_role;
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000b', 1, true)$$, 'WR429');
select t.eq((select lessons from public.drilldown_usage_global), 25, 'global lesson cap holds at 25');
commit;
-- user A can read own counters only
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.eq((select count(*) from public.drilldown_usage_user), 1::bigint, 'A reads only own usage row');
commit;

-- ---- function hygiene: every new function is SECURITY INVOKER with search_path=''
select t.eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('generated_lessons_guard', 'drilldown_reserve')
    and not p.prosecdef and p.proconfig = array['search_path=""']), 2::bigint, 'invoker + pinned search_path');
select t.eq((select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('generated_lessons_guard', 'drilldown_reserve')), false, 'EXECUTE revoked from authenticated');
select 'drilldowns.test.sql: all assertions passed' as result;
