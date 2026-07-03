-- Fix toggle_consider to return the correct action.
-- Previously, if the user already had an 'attending' RSVP, the function would
-- return action='removed' even though nothing was deleted. This caused the
-- client-side Consider UI to report success when in fact no change occurred.
-- Now the RPC distinguishes between 'added', 'removed', and 'noop'.

create or replace function public.toggle_consider(
  p_user_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_existing_id uuid;
  v_existing_status text;
  v_deleted int;
begin
  select id, status
    into v_existing_id, v_existing_status
  from public.rsvps
  where user_id = p_user_id and event_id = p_event_id;

  if v_existing_id is null then
    -- No RSVP exists — insert as considering
    insert into public.rsvps (user_id, event_id, status)
    values (p_user_id, p_event_id, 'considering');
    return jsonb_build_object('success', true, 'action', 'added');
  end if;

  if v_existing_status = 'considering' then
    delete from public.rsvps
    where id = v_existing_id and status = 'considering';
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then
      return jsonb_build_object('success', true, 'action', 'removed');
    end if;
  end if;

  -- User is already attending (or other non-considering status) —
  -- leave the attending RSVP alone and report no-op so the client
  -- can surface a helpful message.
  return jsonb_build_object(
    'success', true,
    'action', 'noop',
    'reason', 'already_' || coalesce(v_existing_status, 'rsvp')
  );
end;
$$;
