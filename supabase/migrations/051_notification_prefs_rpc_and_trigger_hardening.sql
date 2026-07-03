-- 051_notification_prefs_rpc_and_trigger_hardening.sql
--
-- Follow-up to migrations 049 + 050, applying Architect audit fixes:
--
--   * H1: atomic jsonb merge for notification_prefs via RPC
--          (removes read-then-write race in the PATCH endpoint).
--   * H2: trigger credits the actual editor via auth.uid(), falling back
--          to events.created_by for service-role/cron writes.
--   * M2: pg_catalog included in the trigger's search_path so built-in
--          functions can't be shadowed.
--   * M3: don't fire a "field changed" notification when an event is being
--          un-cancelled (cancelled -> published) — surface that via a
--          dedicated flow rather than a misleading partial message.

-- ----------------------------------------------------------------------
-- RPC: update_notification_prefs(delta jsonb)
--
-- Atomically merges the supplied delta into the caller's prefs using
-- jsonb `||`. Missing rows fall back to the defaults from migration 049.
-- SECURITY INVOKER (the default) so RLS policies apply normally; the
-- caller can only touch their own row via the auth.uid() filter.
-- ----------------------------------------------------------------------
create or replace function public.update_notification_prefs(delta jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  allowed_keys text[] := array[
    'friends_activity',
    'event_reminders',
    'contributor_updates',
    'announcements',
    'weekly_digest'
  ];
  k text;
  v jsonb;
  sanitized jsonb := '{}'::jsonb;
  uid uuid := auth.uid();
  merged jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(delta) is distinct from 'object' then
    raise exception 'delta must be a jsonb object' using errcode = '22023';
  end if;

  -- Whitelist keys and require boolean values. Any violation rejects the
  -- entire patch so callers see a clear 400 rather than a silent no-op.
  for k, v in select key, value from jsonb_each(delta) loop
    if not (k = any(allowed_keys)) then
      raise exception 'unknown preference key: %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) is distinct from 'boolean' then
      raise exception 'preference % must be boolean', k using errcode = '22023';
    end if;
    sanitized := sanitized || jsonb_build_object(k, v);
  end loop;

  update public.profiles
     set notification_prefs = coalesce(notification_prefs, jsonb_build_object(
            'friends_activity',    true,
            'event_reminders',     true,
            'contributor_updates', true,
            'announcements',       true,
            'weekly_digest',       true
          )) || sanitized
   where id = uid
  returning notification_prefs into merged;

  if merged is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  return merged;
end;
$$;

grant execute on function public.update_notification_prefs(jsonb) to authenticated;

comment on function public.update_notification_prefs(jsonb) is
  'Atomic jsonb merge of notification_prefs for auth.uid(). Whitelists keys and requires boolean values.';

-- ----------------------------------------------------------------------
-- Trigger fn: hardened search_path, proper author attribution, skip the
-- cancelled -> published un-cancel transition.
-- ----------------------------------------------------------------------
create or replace function public.notify_event_field_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parts text[] := array[]::text[];
  msg text;
  actor uuid;
begin
  -- Only care about currently-published events.
  if coalesce(new.status, '') <> 'published' then
    return new;
  end if;
  -- Don't fire on un-cancel / un-draft transitions — those deserve their
  -- own message rather than a misleading field-change notice.
  if coalesce(old.status, '') <> 'published' then
    return new;
  end if;

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
    if not ('venue' = any(parts)) then
      parts := array_append(parts, 'location');
    end if;
  end if;

  if array_length(parts, 1) is null then
    return new;
  end if;

  msg := 'Organiser updated the ' || array_to_string(parts, ', ') || '.';

  -- Attribute the auto-post to whoever actually made the edit. auth.uid()
  -- is null for service-role writes and background jobs — fall back to
  -- the organiser in that case so the row stays non-null.
  actor := coalesce(auth.uid(), new.created_by);

  insert into public.event_updates (event_id, author_id, body)
  values (new.id, actor, msg);

  return new;
end;
$$;
