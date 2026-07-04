-- =========================================================================
-- 074 — event_updates REPLICA IDENTITY FULL
-- =========================================================================
-- The Phase E / Batch 5 viewer (`EventUpdatesList`) subscribes to
-- realtime DELETE events with a `filter: event_id=eq.<id>` clause.
-- Supabase only evaluates DELETE filters server-side when the table's
-- replica identity exposes the filtered column to the WAL — default
-- replica identity only carries the primary key. As a result every
-- DELETE was streamed to every viewer of every event and filtered in
-- JS. Correctness was preserved (unmatched ids no-op) but bandwidth
-- scaled with the global broadcast volume.
--
-- Switching to REPLICA IDENTITY FULL writes all columns of the old row
-- into WAL on UPDATE/DELETE, which lets the realtime filter run
-- server-side. Cost: marginally larger WAL volume. `event_updates`
-- rows are 1000-char body + a few uuids/timestamps — negligible.
-- =========================================================================

alter table public.event_updates replica identity full;
