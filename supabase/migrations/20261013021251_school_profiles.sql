-- School profiles: one teacher sets up the school's calendar and bell
-- schedule; colleagues join with a code and get it, kept up to date.
--
-- Only the shared school schedule is stored (dates, days off, bell periods,
-- grading periods, early-release schedules). Each teacher's classes,
-- lessons, rosters and grades stay on their own computer.
--
-- Roles:
--   owner  – created the school; edits it, manages members, deletes it
--   admin  – edits the shared schedule
--   member – receives the schedule; can leave

create table public.schools (
  id text primary key check (char_length(id) between 1 and 100),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'My school' check (char_length(name) between 1 and 200),
  -- what colleagues type to join: 8 letters/digits, no look-alikes
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index schools_owner_idx on public.schools (owner_id);
create index schools_updated_by_idx on public.schools (updated_by);

create table public.school_members (
  school_id text not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index school_members_user_idx on public.school_members (user_id);

-- ---------------------------------------------------------------- access helpers

create function private.school_role(p_school text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.schools s where s.id = p_school and s.owner_id = auth.uid()) then 'owner'
    else (select m.role from public.school_members m where m.school_id = p_school and m.user_id = auth.uid())
  end;
$$;

-- Do two teachers belong to the same school? (Lets them see each other's names.)
create function private.shares_a_school_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select id as school_id from public.schools where owner_id = auth.uid()
    union select school_id from public.school_members where user_id = auth.uid()
  ), theirs as (
    select id as school_id from public.schools where owner_id = p_user
    union select school_id from public.school_members where user_id = p_user
  )
  select exists (select 1 from mine join theirs using (school_id));
$$;

revoke all on function private.school_role(text), private.shares_a_school_with(uuid) from public, anon;
grant execute on function private.school_role(text), private.shares_a_school_with(uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.schools enable row level security;
alter table public.school_members enable row level security;

create policy "schools: members read" on public.schools
  for select to authenticated using (private.school_role(id) is not null);
create policy "schools: create as owner" on public.schools
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "schools: owner and admins update" on public.schools
  for update to authenticated
  using (private.school_role(id) in ('owner', 'admin'))
  with check (private.school_role(id) in ('owner', 'admin'));
create policy "schools: owner deletes" on public.schools
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Only the owner may hand the school to someone else; stamp every change.
create function public.guard_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id and old.owner_id is distinct from auth.uid() then
    raise exception 'Only the owner can transfer a school';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger schools_guard before update on public.schools
  for each row execute function public.guard_school();
revoke execute on function public.guard_school() from public, anon, authenticated;

-- Members see each other; only the owner changes roles; the owner or an admin
-- can remove someone, and anyone can leave. Joining goes through join_school().
create policy "school members: members read" on public.school_members
  for select to authenticated using (private.school_role(school_id) is not null);
create policy "school members: owner changes roles" on public.school_members
  for update to authenticated
  using (private.school_role(school_id) = 'owner')
  with check (private.school_role(school_id) = 'owner');
create policy "school members: owner or admin removes, or leave yourself" on public.school_members
  for delete to authenticated
  using (private.school_role(school_id) in ('owner', 'admin') or user_id = (select auth.uid()));

-- Teammates in a school can see each other's names, as with lesson banks.
alter policy "profiles: read own and teammates" on public.profiles
  using (id = (select auth.uid()) or private.shares_a_bank_with(id) or private.shares_a_school_with(id));

-- ---------------------------------------------------------------- joining

-- Join a school with its code. Returns the school's id.
create function public.join_school(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id text;
  found_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a school';
  end if;
  select s.id, s.owner_id into found_id, found_owner
  from public.schools s
  where s.join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if found_id is null then
    raise exception 'No school uses that code. Check it and try again.';
  end if;
  if found_owner <> auth.uid() then
    insert into public.school_members (school_id, user_id, role)
    values (found_id, auth.uid(), 'member')
    on conflict (school_id, user_id) do nothing;
  end if;
  return found_id;
end;
$$;

revoke execute on function public.join_school(text) from public, anon;
grant execute on function public.join_school(text) to authenticated;

-- Live updates when the school's schedule or membership changes.
alter publication supabase_realtime add table public.schools, public.school_members;
