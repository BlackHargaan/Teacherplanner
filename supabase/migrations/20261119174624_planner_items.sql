-- A teacher's own planner, saved online so it follows them to any computer
-- or browser: school years, classes, lessons, templates, lesson banks,
-- views and settings, one row per item.
--
-- Student information is never sent here. The app strips it before upload
-- and keeps it on the teacher's computer: rosters, student notes, grades,
-- standards scores, who sits where, and notes to and from substitutes.
--
-- Only the teacher who owns a row can read or change it. Deleted items stay
-- as empty "tombstones" so the teacher's other computers learn about the
-- deletion.

create table public.planner_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('year', 'class', 'bank', 'lesson', 'template', 'view', 'framework', 'status', 'user', 'setting')),
  item_id text not null check (char_length(item_id) between 1 and 200),
  data jsonb check (pg_column_size(data) < 2000000),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id),
  check (deleted or data is not null)
);
-- Other computers ask for "everything changed since I last looked".
create index planner_items_user_updated_idx on public.planner_items (user_id, updated_at);

-- The server sets the time (computers' clocks disagree) and a row can't be
-- handed to someone else.
create function private.planner_item_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.planner_item_touch() from public, anon, authenticated;

create trigger planner_items_touch
before insert or update on public.planner_items
for each row execute function private.planner_item_touch();

alter table public.planner_items enable row level security;

create policy "Teachers read their own planner"
  on public.planner_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Teachers add to their own planner"
  on public.planner_items for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Teachers change their own planner"
  on public.planner_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Teachers clear their own planner"
  on public.planner_items for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.planner_items from anon;
grant select, insert, update, delete on public.planner_items to authenticated;

-- A teacher's other open computers hear about changes right away.
alter publication supabase_realtime add table public.planner_items;
