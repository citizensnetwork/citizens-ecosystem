-- 059 — DB-level enforcement that at least one admin always exists.
--
-- Batch E hardening after audit finding: the JS-layer last-admin guard
-- in PATCH /api/admin/users was TOCTOU-racy under concurrent demotion.
-- This trigger enforces the invariant at the database level so the
-- race window is closed regardless of caller.
--
-- Fires BEFORE UPDATE OF role or BEFORE DELETE on profiles. If the
-- change would leave zero admins, raises exception P0001 with a
-- friendly message. The API layer still performs the preflight check
-- so it can return a clean 400; this trigger is the last line of
-- defense.

create or replace function public.enforce_at_least_one_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  -- Count admins other than this row (the transition hasn't committed
  -- yet). We rely on the row-level lock the caller already holds via
  -- UPDATE/DELETE to avoid counting our own pre-image twice.
  if tg_op = 'UPDATE' then
    if old.role = 'admin' and (new.role is distinct from 'admin') then
      select count(*) into remaining
      from public.profiles
      where role = 'admin' and id <> old.id;
      if remaining = 0 then
        raise exception 'Cannot remove the last admin.'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.role = 'admin' then
      select count(*) into remaining
      from public.profiles
      where role = 'admin' and id <> old.id;
      if remaining = 0 then
        raise exception 'Cannot remove the last admin.'
          using errcode = 'P0001';
      end if;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_enforce_one_admin_update on public.profiles;
create trigger trg_enforce_one_admin_update
  before update of role on public.profiles
  for each row
  execute function public.enforce_at_least_one_admin();

drop trigger if exists trg_enforce_one_admin_delete on public.profiles;
create trigger trg_enforce_one_admin_delete
  before delete on public.profiles
  for each row
  execute function public.enforce_at_least_one_admin();

comment on function public.enforce_at_least_one_admin is
  'Batch E hardening: prevents UPDATE/DELETE from reducing the admin count to zero.';
