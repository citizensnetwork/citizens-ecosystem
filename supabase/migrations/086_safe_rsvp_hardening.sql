-- ============================================================================
-- 086_safe_rsvp_hardening.sql
--
-- Closes an authenticated IDOR in `public.safe_rsvp(p_user_id, p_event_id)`:
--   - adds an `auth.uid() = p_user_id` guard so callers cannot RSVP other users
--   - sets `search_path` to prevent function-search-path hijacking
--   - revokes EXECUTE from `public`, grants EXECUTE to `authenticated`
--
-- Mirrors the `toggle_consider` hardening pattern from migration 070.
-- ============================================================================

create or replace function public.safe_rsvp(p_user_id uuid, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_max int;
  v_current int;
  v_remaining int;
begin
  -- Authorisation: only the authenticated caller may RSVP themselves.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Lock the event row to prevent concurrent capacity checks.
  select status, max_attendees into v_status, v_max
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Event not found', 'status', 404);
  end if;

  if v_status <> 'published' then
    return jsonb_build_object('success', false, 'error',
      'Cannot RSVP to a ' || v_status || ' event', 'status', 400);
  end if;

  if v_max is not null then
    select count(*)::int into v_current
    from public.rsvps
    where event_id = p_event_id;

    if v_current >= v_max then
      return jsonb_build_object('success', false, 'error', 'Event is full',
        'remaining', 0, 'status', 409);
    end if;

    v_remaining := v_max - v_current - 1;
  else
    v_remaining := null;
  end if;

  begin
    insert into public.rsvps (user_id, event_id)
    values (p_user_id, p_event_id);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error',
      'Already RSVPed to this event', 'status', 409);
  end;

  return jsonb_build_object('success', true, 'remaining', v_remaining, 'status', 201);
end;
$$;

revoke all on function public.safe_rsvp(uuid, uuid) from public;
grant execute on function public.safe_rsvp(uuid, uuid) to authenticated;
