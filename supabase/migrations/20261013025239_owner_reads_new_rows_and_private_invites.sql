-- 1. Sharing a bank or school sends `insert … on conflict` / `insert …
--    returning`, and Postgres checks the read policy against the new row.
--    The membership helpers look the id up in the table, where the new row
--    isn't visible yet, so the check failed and nothing could be shared.
--    The owner may always read their own row.
alter policy "banks: members read" on public.banks
  using (owner_id = (select auth.uid()) or private.can_view_bank(id));
alter policy "schools: members read" on public.schools
  using (owner_id = (select auth.uid()) or private.school_role(id) is not null);

-- 2. Inviting no longer tells the owner whether an email has an account:
--    everyone gets an invitation, which accept_invites() turns into a
--    membership the next time that teacher's planner syncs. Changing the role
--    of someone already in the bank still works directly.
create or replace function public.invite_to_bank(p_bank text, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(p_email));
  target uuid;
begin
  if not private.owns_bank(p_bank) then
    raise exception 'Only the owner can invite people to this bank';
  end if;
  if p_role not in ('view', 'edit') then
    raise exception 'Role must be view or edit';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'That doesn’t look like an email address';
  end if;
  if clean_email = lower((select auth.jwt()) ->> 'email') then
    raise exception 'You already own this bank';
  end if;
  select m.user_id into target
  from public.bank_members m join auth.users u on u.id = m.user_id
  where m.bank_id = p_bank and lower(u.email) = clean_email;
  if target is not null then
    update public.bank_members set role = p_role where bank_id = p_bank and user_id = target;
    return 'updated';
  end if;
  insert into public.bank_invites (bank_id, email, role)
  values (p_bank, clean_email, p_role)
  on conflict (bank_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;
