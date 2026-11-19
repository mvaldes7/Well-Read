-- LOCAL throwaway Postgres only (scripts/test-db-local.sh). Dig deeper quizzes step 3, migration 20261119063000:
-- first_passed_at, the parent-completion insert policy, grants, and gen_ refs in activity_log.
-- Uses its own helper schema and users, and removes them at the end, so other test files are unaffected.
create schema tq;
grant usage on schema tq to public;
create function tq.expect_error(stmt text, state text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', state, stmt;
exception when others then
  if sqlstate <> state then raise exception 'expected %, got % (%) from: %', state, sqlstate, sqlerrm, stmt; end if;
end $$;
create function tq.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '%: got %, want %', what, got, want; end if;
end $$;
grant execute on all functions in schema tq to public;

-- ---- schema and grants
select tq.eq((select count(*) from pg_policies where tablename = 'generated_lesson_completions' and policyname = 'generated_lesson_completions_insert_own_visible'), 0::bigint, 'old insert policy dropped');
select tq.eq((select count(*) from pg_policies where tablename = 'generated_lesson_completions' and policyname = 'generated_lesson_completions_insert_own_unlocked' and cmd = 'INSERT'), 1::bigint, 'new insert policy');
select tq.eq(has_table_privilege('authenticated', 'public.generated_lesson_completions', 'select'), true, 'authenticated select');
select tq.eq(has_table_privilege('authenticated', 'public.generated_lesson_completions', 'insert'), true, 'authenticated insert');
select tq.eq(has_table_privilege('authenticated', 'public.generated_lesson_completions', 'delete'), false, 'authenticated no delete');
select tq.eq(has_table_privilege('authenticated', 'public.generated_lesson_completions', 'update'), false, 'authenticated no table-wide update');
select tq.eq(has_column_privilege('authenticated', 'public.generated_lesson_completions', 'first_passed_at', 'update'), true, 'update first_passed_at');
select tq.eq(has_column_privilege('authenticated', 'public.generated_lesson_completions', 'score', 'update'), true, 'update score');
select tq.eq(has_column_privilege('authenticated', 'public.generated_lesson_completions', 'user_id', 'update'), false, 'no update user_id');
select tq.eq(has_column_privilege('authenticated', 'public.generated_lesson_completions', 'lesson_id', 'update'), false, 'no update lesson_id');
select tq.eq((select count(*) from (values ('select'), ('insert'), ('update'), ('delete')) v(p)
  where has_table_privilege('anon', 'public.generated_lesson_completions', v.p) or has_table_privilege('service_role', 'public.generated_lesson_completions', v.p)
     or has_table_privilege('drilldown_server', 'public.generated_lesson_completions', v.p)), 0::bigint, 'no anon/service_role/drilldown_server access');

-- ---- fixtures (owner SQL): D1 and D2; a published lesson under les_fr02, and D2's own pending lesson
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1', now()), ('00000000-0000-0000-0000-0000000000d2', now());
insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, review_status, lesson, sources)
  values ('gen_digquiz0001', '00000000-0000-0000-0000-0000000000d2', 'les_fr02', 'robespierre', 'v', 'm', 'published', '{}', '[{"url":"https://a.edu"}]'),
         ('gen_digquiz0002', '00000000-0000-0000-0000-0000000000d2', 'les_fr01', 'estates', 'v', 'm', 'pending', '{}', '[{"url":"https://a.edu"}]');

-- ---- D1: locked until the parent quiz was submitted; never on an invisible lesson or as someone else
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select tq.expect_error($$insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_digquiz0001', 6, 6, true)$$, '42501');
-- a completion for a different lesson does not unlock it
insert into public.lesson_completions (lesson_id, score, total, passed) values ('les_fr01', 2, 6, false);
select tq.expect_error($$insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_digquiz0001', 6, 6, true)$$, '42501');
-- any submitted parent attempt (here a fail) unlocks it
insert into public.lesson_completions (lesson_id, score, total, passed) values ('les_fr02', 1, 6, false);
insert into public.generated_lesson_completions (lesson_id, score, total, passed, first_passed_at) values ('gen_digquiz0001', 5, 6, true, now());
-- D2's pending lesson is invisible to D1, even with its parent (les_fr01) completed
select tq.expect_error($$insert into public.generated_lesson_completions (lesson_id, score, total, passed) values ('gen_digquiz0002', 6, 6, true)$$, '42501');
select tq.expect_error($$insert into public.generated_lesson_completions (user_id, lesson_id, score, total, passed) values ('00000000-0000-0000-0000-0000000000d2', 'gen_digquiz0001', 6, 6, true)$$, '42501');
-- first_passed_at needs a pass; score columns update; no delete
select tq.expect_error($$update public.generated_lesson_completions set passed = false, score = 1 where lesson_id = 'gen_digquiz0001'$$, '23514');
update public.generated_lesson_completions set score = 6 where lesson_id = 'gen_digquiz0001';
select tq.eq((select score from public.generated_lesson_completions where lesson_id = 'gen_digquiz0001'), 6, 'own update');
select tq.expect_error($$delete from public.generated_lesson_completions$$, '42501');
-- activity_log: les_ and gen_ refs accepted, anything else refused
insert into public.activity_log (kind, ref) values ('quiz_attempt', 'gen_digquiz0001'), ('lesson_passed', 'gen_digquiz0001'), ('quiz_attempt', 'les_fr02');
select tq.expect_error($$insert into public.activity_log (kind, ref) values ('quiz_attempt', 'gen_SHORT')$$, '23514');
select tq.expect_error($$insert into public.activity_log (kind, ref) values ('quiz_attempt', 'gen_abc')$$, '23514');
select tq.expect_error($$insert into public.activity_log (kind, ref) values ('quiz_attempt', 'gen_aaaaaaaaaaaaaaaaa')$$, '23514');
select tq.expect_error($$insert into public.activity_log (kind, ref) values ('quiz_attempt', 'xyz_digquiz0001')$$, '23514');
select tq.expect_error($$insert into public.activity_log (kind, ref) values ('gen_passed', 'gen_digquiz0001')$$, '23514');
select tq.eq((select count(*) from public.activity_log where ref = 'gen_digquiz0001'), 2::bigint, 'D1 reads own gen activity');
commit;

-- ---- owner SQL: the constraint holds for every writer
select tq.expect_error($$insert into public.generated_lesson_completions (user_id, lesson_id, score, total, passed, first_passed_at) values ('00000000-0000-0000-0000-0000000000d2', 'gen_digquiz0002', 1, 6, false, now())$$, '23514');

-- ---- D2 sees none of D1's progress or activity; anon sees nothing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select tq.eq((select count(*) from public.generated_lesson_completions), 0::bigint, 'D2 cannot see D1 progress');
select tq.eq((select count(*) from public.activity_log), 0::bigint, 'D2 cannot see D1 activity');
commit;
begin;
set local role anon;
select tq.expect_error($$select lesson_id from public.generated_lesson_completions$$, '42501');
select tq.expect_error($$insert into public.activity_log (user_id, kind, ref) values ('00000000-0000-0000-0000-0000000000d1', 'quiz_attempt', 'gen_digquiz0001')$$, '42501');
commit;

-- ---- cleanup (cascades from auth.users)
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');
select tq.eq((select count(*) from public.generated_lessons where id like 'gen_digquiz%'), 0::bigint, 'cleanup');
set client_min_messages = warning;
drop schema tq cascade;
reset client_min_messages;
select 'dig-quiz-progress.test.sql: all assertions passed';
