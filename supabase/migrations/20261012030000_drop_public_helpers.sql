-- Remove the old public copies of the access helpers (the policies use the
-- private.* versions). Optional tidy-up: the copies are already unused and
-- uncallable. Run this in the Supabase SQL Editor — it needs a confirmation
-- the Claude connector can't show from a cloud session.
drop function if exists public.can_view_bank(text);
drop function if exists public.can_edit_bank(text);
drop function if exists public.owns_bank(text);
drop function if exists public.shares_a_bank_with(uuid);
drop function if exists public.bank_role(text);
