-- TSK-017: reading_list_items (a signed-in user's own reading list).
--
-- STATUS: UNAPPLIED. Do not run against any Supabase project until Mike has
-- reviewed and approved it. Apply via the normal migration process only, as
-- version 20261014234000 (must match this filename; after 20261014233800, activity_log as applied).
-- The app tolerates this table being absent: /reading-list shows "Not available
-- yet", so the code can deploy before or after this migration.
--
-- Notes:
-- * Identity id (same style as activity_log): inserts need no sequence privilege.
-- * Owner-only CRUD for authenticated users; anon gets nothing. UPDATE is granted
--   only on (title, kind, url, status). The update policy
--   has both USING and WITH CHECK, so a row can't be moved to another user_id.
-- * url is rendered as a link: only http(s), at most 2048 chars (the app also
--   validates with the URL parser and adds rel="noopener noreferrer").
-- * completed_at is owned by a trigger, not the client: set to now() when status
--   becomes 'completed' (kept if it was already completed), cleared otherwise. The
--   check constraint is a backstop so the pair can never disagree. Rows are
--   written by the app's server actions with the user's own session (no service role).
-- * updated_at is kept current by the same BEFORE trigger. The function pins
--   search_path to '' and schema-qualifies everything it calls.

create table public.reading_list_items (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  title        text        not null,
  kind         text        not null,
  url          text,
  status       text        not null default 'to_read',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint reading_list_items_title_length check (char_length(btrim(title)) between 1 and 300),
  constraint reading_list_items_kind_check check (kind in ('book', 'article', 'poem', 'essay', 'video', 'other')),
  constraint reading_list_items_url_check check (url is null or (url ~* '^https?://' and char_length(url) <= 2048)),
  constraint reading_list_items_status_check check (status in ('to_read', 'in_progress', 'completed')),
  constraint reading_list_items_completed_at_check check ((status = 'completed') = (completed_at is not null))
);

comment on table public.reading_list_items is
  'Per-user reading list (TSK-017). completed_at and updated_at are maintained by trigger.';

create index reading_list_items_user_id_status_idx
  on public.reading_list_items (user_id, status);

create function public.reading_list_items_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' or old.completed_at is null then
      new.completed_at := pg_catalog.now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.reading_list_items_touch() from public, anon, authenticated;

create trigger reading_list_items_touch
  before insert or update on public.reading_list_items
  for each row execute function public.reading_list_items_touch();

alter table public.reading_list_items enable row level security;

-- Only signed-in users, only their own rows. No anon access at all.
revoke all on table public.reading_list_items from anon, authenticated;
grant select, insert, delete on table public.reading_list_items to authenticated;
-- UPDATE only on the user-editable columns. id, user_id, created_at, updated_at and
-- completed_at can't be named in a client UPDATE. Column privileges are checked against
-- the columns in the statement's SET list, not against what a BEFORE trigger assigns to
-- NEW, so the trigger still maintains updated_at and completed_at.
grant update (title, kind, url, status) on table public.reading_list_items to authenticated;

create policy "reading_list_items_select_own"
  on public.reading_list_items for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "reading_list_items_insert_own"
  on public.reading_list_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reading_list_items_update_own"
  on public.reading_list_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reading_list_items_delete_own"
  on public.reading_list_items for delete
  to authenticated
  using (user_id = (select auth.uid()));
