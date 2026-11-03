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

insert into auth.users values ('00000000-0000-0000-0000-00000000000a', now()), ('00000000-0000-0000-0000-00000000000b', now()),
  ('00000000-0000-0000-0000-00000000000c', null);  -- c: email not confirmed
insert into public.lesson_completions (user_id, lesson_id, score, total, passed)
  values ('00000000-0000-0000-0000-00000000000a', 'les_fr02', 6, 6, true);

-- ---- drilldown_server: no table privileges at all, on these or any other public table
select t.eq((select count(*) from pg_tables pt cross join lateral (values ('select'), ('insert'), ('update'), ('delete')) v(p)
  where pt.schemaname in ('public', 'auth') and has_table_privilege('drilldown_server', format('%I.%I', pt.schemaname, pt.tablename), v.p)), 0::bigint,
  'drilldown_server has no table privileges');
begin;
set local role drilldown_server;
select t.expect_error($$select id from public.generated_lessons$$, '42501');
select t.expect_error($$insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, lesson, sources)
  values ('gen_zzzzzzzz01', '00000000-0000-0000-0000-00000000000a', 'les_fr02', 'x', 'v', 'm', '{}', '[{"url":"https://a.edu"}]')$$, '42501');
select t.expect_error($$update public.generated_lessons set review_status = 'published'$$, '42501');
select t.expect_error($$delete from public.generated_lessons$$, '42501');
select t.expect_error($$select * from public.generated_quiz_keys$$, '42501');
select t.expect_error($$insert into public.generated_quiz_keys values ('gen_x', '[]', '[]')$$, '42501');
select t.expect_error($$select * from public.drilldown_usage_global$$, '42501');
select t.expect_error($$update public.drilldown_usage_global set calls = 0$$, '42501');
select t.expect_error($$insert into public.drilldown_usage_user (user_id, day) values ('00000000-0000-0000-0000-00000000000a', current_date)$$, '42501');
select t.expect_error($$delete from public.drilldown_usage_user$$, '42501');
select t.expect_error($$select * from public.lesson_reports$$, '42501');
select t.expect_error($$select * from public.generated_lesson_completions$$, '42501');
select t.expect_error($$select * from public.lesson_completions$$, '42501');
select t.expect_error($$select * from auth.users$$, '42501');
-- unverified email is refused, before any usage is counted
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000c', 1, true)$$, 'WR403');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-0000000000ff', 1, true)$$, 'WR403');
-- no reservation yet: a write is refused
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa01', 'les_fr02', 'robespierre', 'v', 'm',
  'pending', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, 'WR429');
-- server stores lessons: A's pending one, A's flagged one, B's pending one (each needs a lesson reservation)
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 2, true);
select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa01', 'les_fr02', 'robespierre', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
  'pending', '{"title":"Robespierre","quiz":[{"question":"Q?","options":["a","b","c","d"]}]}', '[{"url":"https://revolution.chnm.org/x"}]', '{}', '[]',
  '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]');
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa09', 'les_fr02', 'x', 'v', 'm',
  'pending', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, 'WR429');
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 2, true);
select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa02', 'les_fr02', 'reign-of-terror', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
  'flagged', '{"title":"Terror"}', '[{"url":"https://revolution.chnm.org/y"}]', '{}', '[{"ref":"fact3","claim":"x","reason":"not in source"}]',
  '[0,0,0,0,0,0]', '["e","e","e","e","e","e"]');
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000b', 4, true);
-- server can never write published
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000b', 'gen_bbbbbbbb09', 'les_gk01', 'x', 'v', 'm',
  'published', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, 'WR403');
-- answers inside the public lesson body are refused (REV-007); fact-check rule: flagged needs exactly 1 claim
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000b', 'gen_bbbbbbbb08', 'les_gk01', 'x', 'v', 'm',
  'pending', '{"quiz":[{"question":"q","answerIndex":1}]}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '23514');
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000b', 'gen_bbbbbbbb07', 'les_gk01', 'x', 'v', 'm',
  'flagged', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '23514');
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000b', 'gen_bbbbbbbb06', 'les_gk01', 'x', 'v', 'm',
  'rejected', '{}', '[{"url":"https://a.edu"}]', '{}', '[1,2]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '23514');
select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000b', 'gen_bbbbbbbb01', 'les_gk01', 'temujin-early-life', 'p1b-2-grounded', 'gemini-3.1-flash-lite',
  'pending', '{"title":"Temujin"}', '[{"url":"https://www.worldhistory.org/Genghis_Khan/"}]', '{}', '[]', '[2,2,2,2,2,2]', '["e","e","e","e","e","e"]');
-- quiz keys only for a lesson that user may see
select t.eq((select answers from public.drilldown_quiz_key('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa01')), '[1,1,1,1,1,1]'::jsonb, 'owner key');
select t.eq((select count(*) from public.drilldown_quiz_key('00000000-0000-0000-0000-00000000000b', 'gen_aaaaaaaa01')), 0::bigint, 'no key for invisible lesson');
select t.expect_error($$select public.drilldown_my_lessons()$$, '42501');
commit;

-- ---- user A: sees own pending + flagged, not B's; no quiz keys; cannot write lessons or publish
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.eq((select string_agg(id, ',' order by id) from public.generated_lessons), 'gen_aaaaaaaa01,gen_aaaaaaaa02', 'A sees only own lessons');
-- column-level select: no created_by / unconfirmed_claims, no select *; owner reads own claim via drilldown_my_lessons()
select t.expect_error($$select created_by from public.generated_lessons$$, '42501');
select t.expect_error($$select unconfirmed_claims from public.generated_lessons$$, '42501');
select t.expect_error($$select * from public.generated_lessons$$, '42501');
select t.eq((select unconfirmed_claims->0->>'ref' from public.drilldown_my_lessons() where id = 'gen_aaaaaaaa02'), 'fact3', 'owner sees own claim');
select t.eq((select count(*) from public.drilldown_my_lessons()), 2::bigint, 'my_lessons = own only');
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
-- server-only functions are not executable by end users
select t.expect_error($$select public.drilldown_reserve((select auth.uid()), 1, true)$$, '42501');
select t.expect_error($$select public.drilldown_save_lesson((select auth.uid()), 'gen_aaaaaaaa05', 'les_fr02', 'x', 'v', 'm', 'pending', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '42501');
select t.expect_error($$select * from public.drilldown_quiz_key((select auth.uid()), 'gen_aaaaaaaa01')$$, '42501');
select t.expect_error($$select public.drilldown_require_verified((select auth.uid()))$$, '42501');
-- reports: own lesson OK; B's (invisible) lesson refused; cannot report as someone else; one per lesson
insert into public.lesson_reports (lesson_id, reason) values ('gen_aaaaaaaa01', 'A date looks wrong');
select t.eq((select count(id) from public.lesson_reports), 1::bigint, 'A reads own report');
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
select t.eq((select count(id) from public.lesson_reports), 0::bigint, 'B cannot see A''s reports');
select t.eq((select count(lesson_id) from public.generated_lesson_completions), 0::bigint, 'B cannot see A''s progress');
commit;

-- ---- anon sees nothing
begin;
set local role anon;
select t.expect_error($$select id from public.generated_lessons$$, '42501');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 1, true)$$, '42501');
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa05', 'les_fr02', 'x', 'v', 'm', 'pending', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '42501');
select t.expect_error($$select * from public.drilldown_quiz_key('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa01')$$, '42501');
select t.expect_error($$select public.drilldown_my_lessons()$$, '42501');
select t.expect_error($$insert into public.lesson_reports (lesson_id, reason) values ('gen_aaaaaaaa01', 'x')$$, '42501');
commit;

-- ---- Mike publishes by owner SQL (postgres, as in the dashboard SQL editor); then B can read it
update public.generated_lessons set review_status = 'published' where id = 'gen_aaaaaaaa01';
select t.eq((select published_at is not null and reviewed_at is not null from public.generated_lessons where id = 'gen_aaaaaaaa01'), true, 'publish timestamps');
update public.generated_lessons set review_status = 'rejected' where id = 'gen_bbbbbbbb01';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select string_agg(id, ',') from public.generated_lessons), 'gen_aaaaaaaa01', 'B sees the published lesson, not its own rejected one');
select t.expect_error($$select created_by from public.generated_lessons where id = 'gen_aaaaaaaa01'$$, '42501');
select t.eq((select count(*) from public.drilldown_my_lessons()), 0::bigint, 'B cannot read A''s claims');
select t.expect_error($$update public.generated_lessons set review_status = 'pending' where id = 'gen_aaaaaaaa01'$$, '42501');
insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_aaaaaaaa01', 4, 6, false);
commit;
begin;
set local role drilldown_server;
select t.eq((select answers from public.drilldown_quiz_key('00000000-0000-0000-0000-00000000000b', 'gen_aaaaaaaa01')), '[1,1,1,1,1,1]'::jsonb, 'published key for B');
commit;
-- Mike unpublishes after a report (owner SQL), hiding it from others again
update public.generated_lessons set review_status = 'flagged', unconfirmed_claims = '[{"ref":"report","claim":"","reason":"user report"}]' where id = 'gen_aaaaaaaa01';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select count(id) from public.generated_lessons), 0::bigint, 'flagged lesson hidden from non-owner');
commit;
select t.eq((select published_at from public.generated_lessons where id = 'gen_aaaaaaaa01'), null::timestamptz, 'unpublish clears published_at');

-- ---- caps via drilldown_reserve (drilldown_server): 2 lessons/user, 8 calls/user, 25 lessons + 100 calls global
-- A already reserved 2 lessons / 4 calls above.
begin;
set local role drilldown_server;
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 4, false);
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 0, true)$$, 'WR429');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 1, false)$$, 'WR429');
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 5, false)$$, '22023');
commit;
select t.eq((select lessons || '/' || calls from public.drilldown_usage_user where user_id = '00000000-0000-0000-0000-00000000000a'), '2/8', 'user counters unchanged by refused reservations');
-- direct writes past a cap are refused by the CHECK backstop (even for the owner)
select t.expect_error($$update public.drilldown_usage_user set lessons = 3$$, '23514');
select t.expect_error($$update public.drilldown_usage_global set calls = 101$$, '23514');
select t.expect_error($$update public.drilldown_usage_global set lessons = 26$$, '23514');
-- global: fill to 97 calls / 24 lessons, then the hard stop and global lesson cap bite
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', now());
update public.drilldown_usage_global set calls = 97, lessons = 24;
begin;
set local role drilldown_server;
select public.drilldown_reserve('00000000-0000-0000-0000-00000000000d', 3, true); -- 100 calls, 25 lessons
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000d', 1, false)$$, 'WR429');
commit;
update public.drilldown_usage_global set calls = 50;
begin;
set local role drilldown_server;
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000d', 1, true)$$, 'WR429');
commit;
select t.eq((select lessons from public.drilldown_usage_global), 25, 'global lesson cap holds at 25');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.eq((select count(*) from public.drilldown_usage_user), 1::bigint, 'A reads only own usage row');
commit;

-- ---- function hygiene: search_path='' everywhere; definer only where intended; EXECUTE grants exact
select t.eq((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like 'drilldown\_%' or p.proname like 'generated\_lessons\_%')
    and p.proconfig = array['search_path=""']), 6::bigint, 'pinned search_path');
select t.eq((select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef), 'drilldown_my_lessons,drilldown_quiz_key,drilldown_require_verified,drilldown_reserve,drilldown_save_lesson', 'definer set');
select t.eq((select string_agg(p.proname || ':' || r.rolname, ',' order by p.proname, r.rolname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('drilldown_server')) r(rolname)
  where n.nspname = 'public' and (p.proname like 'drilldown\_%' or p.proname like 'generated\_lessons\_%')
    and has_function_privilege(case when r.rolname = 'public' then 'anon' else r.rolname end, p.oid, 'execute')
    ),
  'drilldown_my_lessons:authenticated,drilldown_quiz_key:drilldown_server,drilldown_reserve:drilldown_server,drilldown_save_lesson:drilldown_server',
  'EXECUTE: server-only functions only for drilldown_server');
-- hosted default privileges grant EXECUTE on new functions to service_role; the migration must revoke it (REV-014)
begin;
set local role service_role;
select t.expect_error($$select public.drilldown_reserve('00000000-0000-0000-0000-00000000000a', 1, false)$$, '42501');
select t.expect_error($$select public.drilldown_save_lesson('00000000-0000-0000-0000-00000000000a', 'gen_ssssssss01', 'les_fr02', 'x', 'v', 'm', 'pending', '{}', '[{"url":"https://a.edu"}]', '{}', '[]', '[1,1,1,1,1,1]', '["e","e","e","e","e","e"]')$$, '42501');
select t.expect_error($$select * from public.drilldown_quiz_key('00000000-0000-0000-0000-00000000000a', 'gen_aaaaaaaa01')$$, '42501');
select t.expect_error($$select public.drilldown_my_lessons()$$, '42501');
select t.expect_error($$select public.drilldown_require_verified('00000000-0000-0000-0000-00000000000a')$$, '42501');
commit;
-- the lesson_reports identity sequence has no client grants
select t.eq((select bool_or(has_sequence_privilege(r, 'public.lesson_reports_id_seq', p)) from unnest(array['anon', 'authenticated', 'service_role', 'drilldown_server']) r
  cross join unnest(array['usage', 'select', 'update']) p), false, 'no sequence privileges');
select t.eq((select count(*) from pg_roles where rolname = 'drilldown_admin'), 0::bigint, 'no drilldown_admin role');
select t.eq((select rolcanlogin and not rolbypassrls and not rolsuper and rolpassword is null and rolconnlimit = 5 from pg_authid where rolname = 'drilldown_server'), true, 'server role: login, no password, no bypass');
select 'drilldowns.test.sql: all assertions passed' as result;
