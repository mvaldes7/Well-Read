-- LOCAL throwaway Postgres only (scripts/test-db-local.sh). Drill-downs P4 draft migration: owner gate, review queue
-- filters, publish / reject / clear_report, fact_check storage and grants. Runs after drilldowns.test.sql.
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1', now()), ('00000000-0000-0000-0000-0000000000f2', now()),
  ('00000000-0000-0000-0000-0000000000f3', null);
-- Seed rows as the table owner (postgres); the server path is covered by drilldowns.test.sql / server-db.node.mjs.
insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, review_status, lesson, sources, unconfirmed_claims)
values
  ('gen_rvpend0001', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'a', 'v', 'm', 'pending', '{"title":"P"}', '[{"url":"https://a.edu"}]', '[]'),
  ('gen_rvflag0001', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'b', 'v', 'm', 'flagged', '{"title":"F"}', '[{"url":"https://a.edu"}]', '[{"ref":"fact2","claim":"c","reason":"r"}]'),
  ('gen_rvpubl0001', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'c', 'v', 'm', 'published', '{"title":"R"}', '[{"url":"https://a.edu"}]', '[]'),
  ('gen_rvpubl0002', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'd', 'v', 'm', 'published', '{"title":"Q"}', '[{"url":"https://a.edu"}]', '[]'),
  ('gen_rvrejd0001', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'e', 'v', 'm', 'rejected', '{"title":"X"}', '[{"url":"https://a.edu"}]', '[]');
insert into public.lesson_reports (lesson_id, user_id, reason) values ('gen_rvpubl0001', '00000000-0000-0000-0000-0000000000f2', 'wrong date');
-- gen_rvpubl0002 gets a report only after the queue checks (below), to test unpublish closing it.

-- ---- grants: nothing for API roles; only drilldown_server may execute the new functions
select t.eq(has_table_privilege(r, 'public.drilldown_owner', 'select'), false, 'owner table hidden from ' || r)
  from unnest(array['anon', 'authenticated', 'service_role', 'drilldown_server']) r;
select t.eq(has_column_privilege('authenticated', 'public.generated_lessons', 'fact_check', 'select'), false, 'fact_check not client-readable');
select t.eq(has_function_privilege(r, f, 'execute'), r = 'drilldown_server', f || ' for ' || r)
  from unnest(array['anon', 'authenticated', 'service_role', 'drilldown_server']) r,
       unnest(array['public.drilldown_review_queue(uuid)', 'public.drilldown_review_action(uuid, text, text)',
                    'public.drilldown_save_fact_check(uuid, text, jsonb)']) f;
select t.eq(has_function_privilege(r, 'public.drilldown_require_owner(uuid)', 'execute'), false, 'require_owner internal for ' || r)
  from unnest(array['anon', 'authenticated', 'service_role', 'drilldown_server']) r;
select t.eq((select count(*) from pg_proc where proname in ('drilldown_review_queue', 'drilldown_review_action', 'drilldown_save_fact_check', 'drilldown_require_owner')
  and prosecdef and proconfig @> array['search_path=""']), 4::bigint, 'definer + empty search_path');

begin;
set local role drilldown_server;
-- ---- owner gate: no owner configured yet -> everyone WR403
select t.expect_error($$select * from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1')$$, 'WR403');
select t.expect_error($$select * from public.drilldown_owner$$, '42501');
select t.expect_error($$insert into public.drilldown_owner (user_id) values ('00000000-0000-0000-0000-0000000000f2')$$, '42501');
commit;

insert into public.drilldown_owner (user_id) values ('00000000-0000-0000-0000-0000000000f1');
select t.expect_error($$insert into public.drilldown_owner (user_id) values ('00000000-0000-0000-0000-0000000000f2')$$, '23505');

begin;
set local role drilldown_server;
select t.expect_error($$select * from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f2')$$, 'WR403');
select t.expect_error($$select * from public.drilldown_review_queue(null)$$, 'WR403');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f2', 'gen_rvpend0001', 'publish')$$, 'WR403');
-- ---- queue (rows seeded here; drilldowns.test.sql leaves its own rows too): pending + flagged + reported (published), never the unreported published or rejected one
select t.eq((select string_agg(id, ',' order by id) from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1') where id like 'gen\_rv%'),
  'gen_rvflag0001,gen_rvpend0001,gen_rvpubl0001', 'queue contents');
select t.eq((select open_reports->0->>'reason' from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1') where id = 'gen_rvpubl0001'),
  'wrong date', 'open report shown');
select t.eq((select open_reports ? 'user_id' or (open_reports->0) ? 'user_id' from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1') where id = 'gen_rvpubl0001'),
  false, 'no reporter id');
-- ---- actions
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpend0001', 'unpublish')$$, 'WR404');  -- pending can't be unpublished
select t.eq(public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpend0001', 'publish'), 'published', 'publish pending');
select t.eq(public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvflag0001', 'reject'), 'rejected', 'reject flagged');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvrejd0001', 'publish')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'publish')$$, 'WR404');
-- REV-019: reject only pending/flagged; unpublish only published
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'reject')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvrejd0001', 'reject')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvrejd0001', 'unpublish')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f2', 'gen_rvpubl0002', 'unpublish')$$, 'WR403');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_nosuch0001', 'reject')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'clear_report')$$, 'WR404');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0001', 'delete')$$, '22023');
select t.eq(public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0001', 'clear_report'), 'published', 'clear report');
select t.eq((select count(*) from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1') where id like 'gen\_rv%'), 0::bigint, 'queue empty after review');
commit;
insert into public.lesson_reports (lesson_id, user_id, reason) values ('gen_rvpubl0002', '00000000-0000-0000-0000-0000000000f2', 'outdated');
begin;
set local role drilldown_server;
select t.eq(public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'unpublish'), 'rejected', 'unpublish published');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'unpublish')$$, 'WR404');
commit;
select t.eq((select review_status || ':' || (published_at is null)::text from public.generated_lessons where id = 'gen_rvpubl0002'), 'rejected:true', 'unpublished = rejected, published_at cleared');
select t.eq((select resolved_at is not null from public.lesson_reports where lesson_id = 'gen_rvpubl0002'), true, 'unpublish closes reports');
select t.eq((select published_at is not null and reviewed_at is not null from public.generated_lessons where id = 'gen_rvpend0001'), true, 'publish timestamps');
select t.eq((select resolved_at is not null from public.lesson_reports where lesson_id = 'gen_rvpubl0001'), true, 'report resolved');

-- ---- published is shared: another signed-in user sees it via the existing RLS policy
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.eq((select count(*) from public.generated_lessons where id = 'gen_rvpend0001'), 1::bigint, 'published visible to others');
select t.eq((select count(*) from public.generated_lessons where id = 'gen_rvflag0001'), 0::bigint, 'rejected hidden from others');
select t.eq((select count(*) from public.generated_lessons where id = 'gen_rvpubl0002'), 0::bigint, 'unpublished hidden from others');
select t.expect_error($$select public.drilldown_review_action('00000000-0000-0000-0000-0000000000f1', 'gen_rvpubl0002', 'reject')$$, '42501');
select t.expect_error($$select fact_check from public.generated_lessons$$, '42501');
commit;

-- ---- owner with an unconfirmed email is refused
update public.drilldown_owner set user_id = '00000000-0000-0000-0000-0000000000f3';
begin;
set local role drilldown_server;
select t.expect_error($$select * from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f3')$$, 'WR403');
commit;
update public.drilldown_owner set user_id = '00000000-0000-0000-0000-0000000000f1';

-- ---- fact_check: own lesson created today only, once, shape-checked
insert into public.generated_lessons (id, created_by, parent_lesson_id, choice_id, prompt_version, model, review_status, lesson, sources)
  values ('gen_rvfact0001', '00000000-0000-0000-0000-0000000000f2', 'les_fr02', 'f', 'v', 'm', 'pending', '{"title":"C"}', '[{"url":"https://a.edu"}]');
begin;
set local role drilldown_server;
select t.expect_error($$select public.drilldown_save_fact_check('00000000-0000-0000-0000-0000000000f1', 'gen_rvfact0001', '[{"ref":"fact1","supported":true}]')$$, 'WR404');
select t.expect_error($$select public.drilldown_save_fact_check('00000000-0000-0000-0000-0000000000f2', 'gen_rvfact0001', '[{"ref":"fact1"}]')$$, '23514');
select public.drilldown_save_fact_check('00000000-0000-0000-0000-0000000000f2', 'gen_rvfact0001', '[{"ref":"fact1","supported":true},{"ref":"quiz2","supported":false,"note":"n"}]');
select t.expect_error($$select public.drilldown_save_fact_check('00000000-0000-0000-0000-0000000000f2', 'gen_rvfact0001', '[{"ref":"fact1","supported":false}]')$$, 'WR404');
select t.eq((select fact_check->1->>'note' from public.drilldown_review_queue('00000000-0000-0000-0000-0000000000f1') where id = 'gen_rvfact0001'), 'n', 'fact_check in queue');
commit;
select 'p4-review.test.sql: all assertions passed';
