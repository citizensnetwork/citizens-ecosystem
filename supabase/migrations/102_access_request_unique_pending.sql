-- 102_access_request_unique_pending.sql
--
-- Race-fix follow-up to migration 100. The POST handler on
-- /api/contributor/[handle]/access-requests checks for an existing
-- pending row before inserting; under concurrent submission the two
-- requests can both pass the check and both insert, producing duplicate
-- notifications and confusing UI state. Enforce single active pending
-- row per (contributor, admin) at the database layer so the race
-- collapses to a 23505 unique violation the API can translate into the
-- existing 409 response.

CREATE UNIQUE INDEX IF NOT EXISTS
  contributor_access_requests_pending_unique
  ON public.contributor_access_requests (contributor_id, admin_id)
  WHERE status = 'pending' AND revoked_at IS NULL;
