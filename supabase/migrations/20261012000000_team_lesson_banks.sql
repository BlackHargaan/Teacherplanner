-- Team lesson banks: sign-in, sharing and sync for Teacher Planner.
--
-- Only curriculum is stored here: banks, their lesson sections and lessons.
-- Rosters, grades, student notes and teachers' private lesson notes stay on
-- each teacher's own computer and are never uploaded.
--
-- Every table has row-level security; the helper functions below decide who
-- can see and change what:
--   owner  – created the bank; can edit it, manage members and delete it
--   edit   – can change the bank and its lessons
--   view   – can read the bank and link its lessons into their own classes

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  updated_at timestamptz not null default now()
);

-- Create a profile for every new account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- banks

create table public.banks (
  id text primary key check (char_length(id) between 1 and 100),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Lesson bank' check (char_length(name) <= 200),
  color text not null default '#8b5cf6' check (char_length(color) <= 32),
  sections jsonb not null default '[]'::jsonb,
  sequence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_members (
  bank_id text not null references public.banks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('view', 'edit')),
  added_at timestamptz not null default now(),
  primary key (bank_id, user_id)
);
create index bank_members_user_idx on public.bank_members (user_id);

create table public.bank_lessons (
  id text not null check (char_length(id) between 1 and 100),
  bank_id text not null references public.banks (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (bank_id, id),
  -- keep any one lesson to a sensible size (attachments are links, not files)
  check (pg_column_size(data) < 500000)
);

-- Invitations for people who may not have an account yet. When they sign in
-- with that email, accept_invites() turns these into memberships.
create table public.bank_invites (
  bank_id text not null references public.banks (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('view', 'edit')),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (bank_id, email)
);

-- ---------------------------------------------------------------- access helpers
-- security definer so policies can consult membership without recursing into
-- each other's row-level security.

create function public.bank_role(p_bank text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.banks b where b.id = p_bank and b.owner_id = auth.uid()) then 'owner'
    else (select m.role from public.bank_members m where m.bank_id = p_bank and m.user_id = auth.uid())
  end;
$$;

create function public.can_view_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.bank_role(p_bank) is not null; $$;

create function public.can_edit_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.bank_role(p_bank) in ('owner', 'edit'); $$;

create function public.owns_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.bank_role(p_bank) = 'owner'; $$;

-- Do two teachers share any bank? (Lets members see each other's names.)
create function public.shares_a_bank_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select id as bank_id from public.banks where owner_id = auth.uid()
    union select bank_id from public.bank_members where user_id = auth.uid()
  ), theirs as (
    select id as bank_id from public.banks where owner_id = p_user
    union select bank_id from public.bank_members where user_id = p_user
  )
  select exists (select 1 from mine join theirs using (bank_id));
$$;

-- ---------------------------------------------------------------- row-level security

alter table public.profiles enable row level security;
alter table public.banks enable row level security;
alter table public.bank_members enable row level security;
alter table public.bank_lessons enable row level security;
alter table public.bank_invites enable row level security;

-- profiles: yourself, and people you share a bank with
create policy "profiles: read own and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_a_bank_with(id));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Teachers may change their display name, never the email teammates see.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

-- banks
create policy "banks: members read" on public.banks
  for select to authenticated using (public.can_view_bank(id));
create policy "banks: create as owner" on public.banks
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "banks: editors update" on public.banks
  for update to authenticated
  using (public.can_edit_bank(id))
  with check (public.can_edit_bank(id));
create policy "banks: owner deletes" on public.banks
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Only the owner may hand the bank to someone else.
create function public.guard_bank_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id and old.owner_id is distinct from auth.uid() then
    raise exception 'Only the owner can transfer a bank';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger banks_guard_owner before update on public.banks
  for each row execute function public.guard_bank_owner();

-- members: everyone in the bank sees the list; the owner manages it; anyone may leave
create policy "members: bank members read" on public.bank_members
  for select to authenticated using (public.can_view_bank(bank_id));
create policy "members: owner adds" on public.bank_members
  for insert to authenticated with check (public.owns_bank(bank_id));
create policy "members: owner changes roles" on public.bank_members
  for update to authenticated
  using (public.owns_bank(bank_id))
  with check (public.owns_bank(bank_id));
create policy "members: owner removes, or leave yourself" on public.bank_members
  for delete to authenticated
  using (public.owns_bank(bank_id) or user_id = (select auth.uid()));

-- lessons
create policy "lessons: members read" on public.bank_lessons
  for select to authenticated using (public.can_view_bank(bank_id));
create policy "lessons: editors add" on public.bank_lessons
  for insert to authenticated with check (public.can_edit_bank(bank_id));
create policy "lessons: editors change" on public.bank_lessons
  for update to authenticated
  using (public.can_edit_bank(bank_id))
  with check (public.can_edit_bank(bank_id));
create policy "lessons: editors remove" on public.bank_lessons
  for delete to authenticated using (public.can_edit_bank(bank_id));

create function public.touch_bank_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger bank_lessons_touch before insert or update on public.bank_lessons
  for each row execute function public.touch_bank_lesson();

-- invites: the owner manages them; the invited person can see and decline theirs
create policy "invites: owner and invitee read" on public.bank_invites
  for select to authenticated
  using (public.owns_bank(bank_id) or email = lower((select auth.jwt()) ->> 'email'));
create policy "invites: owner creates" on public.bank_invites
  for insert to authenticated with check (public.owns_bank(bank_id));
create policy "invites: owner cancels or invitee declines" on public.bank_invites
  for delete to authenticated
  using (public.owns_bank(bank_id) or email = lower((select auth.jwt()) ->> 'email'));

-- ---------------------------------------------------------------- invitations

-- Turn invitations for the signed-in teacher's email into memberships.
-- Returns how many banks were joined.
create function public.accept_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_email text := lower((select auth.jwt()) ->> 'email');
  joined integer;
begin
  if auth.uid() is null or my_email is null then
    return 0;
  end if;
  with accepted as (
    delete from public.bank_invites i
    where i.email = my_email
    returning i.bank_id, i.role
  ), added as (
    insert into public.bank_members (bank_id, user_id, role)
    select a.bank_id, auth.uid(), a.role
    from accepted a
    join public.banks b on b.id = a.bank_id
    where b.owner_id <> auth.uid()
    on conflict (bank_id, user_id) do update set role = excluded.role
    returning 1
  )
  select count(*) into joined from added;
  return joined;
end;
$$;

-- Invite a teacher by email: adds them right away if they already have an
-- account, otherwise leaves an invitation for when they sign up.
create function public.invite_to_bank(p_bank text, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  clean_email text := lower(trim(p_email));
begin
  if not public.owns_bank(p_bank) then
    raise exception 'Only the owner can invite people to this bank';
  end if;
  if p_role not in ('view', 'edit') then
    raise exception 'Role must be view or edit';
  end if;
  select id into target from auth.users where lower(email) = clean_email;
  if target is not null then
    if target = auth.uid() then
      raise exception 'You already own this bank';
    end if;
    insert into public.bank_members (bank_id, user_id, role)
    values (p_bank, target, p_role)
    on conflict (bank_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into public.bank_invites (bank_id, email, role)
  values (p_bank, clean_email, p_role)
  on conflict (bank_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

-- Callable by signed-in teachers only.
revoke execute on function public.accept_invites() from public, anon;
revoke execute on function public.invite_to_bank(text, text, text) from public, anon;
grant execute on function public.accept_invites() to authenticated;
grant execute on function public.invite_to_bank(text, text, text) to authenticated;

-- Live updates for teammates' changes.
alter publication supabase_realtime add table public.banks, public.bank_lessons, public.bank_members;
