-- Hardening after Supabase's security and performance advisors.
--
-- 1. Move the access-check helpers to a schema the API doesn't expose:
--    policies still use them, but they can't be called via /rest/v1/rpc/*.
-- 2. The sign-up trigger function can't be called directly.
-- 3. Indexes for foreign keys and invitation lookups.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.bank_role(p_bank text)
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

create function private.can_view_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.bank_role(p_bank) is not null; $$;

create function private.can_edit_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.bank_role(p_bank) in ('owner', 'edit'); $$;

create function private.owns_bank(p_bank text)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.bank_role(p_bank) = 'owner'; $$;

create function private.shares_a_bank_with(p_user uuid)
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

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Point every policy at the private helpers.
alter policy "profiles: read own and teammates" on public.profiles
  using (id = (select auth.uid()) or private.shares_a_bank_with(id));
alter policy "banks: members read" on public.banks using (private.can_view_bank(id));
alter policy "banks: editors update" on public.banks
  using (private.can_edit_bank(id)) with check (private.can_edit_bank(id));
alter policy "members: bank members read" on public.bank_members using (private.can_view_bank(bank_id));
alter policy "members: owner adds" on public.bank_members with check (private.owns_bank(bank_id));
alter policy "members: owner changes roles" on public.bank_members
  using (private.owns_bank(bank_id)) with check (private.owns_bank(bank_id));
alter policy "members: owner removes, or leave yourself" on public.bank_members
  using (private.owns_bank(bank_id) or user_id = (select auth.uid()));
alter policy "lessons: members read" on public.bank_lessons using (private.can_view_bank(bank_id));
alter policy "lessons: editors add" on public.bank_lessons with check (private.can_edit_bank(bank_id));
alter policy "lessons: editors change" on public.bank_lessons
  using (private.can_edit_bank(bank_id)) with check (private.can_edit_bank(bank_id));
alter policy "lessons: editors remove" on public.bank_lessons using (private.can_edit_bank(bank_id));
alter policy "invites: owner and invitee read" on public.bank_invites
  using (private.owns_bank(bank_id) or email = lower((select auth.jwt()) ->> 'email'));
alter policy "invites: owner creates" on public.bank_invites with check (private.owns_bank(bank_id));
alter policy "invites: owner cancels or invitee declines" on public.bank_invites
  using (private.owns_bank(bank_id) or email = lower((select auth.jwt()) ->> 'email'));

-- invite_to_bank used the public helper; switch it to the private one.
create or replace function public.invite_to_bank(p_bank text, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  clean_email text := lower(trim(p_email));
begin
  if not private.owns_bank(p_bank) then
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

-- The old public helpers are no longer used by any policy; nobody may call
-- them. (They're removed in the follow-up migration *_drop_public_helpers.)
revoke execute on function public.bank_role(text), public.can_view_bank(text), public.can_edit_bank(text),
  public.owns_bank(text), public.shares_a_bank_with(uuid) from public, anon, authenticated;

-- Trigger functions run automatically; nobody needs to call them directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_bank_owner() from public, anon, authenticated;
revoke execute on function public.touch_bank_lesson() from public, anon, authenticated;

-- Indexes for foreign keys and lookups by email.
create index if not exists banks_owner_idx on public.banks (owner_id);
create index if not exists bank_lessons_updated_by_idx on public.bank_lessons (updated_by);
create index if not exists bank_invites_invited_by_idx on public.bank_invites (invited_by);
create index if not exists bank_invites_email_idx on public.bank_invites (email);
