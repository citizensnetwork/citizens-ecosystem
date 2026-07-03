-- Migration 124: Enable pg_net for scheduled edge-function invocation
-- ============================================================================
-- The weekly contributor-digest cron (migration 125) issues an outbound HTTP
-- POST from Postgres to the `send-contributor-digest` edge function. That call
-- is made with `net.http_post`, which is provided by the pg_net extension.
--
-- pg_net installs into the `public` schema on this project because the
-- extension does not support SET SCHEMA (it is non-relocatable and always
-- exposes its API via the `net` schema). The resulting `extension_in_public`
-- advisory is therefore an accepted, known low-severity exception.
-- ============================================================================

create extension if not exists pg_net;
