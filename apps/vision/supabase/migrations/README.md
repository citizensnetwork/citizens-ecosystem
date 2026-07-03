# ⚠️ ARCHIVED — these migrations are historical and are NO LONGER APPLIED

As of the 2026-06 ecosystem consolidation, Citizens Vision runs inside the **shared
Citizens Supabase project** under the `vision` schema. The authoritative migration
lineage for everything Vision now lives in the **citizens-connect** repo
(`citizens-connect/supabase/migrations/`), beginning with the consolidated port:

- `137_vision_schema_port.sql` — Vision's tables/functions/RLS ported into `vision.*`
- `138_vision_cc_claims.sql` — `vision.cc_event_claims` / `vision.cc_place_claims`
- `139_vision_ratings_views.sql` — Connect-published rating views
- `142_vision_org_connect_link.sql` — `vision.organisations.connect_contributor_id`

The `.sql` files in this folder built the **old standalone `citizens-vision` Supabase
project** (separate DB, `public.*` schema, `cc_*_mirror` sync tables). They are retained
for history only. **Do not apply them** against the shared project, and do not add new
migrations here — add them to the citizens-connect lineage instead.
