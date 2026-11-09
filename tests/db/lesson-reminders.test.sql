-- Only the throwaway Unix-socket cluster launched by scripts/test-db-local.sh.
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000e1', now()),
 ('00000000-0000-0000-0000-0000000000e2', now()),
 ('00000000-0000-0000-0000-0000000000e3', now());
insert into public.lesson_reminder_settings(user_id, enabled, endpoint, p256dh, auth) values
 ('00000000-0000-0000-0000-0000000000e1', true, 'https://fcm.googleapis.com/test1', 'B' || repeat('a',86), repeat('a',22)),
 ('00000000-0000-0000-0000-0000000000e2', true, 'https://fcm.googleapis.com/test2', 'B' || repeat('a',86), repeat('a',22)),
 ('00000000-0000-0000-0000-0000000000e3', false, 'https://fcm.googleapis.com/test3', 'B' || repeat('a',86), repeat('a',22));
-- A pass records today's finished day in the quiz transaction.
insert into public.lesson_completions(user_id, lesson_id, score, total, passed) values
 ('00000000-0000-0000-0000-0000000000e2', 'les_test99', 10, 10, true);
select t.eq((select count(*)::integer from public.lesson_reminder_finished_days where user_id = '00000000-0000-0000-0000-0000000000e2'), 1, 'pass trigger');
-- Removing the new log simulates a pass made before this migration: legacy completion still suppresses.
delete from public.lesson_reminder_finished_days where user_id = '00000000-0000-0000-0000-0000000000e2';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select t.eq((select count(*)::integer from public.lesson_reminder_settings), 1, 'settings RLS only own');
select t.expect_error($$select * from reminder_private.lesson_reminder_claim_batch()$$, '42501');
select t.expect_error($$insert into public.lesson_reminder_claims values ('00000000-0000-0000-0000-0000000000e1', current_date, now())$$, '42501');
select t.expect_error($$update public.lesson_reminder_settings set user_id = '00000000-0000-0000-0000-0000000000e3'$$, '42501');
commit;
begin;
set local role anon;
select t.expect_error($$select * from public.lesson_reminder_settings$$, '42501');
select t.expect_error($$select * from reminder_private.lesson_reminder_claim_batch()$$, '42501');
select t.expect_error($$select public.lesson_reminder_finished()$$, '42501');
commit;
begin;
set local role lesson_reminder_sender;
select t.expect_error($$select * from public.lesson_completions$$, '42501');
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 1, 'only opted-in unfinished user');
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 0, 'second invocation cannot repeat');
-- A stale expiration must not disable a new destination.
select reminder_private.lesson_reminder_expire('00000000-0000-0000-0000-0000000000e1', 'https://fcm.googleapis.com/old');
commit;
select t.eq((select enabled::text from public.lesson_reminder_settings where user_id = '00000000-0000-0000-0000-0000000000e1'), 'true', 'stale cleanup harmless');
-- Turning off/on cannot reset the daily claim.
update public.lesson_reminder_settings set enabled = false where user_id = '00000000-0000-0000-0000-0000000000e1';
update public.lesson_reminder_settings set enabled = true where user_id = '00000000-0000-0000-0000-0000000000e1';
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 0, 'toggle does not reset claim');
-- Yesterday's claim doesn't block today; a passing retake RPC suppresses even without a new best row.
update public.lesson_reminder_claims set day = day - 1 where user_id = '00000000-0000-0000-0000-0000000000e1';
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 1, 'new day permits next claim');
delete from public.lesson_reminder_claims where user_id = '00000000-0000-0000-0000-0000000000e1';
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.lesson_reminder_finished();
select public.lesson_reminder_finished();
commit;
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 0, 'passing retake suppresses');
-- Failed quizzes alone do not suppress.
insert into public.lesson_completions(user_id, lesson_id, score, total, passed) values
 ('00000000-0000-0000-0000-0000000000e3', 'les_test99', 2, 10, false);
update public.lesson_reminder_settings set enabled = true where user_id = '00000000-0000-0000-0000-0000000000e3';
select t.eq((select count(*)::integer from reminder_private.lesson_reminder_claim_batch()), 1, 'failed quiz does not suppress');
update public.lesson_reminder_settings set enabled = false;
select 'lesson-reminders.test.sql: all assertions passed';
