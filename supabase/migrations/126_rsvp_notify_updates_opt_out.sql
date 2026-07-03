-- 126_rsvp_notify_updates_opt_out.sql
--
-- Per-event notification opt-out for RSVP'd / considering users.
--
-- Product decision (docs/feature-clarity/notifications.md, "Preference Model"):
--   "Event level: follower/RSVP/considering user can mute or reduce
--    notifications for a specific event."
--
-- A user who has an rsvps row (attending OR considering) can mute event
-- updates + organiser broadcasts for that single event without un-RSVPing.
-- Default is opted-IN (notify_updates = true) so existing behaviour is
-- unchanged for every current row.

alter table public.rsvps
  add column if not exists notify_updates boolean not null default true;

comment on column public.rsvps.notify_updates is
  'Per-event notification opt-in. When false, the user is excluded from event-update and broadcast fan-out for this event while remaining RSVPed/considering.';

-- Partial index: fan-out queries only ever care about the opted-OUT minority,
-- so index just those rows to keep the muted-set lookup cheap.
create index if not exists rsvps_notify_updates_muted_idx
  on public.rsvps(event_id)
  where notify_updates = false;

-- Dedicated SECURITY DEFINER setter. We deliberately do NOT open a broad
-- UPDATE policy on rsvps: a column-blind UPDATE policy would also let a user
-- flip `status` (considering <-> attending) and bypass the capacity checks
-- enforced by safe_rsvp/toggle_consider. This RPC mutates only notify_updates
-- on the caller's own row.
create or replace function public.set_rsvp_notify_updates(
  p_event_id uuid,
  p_notify boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_event_id is null or p_notify is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  update public.rsvps
    set notify_updates = p_notify
    where user_id = v_uid
      and event_id = p_event_id;

  get diagnostics v_rows = row_count;
  -- No rsvps row => caller is not attending/considering this event.
  return v_rows > 0;
end;
$$;

revoke all on function public.set_rsvp_notify_updates(uuid, boolean) from public, anon;
grant execute on function public.set_rsvp_notify_updates(uuid, boolean) to authenticated;

comment on function public.set_rsvp_notify_updates(uuid, boolean) is
  'Sets rsvps.notify_updates for the caller''s own RSVP on the given event. Returns true when a row was updated (caller is attending/considering), false otherwise.';
