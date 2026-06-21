-- 142_vision_org_connect_link.sql
-- Ecosystem Step 2 (app half): link a Vision organisation to its Citizens Connect
-- contributor identity.
--
-- Vision's /api/connect reads scope Connect's /api/v1 feed (events, places) by the
-- org's linked contributor. We store the contributor as a plain value reference to
-- public.profiles.id with NO cross-schema FK, consistent with migration 138's
-- exit-ramp design (vision.* must remain splittable from public.*).
--
-- The existing `organisations_update_admin` RLS policy already lets org admins UPDATE
-- their org row, which covers setting this column (via POST /api/connect/link). No
-- new policy required.

alter table vision.organisations
  add column if not exists connect_contributor_id uuid;

comment on column vision.organisations.connect_contributor_id is
  'Citizens Connect contributor (public.profiles.id) this org represents. Value reference only — no FK. Set by org admins via /api/connect/link; scopes the Connect /api/v1 feed surfaced in Vision.';

create index if not exists organisations_connect_contributor_id_idx
  on vision.organisations (connect_contributor_id)
  where connect_contributor_id is not null;
