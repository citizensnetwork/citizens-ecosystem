-- 050_event_field_change_notify.sql
--
-- Automatically notify RSVPs when an organiser edits a published event's
-- core logistical fields (date, end_time, location, latitude, longitude).
--
-- Strategy: reuse the existing `event_updates` table + `notify-event-update`
-- Edge Function webhook rather than adding a second notification path.
-- The trigger appends a synthetic `event_updates` row describing which
-- field changed; the existing webhook picks it up and pushes to all
-- RSVPed + considering users via `sendNotifications`.
--
-- Only fires for events already `published` (drafts can mutate freely)
-- and only when the listed fields actually change. A single update to
-- multiple fields produces one combined message, not several.

create or replace function public.notify_event_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text[] := array[]::text[];
  msg text;
begin
  -- Only care about published events. Status-change cancellations are
  -- handled by `notify-event-cancelled`.
  if coalesce(new.status, '') <> 'published' then
    return new;
  end if;

  -- Compare individual fields. `is distinct from` handles NULL safely.
  if new.date is distinct from old.date then
    parts := array_append(parts, 'date');
  end if;
  if new.end_time is distinct from old.end_time then
    parts := array_append(parts, 'end time');
  end if;
  if new.location is distinct from old.location then
    parts := array_append(parts, 'venue');
  end if;
  if new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude then
    -- Don't double-announce if venue string also changed.
    if not ('venue' = any(parts)) then
      parts := array_append(parts, 'location');
    end if;
  end if;

  if array_length(parts, 1) is null then
    return new;
  end if;

  msg := 'Organiser updated the ' || array_to_string(parts, ', ') || '.';

  -- Insert as the organiser so RLS/author_id logic stays consistent.
  insert into public.event_updates (event_id, author_id, body)
  values (new.id, new.created_by, msg);

  return new;
end;
$$;

drop trigger if exists trg_notify_event_field_changes on public.events;

create trigger trg_notify_event_field_changes
  after update of date, end_time, location, latitude, longitude
  on public.events
  for each row
  execute function public.notify_event_field_changes();

comment on function public.notify_event_field_changes() is
  'Appends an event_updates row whenever a published events row changes date/end_time/location/coords, re-using the event-update notification webhook path.';
