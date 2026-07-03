-- 071 — FEAT-05 polish: add event_updates to supabase_realtime publication.
--
-- Why: The EventUpdatesList viewer on /events/[id] subscribes to
-- postgres_changes for new and deleted updates so the audience sees an
-- organiser's announcement appear / disappear without a page refresh.
-- Without the publication membership the WebSocket fan-out silently drops
-- those events (no error surfaced to the client).
--
-- This is idempotent — re-running the migration on a project that already
-- has the table in the publication is a no-op.
--
-- Note: migration 030 (event_updates table + RLS) was previously authored
-- locally but never applied to the remote project; it has now been applied
-- alongside this one. Future cold-deploys will run 030 then 071 in order.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_updates'
  ) then
    alter publication supabase_realtime add table public.event_updates;
  end if;
end $$;

comment on table public.event_updates is
  'Short organiser-authored updates for an event. New rows trigger notifications to RSVPed/considering users via Edge Function; also broadcast via supabase_realtime so subscribed viewers update without refresh.';
