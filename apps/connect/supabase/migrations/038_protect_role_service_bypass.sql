-- 038_protect_role_service_bypass.sql
--
-- Phase 12 follow-up.
--
-- The email deep-link approve path in the `review-contributor-application`
-- Edge Function must operate as `service_role` (the approving admin's
-- JWT is not present when they click the link from their inbox).
-- Without the bypass below, `protect_role_column()` rejects the
-- `citizen -> contributor` role change and the `pending -> approved`
-- contributor_status change — so every admin clicking "Approve" in
-- email would get a 500.
--
-- We add an explicit service_role bypass. Postgres sets the session
-- role to `service_role` for every request signed with the Supabase
-- service-role key, so `current_user = 'service_role'` (or `session_user`)
-- is the canonical check.
--
-- The `is_admin()` bypass for authenticated admin JWTs stays unchanged;
-- this is purely additive. RLS still gates who can reach these rows,
-- and the Edge Function HMAC-verifies the approve/reject intent before
-- calling the service-role client.

begin;

create or replace function public.protect_role_column()
returns trigger as $$
begin
  -- Service-role bypass. The Edge Function's HMAC-verified email
  -- deep-link flow connects as service_role, which has no `auth.uid()`
  -- and would otherwise be rejected below.  This connection is only
  -- reachable via the service-role key (never client-exposed).
  if current_user = 'service_role' or session_user = 'service_role' then
    return new;
  end if;

  -- Admin bypass for both role and contributor_status.
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins may change role. Use the contributor application flow.';
  end if;

  -- Users may transition not_applied → pending (by submitting their
  -- own application via the RLS-allowed insert into
  -- contributor_applications, which is followed by a same-user update
  -- to profiles.contributor_status in the API route). All other
  -- transitions must go through the RPCs.
  if new.contributor_status is distinct from old.contributor_status then
    if not (
      old.contributor_status = 'not_applied' and new.contributor_status = 'pending'
      or old.contributor_status = 'rejected' and new.contributor_status = 'pending'
    ) then
      raise exception 'contributor_status transition % -> % is not allowed.',
        old.contributor_status, new.contributor_status;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

commit;
