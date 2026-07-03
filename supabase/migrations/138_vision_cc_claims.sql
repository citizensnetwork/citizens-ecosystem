-- ============================================================================
-- Migration 138: Vision ↔ Connect claim/promote re-model (replaces cc_*_mirror CV cols)
-- ============================================================================
-- Ecosystem step 2 (scope §2 + §10 step 2). The dropped cc_events_mirror /
-- cc_places_mirror carried Vision "enrichment" columns (cv_org_id, cv_project_id,
-- cv_activity_id) written by the "claim → link → promote to activity" workflow
-- (Vision ARCHITECTURE §7.3). With the mirrors gone, Connect events/places are read
-- live via /api/v1 (and Connect's tables must NOT be annotated by Vision —
-- SHARED_DB_CONTRACT R1.2/R4.4). The claim linkage therefore needs a Vision-owned home.
--
-- Design:
--   * vision.cc_event_claims — one claim per Connect event (keyed by cc_event_id),
--     binding it to a Vision org (+ optional project/activity).
--   * vision.cc_place_claims — one claim per Connect place (keyed by cc_place_id),
--     binding it to a Vision org.
--   * cc_event_id / cc_place_id are *value* references to public.events.id /
--     public.places.id — NO cross-schema FK (exit-ramp rule: never weld schemas).
--   * cv_* columns FK into vision.* (intra-schema, safe).
--
-- Security: operational tables → authenticated + RLS (gates rows) + service_role.
-- A row exists only when an org has claimed the event/place; "unclaimed" Connect
-- events are simply those with no claim row (read directly via /api/v1).
-- ============================================================================

SET search_path = vision, public, pg_catalog;

-- ── updated_at guard (reuse vision.update_updated_at_column from mig 137) ──

-- ============================================================================
-- 1. cc_event_claims
-- ============================================================================
CREATE TABLE vision.cc_event_claims (
  cc_event_id    UUID PRIMARY KEY,                       -- = public.events.id (by value; no FK)
  cv_org_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  cv_project_id  UUID REFERENCES vision.projects(id) ON DELETE SET NULL,
  cv_activity_id UUID REFERENCES vision.activities(id) ON DELETE SET NULL,
  claimed_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_event_claims_org ON vision.cc_event_claims(cv_org_id);
CREATE INDEX idx_cc_event_claims_project ON vision.cc_event_claims(cv_project_id);
CREATE INDEX idx_cc_event_claims_activity ON vision.cc_event_claims(cv_activity_id);

ALTER TABLE vision.cc_event_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_event_claims_select ON vision.cc_event_claims FOR SELECT
  USING (vision.is_org_member(cv_org_id) OR vision.is_platform_admin());
CREATE POLICY cc_event_claims_insert ON vision.cc_event_claims FOR INSERT TO authenticated
  WITH CHECK (
    claimed_by = auth.uid()
    AND (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin()));
CREATE POLICY cc_event_claims_update ON vision.cc_event_claims FOR UPDATE
  USING (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin())
  WITH CHECK (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());
CREATE POLICY cc_event_claims_delete ON vision.cc_event_claims FOR DELETE
  USING (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());

CREATE TRIGGER set_cc_event_claims_updated_at BEFORE UPDATE ON vision.cc_event_claims
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();

-- ============================================================================
-- 2. cc_place_claims
-- ============================================================================
CREATE TABLE vision.cc_place_claims (
  cc_place_id UUID PRIMARY KEY,                          -- = public.places.id (by value; no FK)
  cv_org_id   UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  claimed_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_place_claims_org ON vision.cc_place_claims(cv_org_id);

ALTER TABLE vision.cc_place_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_place_claims_select ON vision.cc_place_claims FOR SELECT
  USING (vision.is_org_member(cv_org_id) OR vision.is_platform_admin());
CREATE POLICY cc_place_claims_insert ON vision.cc_place_claims FOR INSERT TO authenticated
  WITH CHECK (
    claimed_by = auth.uid()
    AND (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin()));
CREATE POLICY cc_place_claims_update ON vision.cc_place_claims FOR UPDATE
  USING (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin())
  WITH CHECK (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());
CREATE POLICY cc_place_claims_delete ON vision.cc_place_claims FOR DELETE
  USING (vision.get_user_org_role(cv_org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());

CREATE TRIGGER set_cc_place_claims_updated_at BEFORE UPDATE ON vision.cc_place_claims
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();

-- ============================================================================
-- 3. Grants — operational tables to authenticated (RLS gates) + service_role
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON vision.cc_event_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vision.cc_place_claims TO authenticated;
GRANT ALL ON vision.cc_event_claims TO service_role;
GRANT ALL ON vision.cc_place_claims TO service_role;
