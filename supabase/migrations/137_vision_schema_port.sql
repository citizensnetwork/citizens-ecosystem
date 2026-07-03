-- ============================================================================
-- Migration 137: Citizens Vision schema port into the shared project's `vision.*`
-- ============================================================================
-- Ecosystem step 2 (docs/strategy/ECOSYSTEM_DECISION_BRIEF.md §6 order 2;
-- docs/SHARED_DB_CONTRACT.md R1/R3/R7). Consolidates Citizens Vision's 21
-- standalone `public.*` migrations (citizens-vision/supabase/migrations/001..021)
-- into the shared project's `vision` schema, as the single source of truth.
--
-- WHAT THIS IS:
--   * The END STATE of Vision's owned schema (supersessions already folded in:
--     005 funcs over 004; 007 org SELECT policy over 001; 013 hierarchy columns;
--     014 user_org_roles INSERT split + goal_links SELECT helper; 018 tree-read
--     policies). 22 owned tables + 2 enums + 5 materialized views + ~27 functions
--     + RLS + triggers + advisory seed + a (non-fatal) platform-admin bootstrap.
--
-- WHAT THIS IS NOT:
--   * No cc_* mirror/sync (cc_events_mirror, cc_places_mirror, cc_profiles_mirror,
--     cc_sync_log, cc_sync_cursors, advance_cc_sync_cursor) — obsoleted by /api/v1
--     + the existing vision.* aggregate views. The claim->promote re-model lands in
--     138_vision_cc_claims.sql; the avg_rating signal in 139_vision_ratings_views.sql.
--   * No row data (founder decision Q1: seed/dev only; zero rows migrated). The
--     standalone dev seed.sql is intentionally not ported (its created_by FK points
--     at a non-existent auth.users id).
--
-- SECURITY MODEL (refines the contract for Vision's *operational* tables):
--   * Vision's 22 operational tables are user-facing back-office data read/written by
--     authenticated Vision users (org admins/members) under RLS — GRANTed to
--     `authenticated` (RLS gates rows) + `service_role` (backend jobs). This mirrors
--     how they ran in the standalone Vision project (anon key + authenticated role + RLS).
--   * Materialized views bypass RLS, so they are GRANTed to `service_role` ONLY; end
--     users read them through SECURITY DEFINER reader functions with membership checks.
--   * The pre-existing vision.* objects (category_space_map, vision_period_snapshots,
--     reach_per_event, engagement_per_event from mig 133-134) remain service_role-only
--     Connect->Vision aggregates and are untouched here.
--   NOTE: the `vision` schema must also be added to the project's PostgREST "Exposed
--   schemas" for the Vision app to reach these via the API as `authenticated` — that is
--   a project API-settings toggle done during the app repoint, not a migration.
--
-- PLACEMENT: all objects are schema-qualified `vision.*`; a vision-first search_path is
-- set so unqualified references inside view/policy/function bodies bind to `vision.*`.
-- Verified: none of Vision's 22 table names collide with any existing schema in this
-- project. Extensions (pg_trgm, pgcrypto) live in `extensions`; pg_cron in pg_catalog.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS vision;

GRANT USAGE ON SCHEMA vision TO authenticated, service_role;

-- Bind unqualified identifiers in this migration to vision first, then the
-- extension/op schemas, then catalog. Every function below also pins its own
-- search_path so runtime body resolution never depends on the caller's path.
SET search_path = vision, extensions, public, pg_catalog;

-- ============================================================================
-- 0. ENUM TYPES (Vision federation — mig 012)
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE vision.partnership_status AS ENUM ('pending', 'active', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vision.sharing_level AS ENUM ('none', 'summary', 'detailed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. updated_at helper (mig 001) — defined before tables/triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION vision.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = vision, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. TABLES (created before SQL-language functions that reference them)
-- ============================================================================

-- 2.1 organisations (mig 001 + 013 hierarchy columns)
CREATE TABLE vision.organisations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  logo_url      TEXT,
  parent_org_id UUID REFERENCES vision.organisations(id) ON DELETE SET NULL,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organisations_no_self_parent CHECK (parent_org_id IS NULL OR parent_org_id <> id)
);
CREATE INDEX idx_organisations_slug ON vision.organisations(slug);
CREATE INDEX idx_organisations_created_by ON vision.organisations(created_by);
CREATE INDEX idx_organisations_parent_org_id ON vision.organisations(parent_org_id);

-- 2.2 departments (mig 001)
CREATE TABLE vision.departments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  parent_department_id UUID REFERENCES vision.departments(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_departments_org_id ON vision.departments(org_id);
CREATE INDEX idx_departments_parent ON vision.departments(parent_department_id);

-- 2.3 user_org_roles (mig 001 + 013 title/is_founder)
CREATE TABLE vision.user_org_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN (
                  'platform_admin', 'org_admin', 'org_manager', 'org_member', 'org_viewer')),
  department_id UUID REFERENCES vision.departments(id) ON DELETE SET NULL,
  title         TEXT,
  is_founder    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
CREATE INDEX idx_user_org_roles_user_id ON vision.user_org_roles(user_id);
CREATE INDEX idx_user_org_roles_org_id ON vision.user_org_roles(org_id);
CREATE INDEX idx_user_org_roles_department ON vision.user_org_roles(department_id);
CREATE INDEX idx_user_org_roles_is_founder ON vision.user_org_roles(is_founder) WHERE is_founder = true;

-- 2.4 activities (mig 002)
CREATE TABLE vision.activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES vision.departments(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL CHECK (type IN (
                      'event', 'meeting', 'outreach', 'workshop', 'service', 'training', 'other')),
  date              DATE NOT NULL,
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  location_name     TEXT,
  participant_count INTEGER NOT NULL DEFAULT 0,
  source_type       TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (
                      'manual', 'citizens_connect', 'bulk_import', 'api')),
  source_id         TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_org_date ON vision.activities(org_id, date);
CREATE INDEX idx_activities_department ON vision.activities(department_id);
CREATE INDEX idx_activities_source ON vision.activities(source_type, source_id);
CREATE INDEX idx_activities_created_by ON vision.activities(created_by);
CREATE INDEX idx_activities_type ON vision.activities(org_id, type);
CREATE INDEX idx_activities_geo ON vision.activities (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_activities_title_trgm ON vision.activities USING gin (title extensions.gin_trgm_ops);
CREATE INDEX idx_activities_description_trgm ON vision.activities USING gin (description extensions.gin_trgm_ops)
  WHERE description IS NOT NULL;

-- 2.5 activity_tags (mig 002)
CREATE TABLE vision.activity_tags (
  activity_id UUID NOT NULL REFERENCES vision.activities(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (activity_id, tag)
);
CREATE INDEX idx_activity_tags_tag ON vision.activity_tags(tag);

-- 2.6 metric_definitions (mig 003)
CREATE TABLE vision.metric_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  computation_type TEXT NOT NULL DEFAULT 'count',
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX idx_metric_definitions_org_id ON vision.metric_definitions(org_id);

-- 2.7 vision_statements (mig 004)
CREATE TABLE vision.vision_statements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vision_statements_org_id ON vision.vision_statements(org_id);
CREATE INDEX idx_vision_statements_active ON vision.vision_statements(org_id, active);

-- 2.8 goals (mig 004)
CREATE TABLE vision.goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  vision_id       UUID REFERENCES vision.vision_statements(id) ON DELETE SET NULL,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  description     TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  target_value    NUMERIC CHECK (target_value IS NULL OR target_value >= 0),
  target_unit     TEXT CHECK (target_unit IS NULL OR char_length(target_unit) <= 50),
  deadline        DATE,
  priority_weight NUMERIC NOT NULL DEFAULT 1.0 CHECK (priority_weight > 0 AND priority_weight <= 10),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_goals_org_id ON vision.goals(org_id);
CREATE INDEX idx_goals_vision_id ON vision.goals(vision_id);
CREATE INDEX idx_goals_status ON vision.goals(org_id, status);
CREATE INDEX idx_goals_deadline ON vision.goals(org_id, deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_goals_title_trgm ON vision.goals USING gin (title extensions.gin_trgm_ops);
CREATE INDEX idx_goals_description_trgm ON vision.goals USING gin (description extensions.gin_trgm_ops)
  WHERE description IS NOT NULL;

-- 2.9 goal_activity_links (mig 004)
CREATE TABLE vision.goal_activity_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID NOT NULL REFERENCES vision.goals(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES vision.activities(id) ON DELETE CASCADE,
  link_type   TEXT NOT NULL DEFAULT 'explicit' CHECK (link_type IN ('explicit','inferred')),
  confidence  NUMERIC NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  approved    BOOLEAN,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (goal_id, activity_id)
);
CREATE INDEX idx_goal_activity_links_goal ON vision.goal_activity_links(goal_id);
CREATE INDEX idx_goal_activity_links_activity ON vision.goal_activity_links(activity_id);

-- 2.10 projects (mig 006)
CREATE TABLE vision.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES vision.departments(id) ON DELETE SET NULL,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 300),
  description   TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  status        TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','archived')),
  start_date    DATE,
  end_date      DATE,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_projects_org_id ON vision.projects(org_id);
CREATE INDEX idx_projects_department ON vision.projects(department_id);
CREATE INDEX idx_projects_status ON vision.projects(org_id, status);
CREATE INDEX idx_projects_dates ON vision.projects(org_id, start_date, end_date);
CREATE INDEX idx_projects_created_by ON vision.projects(created_by);
CREATE INDEX idx_projects_name_trgm ON vision.projects USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_projects_description_trgm ON vision.projects USING gin (description extensions.gin_trgm_ops)
  WHERE description IS NOT NULL;

-- 2.11 milestones (mig 006)
CREATE TABLE vision.milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES vision.projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  target_date  DATE,
  completed_at TIMESTAMPTZ,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_project_id ON vision.milestones(project_id);
CREATE INDEX idx_milestones_sort_order ON vision.milestones(project_id, sort_order);

-- 2.12 project_goal_links (mig 006)
CREATE TABLE vision.project_goal_links (
  project_id UUID NOT NULL REFERENCES vision.projects(id) ON DELETE CASCADE,
  goal_id    UUID NOT NULL REFERENCES vision.goals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, goal_id)
);
CREATE INDEX idx_project_goal_links_goal ON vision.project_goal_links(goal_id);

-- 2.13 project_activities (mig 006)
CREATE TABLE vision.project_activities (
  project_id  UUID NOT NULL REFERENCES vision.projects(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES vision.activities(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, activity_id)
);
CREATE INDEX idx_project_activities_activity ON vision.project_activities(activity_id);

-- 2.14 advisory_templates (mig 009)
CREATE TABLE vision.advisory_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT NOT NULL CHECK (type IN (
                   'alignment_gap', 'coverage_gap', 'trend_alert',
                   'milestone_risk', 'impact_highlight', 'cc_sync_insight')),
  title_template TEXT NOT NULL,
  body_template  TEXT NOT NULL,
  severity       TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.15 advisory_rules (mig 009)
CREATE TABLE vision.advisory_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES vision.advisory_templates(id) ON DELETE CASCADE,
  metric_slug    TEXT NOT NULL,
  operator       TEXT NOT NULL CHECK (operator IN ('<', '<=', '>', '>=', '=', '!=')),
  threshold      NUMERIC NOT NULL,
  lookback_days  INTEGER NOT NULL DEFAULT 30,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_advisory_rules_template ON vision.advisory_rules(template_id);
CREATE INDEX idx_advisory_rules_active ON vision.advisory_rules(active) WHERE active = true;

-- 2.16 advisory_outputs (mig 009)
CREATE TABLE vision.advisory_outputs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES vision.advisory_templates(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES vision.advisory_rules(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  data            JSONB NOT NULL DEFAULT '{}',
  dismissed       BOOLEAN NOT NULL DEFAULT false,
  dismissed_at    TIMESTAMPTZ,
  dismissed_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_advisory_outputs_org ON vision.advisory_outputs(org_id);
CREATE INDEX idx_advisory_outputs_severity ON vision.advisory_outputs(org_id, severity);
CREATE INDEX idx_advisory_outputs_active ON vision.advisory_outputs(org_id, dismissed) WHERE dismissed = false;
CREATE INDEX idx_advisory_outputs_created ON vision.advisory_outputs(org_id, created_at DESC);

-- 2.17 geo_boundaries (mig 010)
CREATE TABLE vision.geo_boundaries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  boundary_geojson JSONB NOT NULL,
  area_km2         NUMERIC(12, 4),
  colour           TEXT DEFAULT '#4a90d9',
  active           BOOLEAN DEFAULT TRUE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_geo_boundaries_org ON vision.geo_boundaries(org_id);
CREATE INDEX idx_geo_boundaries_active ON vision.geo_boundaries(org_id, active) WHERE active = TRUE;
CREATE INDEX idx_geo_boundaries_created ON vision.geo_boundaries(org_id, created_at DESC);
CREATE INDEX idx_geo_boundaries_geojson ON vision.geo_boundaries USING GIN (boundary_geojson);

-- 2.18 org_partnerships (mig 012)
CREATE TABLE vision.org_partnerships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  org_b_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  status        vision.partnership_status NOT NULL DEFAULT 'pending',
  sharing_level vision.sharing_level NOT NULL DEFAULT 'summary',
  initiated_by  UUID NOT NULL REFERENCES auth.users(id),
  responded_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_partnership CHECK (org_a_id <> org_b_id),
  CONSTRAINT unique_partnership UNIQUE (org_a_id, org_b_id)
);
CREATE INDEX idx_partnerships_org_a ON vision.org_partnerships(org_a_id);
CREATE INDEX idx_partnerships_org_b ON vision.org_partnerships(org_b_id);
CREATE INDEX idx_partnerships_status ON vision.org_partnerships(status);

-- 2.19 shared_metrics (mig 012)
CREATE TABLE vision.shared_metrics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id UUID NOT NULL REFERENCES vision.org_partnerships(id) ON DELETE CASCADE,
  metric_slug    TEXT NOT NULL,
  visible        BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_shared_metric UNIQUE (partnership_id, metric_slug)
);
CREATE INDEX idx_shared_metrics_partnership ON vision.shared_metrics(partnership_id);

-- 2.20 export_logs (mig 011)
CREATE TABLE vision.export_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('csv', 'pdf', 'png')),
  resource    TEXT NOT NULL,
  filters     JSONB DEFAULT '{}',
  row_count   INTEGER DEFAULT 0,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_export_logs_org_id ON vision.export_logs(org_id);
CREATE INDEX idx_export_logs_created_by ON vision.export_logs(created_by);
CREATE INDEX idx_export_logs_created_at ON vision.export_logs(created_at DESC);

-- 2.21 scheduled_reports (mig 011)
CREATE TABLE vision.scheduled_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  frequency     TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  recipients    TEXT[] NOT NULL DEFAULT '{}',
  report_config JSONB NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT true,
  last_sent_at  TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_scheduled_reports_org_id ON vision.scheduled_reports(org_id);
CREATE INDEX idx_scheduled_reports_next_run ON vision.scheduled_reports(next_run_at) WHERE active = true;

-- 2.22 activity_daily_aggregates (mig 016)
CREATE TABLE vision.activity_daily_aggregates (
  org_id            UUID          NOT NULL REFERENCES vision.organisations(id) ON DELETE CASCADE,
  day               DATE          NOT NULL,
  activity_type     TEXT          NOT NULL,
  activity_count    INTEGER       NOT NULL DEFAULT 0,
  participant_total INTEGER       NOT NULL DEFAULT 0,
  hours_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  refreshed_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, day, activity_type)
);
CREATE INDEX activity_daily_aggregates_org_day_idx ON vision.activity_daily_aggregates (org_id, day DESC);

-- ============================================================================
-- 3. FUNCTIONS
-- ============================================================================

-- 3.1 RBAC helpers (mig 001) — SECURITY DEFINER, hardened
CREATE OR REPLACE FUNCTION vision.is_org_member(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM vision.user_org_roles
    WHERE user_id = auth.uid() AND org_id = target_org_id);
$$;

CREATE OR REPLACE FUNCTION vision.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM vision.user_org_roles
    WHERE user_id = auth.uid() AND org_id = target_org_id AND role = 'org_admin');
$$;

CREATE OR REPLACE FUNCTION vision.get_user_org_role(target_org_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT role FROM vision.user_org_roles
  WHERE user_id = auth.uid() AND org_id = target_org_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION vision.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM vision.user_org_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin');
$$;

-- 3.2 org hierarchy helpers (mig 013)
CREATE OR REPLACE FUNCTION vision.prevent_org_hierarchy_cycle()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = vision, pg_catalog AS $$
DECLARE cycle_detected BOOLEAN;
BEGIN
  IF NEW.parent_org_id IS NULL THEN RETURN NEW; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_org_id, 1 AS depth FROM vision.organisations WHERE id = NEW.parent_org_id
    UNION ALL
    SELECT o.id, o.parent_org_id, a.depth + 1
    FROM vision.organisations o JOIN ancestors a ON o.id = a.parent_org_id
    WHERE a.depth < 50)
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_detected;
  IF cycle_detected THEN
    RAISE EXCEPTION 'Cannot set parent_org_id on %: would create a cycle in the org hierarchy',
      NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vision.get_org_ancestors(target_org_id UUID)
RETURNS TABLE (id UUID, depth INT) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  WITH RECURSIVE ancestors AS (
    SELECT o.id, o.parent_org_id, 0 AS depth FROM vision.organisations o WHERE o.id = target_org_id
    UNION ALL
    SELECT o.id, o.parent_org_id, a.depth + 1
    FROM vision.organisations o JOIN ancestors a ON o.id = a.parent_org_id
    WHERE a.depth < 50)
  SELECT id, depth FROM ancestors WHERE depth > 0 ORDER BY depth ASC;
$$;

CREATE OR REPLACE FUNCTION vision.get_org_descendants(root_org_id UUID)
RETURNS TABLE (id UUID, depth INT) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  WITH RECURSIVE descendants AS (
    SELECT o.id, 1 AS depth FROM vision.organisations o WHERE o.parent_org_id = root_org_id
    UNION ALL
    SELECT o.id, d.depth + 1
    FROM vision.organisations o JOIN descendants d ON o.parent_org_id = d.id
    WHERE d.depth < 50)
  SELECT id, depth FROM descendants ORDER BY depth ASC;
$$;

CREATE OR REPLACE FUNCTION vision.is_in_org_tree(root_org_id UUID, target_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT target_org_id = root_org_id
    OR EXISTS (SELECT 1 FROM vision.get_org_descendants(root_org_id) d WHERE d.id = target_org_id);
$$;

CREATE OR REPLACE FUNCTION vision.is_org_or_ancestor_member(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT vision.is_org_member(target_org_id)
    OR EXISTS (
      SELECT 1 FROM vision.get_org_ancestors(target_org_id) a
      JOIN vision.user_org_roles uor ON uor.org_id = a.id
      WHERE uor.user_id = auth.uid());
$$;

-- 3.3 goal access helper (mig 014)
CREATE OR REPLACE FUNCTION vision.can_access_goal(target_goal_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = vision, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM vision.goals g
    WHERE g.id = target_goal_id AND (vision.is_org_member(g.org_id) OR vision.is_platform_admin()));
$$;

-- 3.4 org_id immutability guards (mig 005, 006, 012)
CREATE OR REPLACE FUNCTION vision.prevent_org_id_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = vision, pg_catalog AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN RAISE EXCEPTION 'Cannot change org_id'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vision.prevent_project_org_id_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = vision, pg_catalog AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Cannot change org_id on projects'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION vision.update_partnership_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = vision, pg_catalog AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION vision.prevent_partnership_org_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = vision, pg_catalog AS $$
BEGIN
  IF NEW.org_a_id <> OLD.org_a_id OR NEW.org_b_id <> OLD.org_b_id THEN
    RAISE EXCEPTION 'Cannot change organisation IDs on a partnership';
  END IF;
  RETURN NEW;
END;
$$;

-- 3.5 metrics / alignment (mig 003 + 005 superseding versions)
CREATE OR REPLACE FUNCTION vision.compute_org_kpis(
  p_org_id uuid,
  p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_date_to   date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE
SET search_path = vision, pg_catalog AS $$
DECLARE
  result jsonb; v_period_days int; v_prev_from date; v_prev_to date;
  v_current_count int; v_prev_count int; v_growth_pct numeric;
BEGIN
  v_period_days := (p_date_to - p_date_from);
  v_prev_from := p_date_from - v_period_days;
  v_prev_to := p_date_from - 1;
  SELECT COUNT(*)::int INTO v_current_count FROM vision.activities
   WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to;
  SELECT COUNT(*)::int INTO v_prev_count FROM vision.activities
   WHERE org_id = p_org_id AND date >= v_prev_from AND date <= v_prev_to;
  IF v_prev_count > 0 THEN
    v_growth_pct := ROUND(((v_current_count - v_prev_count)::numeric / v_prev_count) * 100, 1);
  ELSE
    v_growth_pct := CASE WHEN v_current_count > 0 THEN 100.0 ELSE 0.0 END;
  END IF;
  SELECT jsonb_build_object(
    'total_activities', v_current_count,
    'participants_reached', (SELECT COALESCE(SUM(participant_count), 0)::int FROM vision.activities
       WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to),
    'active_departments', (SELECT COUNT(DISTINCT department_id)::int FROM vision.activities
       WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to AND department_id IS NOT NULL),
    'activity_growth_pct', v_growth_pct,
    'previous_period_count', v_prev_count,
    'period_days', v_period_days,
    'date_from', p_date_from,
    'date_to', p_date_to
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION vision.compute_alignment_score(p_goal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE
SET search_path = vision, pg_catalog AS $$
DECLARE
  result jsonb; total_weight numeric := 0; weighted_sum numeric := 0; link_count int := 0; rec record;
BEGIN
  FOR rec IN
    SELECT gal.confidence, gal.link_type, a.date, a.participant_count
    FROM vision.goal_activity_links gal
    JOIN vision.activities a ON a.id = gal.activity_id
    WHERE gal.goal_id = p_goal_id AND gal.approved IS NOT FALSE
  LOOP
    link_count := link_count + 1;
    DECLARE
      days_ago int; temporal_weight numeric; type_weight numeric; link_weight numeric;
    BEGIN
      days_ago := EXTRACT(DAY FROM now() - rec.date)::int;
      IF days_ago <= 30 THEN temporal_weight := 1.0;
      ELSIF days_ago <= 90 THEN temporal_weight := 0.7;
      ELSIF days_ago <= 365 THEN temporal_weight := 0.4;
      ELSE temporal_weight := 0.2; END IF;
      IF rec.link_type = 'explicit' THEN type_weight := 1.0; ELSE type_weight := rec.confidence; END IF;
      link_weight := temporal_weight * type_weight;
      total_weight := total_weight + link_weight;
      weighted_sum := weighted_sum + (link_weight * LEAST(rec.participant_count, 100) / 100.0);
    END;
  END LOOP;
  IF total_weight = 0 THEN
    result := jsonb_build_object('score', 0, 'linked_activities', 0, 'weighted_sum', 0);
  ELSE
    result := jsonb_build_object(
      'score', ROUND((weighted_sum / total_weight) * 100, 1),
      'linked_activities', link_count,
      'weighted_sum', ROUND(weighted_sum, 2));
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION vision.compute_org_alignment(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE
SET search_path = vision, pg_catalog AS $$
DECLARE
  result jsonb; total_priority numeric := 0; weighted_score numeric := 0; goal_count int := 0; rec record;
BEGIN
  FOR rec IN
    SELECT g.id, g.priority_weight FROM vision.goals g
    WHERE g.org_id = p_org_id AND g.status = 'active'
  LOOP
    goal_count := goal_count + 1;
    total_priority := total_priority + rec.priority_weight;
    DECLARE goal_score jsonb;
    BEGIN
      goal_score := vision.compute_alignment_score(rec.id);
      weighted_score := weighted_score + (rec.priority_weight * (goal_score->>'score')::numeric);
    END;
  END LOOP;
  IF total_priority = 0 THEN
    result := jsonb_build_object('org_score', 0, 'active_goals', 0, 'total_priority', 0);
  ELSE
    result := jsonb_build_object(
      'org_score', ROUND(weighted_score / total_priority, 1),
      'active_goals', goal_count,
      'total_priority', ROUND(total_priority, 2));
  END IF;
  RETURN result;
END;
$$;

-- 3.6 trend regression (mig 011)
CREATE OR REPLACE FUNCTION vision.compute_trend_regression(
  p_org_id UUID,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE,
  p_granularity TEXT DEFAULT 'day')
RETURNS TABLE (slope DOUBLE PRECISION, intercept DOUBLE PRECISION, r_squared DOUBLE PRECISION, data_points INTEGER)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = vision, pg_catalog AS $$
DECLARE
  v_n INTEGER; v_sum_x DOUBLE PRECISION := 0; v_sum_y DOUBLE PRECISION := 0;
  v_sum_xy DOUBLE PRECISION := 0; v_sum_x2 DOUBLE PRECISION := 0; v_sum_y2 DOUBLE PRECISION := 0;
  v_slope DOUBLE PRECISION; v_intercept DOUBLE PRECISION; v_r_squared DOUBLE PRECISION;
  rec RECORD; v_idx INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT CASE p_granularity
             WHEN 'month' THEN date_trunc('month', a.date::timestamp)::date
             WHEN 'week'  THEN date_trunc('week', a.date::timestamp)::date
             ELSE a.date::date END AS bucket_date,
           COUNT(*)::DOUBLE PRECISION AS cnt
    FROM vision.activities a
    WHERE a.org_id = p_org_id AND a.date >= p_date_from AND a.date <= p_date_to
    GROUP BY bucket_date ORDER BY bucket_date
  LOOP
    v_idx := v_idx + 1;
    v_sum_x := v_sum_x + v_idx;
    v_sum_y := v_sum_y + rec.cnt;
    v_sum_xy := v_sum_xy + (v_idx * rec.cnt);
    v_sum_x2 := v_sum_x2 + (v_idx * v_idx);
    v_sum_y2 := v_sum_y2 + (rec.cnt * rec.cnt);
  END LOOP;
  v_n := v_idx;
  IF v_n < 2 THEN
    RETURN QUERY SELECT 0::DOUBLE PRECISION, 0::DOUBLE PRECISION, 0::DOUBLE PRECISION, v_n; RETURN;
  END IF;
  v_slope := (v_n * v_sum_xy - v_sum_x * v_sum_y) / NULLIF(v_n * v_sum_x2 - v_sum_x * v_sum_x, 0);
  v_intercept := (v_sum_y - COALESCE(v_slope, 0) * v_sum_x) / v_n;
  v_r_squared := POWER(NULLIF(v_n * v_sum_xy - v_sum_x * v_sum_y, 0), 2)
    / NULLIF((v_n * v_sum_x2 - v_sum_x * v_sum_x) * (v_n * v_sum_y2 - v_sum_y * v_sum_y), 0);
  RETURN QUERY SELECT COALESCE(v_slope, 0), COALESCE(v_intercept, 0), COALESCE(v_r_squared, 0), v_n;
END;
$$;

-- 3.7 trigram similarity search RPCs (mig 017) — note: extensions on path for `%`/similarity
CREATE OR REPLACE FUNCTION vision.search_activities_similar(p_org_id uuid, p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, title text, description text, date date, type text, similarity_score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = vision, extensions, pg_catalog AS $$
  SELECT a.id, a.title, a.description, a.date, a.type,
    GREATEST(similarity(a.title, p_query), similarity(COALESCE(a.description, ''), p_query)) AS similarity_score
  FROM vision.activities a
  WHERE a.org_id = p_org_id AND vision.is_org_member(p_org_id)
    AND (a.title % p_query OR COALESCE(a.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

CREATE OR REPLACE FUNCTION vision.search_projects_similar(p_org_id uuid, p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, name text, description text, status text, similarity_score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = vision, extensions, pg_catalog AS $$
  SELECT p.id, p.name, p.description, p.status,
    GREATEST(similarity(p.name, p_query), similarity(COALESCE(p.description, ''), p_query)) AS similarity_score
  FROM vision.projects p
  WHERE p.org_id = p_org_id AND vision.is_org_member(p_org_id)
    AND (p.name % p_query OR COALESCE(p.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

CREATE OR REPLACE FUNCTION vision.search_goals_similar(p_org_id uuid, p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, title text, description text, status text, similarity_score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = vision, extensions, pg_catalog AS $$
  SELECT g.id, g.title, g.description, g.status,
    GREATEST(similarity(g.title, p_query), similarity(COALESCE(g.description, ''), p_query)) AS similarity_score
  FROM vision.goals g
  WHERE g.org_id = p_org_id AND vision.is_org_member(p_org_id)
    AND (g.title % p_query OR COALESCE(g.description, '') % p_query)
  ORDER BY similarity_score DESC
  LIMIT GREATEST(LEAST(p_limit, 100), 1);
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY + POLICIES (end-state, supersessions folded in)
-- ============================================================================
ALTER TABLE vision.organisations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.departments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.user_org_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.activities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.activity_tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.metric_definitions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.vision_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.goals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.goal_activity_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.milestones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.project_goal_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.project_activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.advisory_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.advisory_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.advisory_outputs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.geo_boundaries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.org_partnerships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.shared_metrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.export_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.scheduled_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.activity_daily_aggregates ENABLE ROW LEVEL SECURITY;

-- organisations (mig 001 + 007 SELECT override)
CREATE POLICY organisations_select_member ON vision.organisations FOR SELECT
  USING (vision.is_org_member(id) OR vision.is_platform_admin() OR created_by = auth.uid());
CREATE POLICY organisations_insert_authenticated ON vision.organisations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY organisations_update_admin ON vision.organisations FOR UPDATE
  USING (vision.is_org_admin(id) OR vision.is_platform_admin())
  WITH CHECK (vision.is_org_admin(id) OR vision.is_platform_admin());
CREATE POLICY organisations_delete_admin ON vision.organisations FOR DELETE
  USING (vision.is_org_admin(id) OR vision.is_platform_admin());

-- departments (mig 001 + 018 tree read)
CREATE POLICY departments_select_member ON vision.departments FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY departments_select_tree ON vision.departments FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY departments_insert_admin ON vision.departments FOR INSERT TO authenticated
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY departments_update_admin ON vision.departments FOR UPDATE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin())
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY departments_delete_admin ON vision.departments FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- user_org_roles (mig 001 SELECT/UPDATE/DELETE + 014 INSERT split)
CREATE POLICY user_org_roles_select_member ON vision.user_org_roles FOR SELECT
  USING (vision.is_org_member(org_id) OR user_id = auth.uid() OR vision.is_platform_admin());
CREATE POLICY user_org_roles_insert_admin ON vision.user_org_roles FOR INSERT TO authenticated
  WITH CHECK (vision.is_org_admin(org_id));
CREATE POLICY user_org_roles_insert_platform_admin ON vision.user_org_roles FOR INSERT TO authenticated
  WITH CHECK (vision.is_platform_admin());
CREATE POLICY user_org_roles_insert_self_bootstrap ON vision.user_org_roles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'org_admin'
    AND NOT EXISTS (SELECT 1 FROM vision.user_org_roles existing WHERE existing.org_id = user_org_roles.org_id));
CREATE POLICY user_org_roles_update_admin ON vision.user_org_roles FOR UPDATE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin())
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY user_org_roles_delete_admin ON vision.user_org_roles FOR DELETE
  USING (vision.is_org_admin(org_id) OR user_id = auth.uid() OR vision.is_platform_admin());

-- activities (mig 002 + 018 tree read)
CREATE POLICY activities_select_member ON vision.activities FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY activities_select_tree ON vision.activities FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY activities_insert_member ON vision.activities FOR INSERT TO authenticated
  WITH CHECK (vision.is_org_member(org_id) AND created_by = auth.uid());
CREATE POLICY activities_update_role ON vision.activities FOR UPDATE
  USING (
    vision.is_org_admin(org_id) OR vision.is_platform_admin() OR created_by = auth.uid()
    OR (vision.get_user_org_role(org_id) = 'org_manager' AND department_id IN (
          SELECT uor.department_id FROM vision.user_org_roles uor
          WHERE uor.user_id = auth.uid() AND uor.org_id = activities.org_id)))
  WITH CHECK (
    vision.is_org_admin(org_id) OR vision.is_platform_admin() OR created_by = auth.uid()
    OR (vision.get_user_org_role(org_id) = 'org_manager' AND department_id IN (
          SELECT uor.department_id FROM vision.user_org_roles uor
          WHERE uor.user_id = auth.uid() AND uor.org_id = activities.org_id)));
CREATE POLICY activities_delete_admin ON vision.activities FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- activity_tags (mig 002)
CREATE POLICY activity_tags_select ON vision.activity_tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM vision.activities a WHERE a.id = activity_tags.activity_id
                 AND (vision.is_org_member(a.org_id) OR vision.is_platform_admin())));
CREATE POLICY activity_tags_insert ON vision.activity_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM vision.activities a WHERE a.id = activity_tags.activity_id
                 AND (a.created_by = auth.uid() OR vision.is_org_admin(a.org_id) OR vision.is_platform_admin())));
CREATE POLICY activity_tags_delete ON vision.activity_tags FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.activities a WHERE a.id = activity_tags.activity_id
                 AND (a.created_by = auth.uid() OR vision.is_org_admin(a.org_id) OR vision.is_platform_admin())));

-- metric_definitions (mig 003)
CREATE POLICY metric_definitions_select_members ON vision.metric_definitions FOR SELECT
  USING (vision.is_org_member(org_id));
CREATE POLICY metric_definitions_insert_admins ON vision.metric_definitions FOR INSERT
  WITH CHECK (vision.is_org_admin(org_id));
CREATE POLICY metric_definitions_update_admins ON vision.metric_definitions FOR UPDATE
  USING (vision.is_org_admin(org_id));
CREATE POLICY metric_definitions_delete_admins ON vision.metric_definitions FOR DELETE
  USING (vision.is_org_admin(org_id));

-- vision_statements (mig 004 + 005 platform override + 018 tree read)
CREATE POLICY vision_statements_select_members ON vision.vision_statements FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY vision_statements_select_tree ON vision.vision_statements FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY vision_statements_insert_admins ON vision.vision_statements FOR INSERT
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY vision_statements_update_admins ON vision.vision_statements FOR UPDATE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin())
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY vision_statements_delete_admins ON vision.vision_statements FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- goals (mig 004 + 005 platform override + 018 tree read)
CREATE POLICY goals_select_members ON vision.goals FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY goals_select_tree ON vision.goals FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY goals_insert_admins ON vision.goals FOR INSERT
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY goals_update_admins ON vision.goals FOR UPDATE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin())
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY goals_delete_admins ON vision.goals FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- goal_activity_links (mig 005 admin policies + 014 SELECT via helper)
CREATE POLICY goal_links_select_members ON vision.goal_activity_links FOR SELECT
  USING (vision.can_access_goal(goal_id));
CREATE POLICY goal_links_insert_admins ON vision.goal_activity_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM vision.goals g WHERE g.id = goal_id
                 AND (vision.is_org_admin(g.org_id) OR vision.is_platform_admin())));
CREATE POLICY goal_links_update_admins ON vision.goal_activity_links FOR UPDATE
  USING (EXISTS (SELECT 1 FROM vision.goals g WHERE g.id = goal_id
                 AND (vision.is_org_admin(g.org_id) OR vision.is_platform_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM vision.goals g WHERE g.id = goal_id
                 AND (vision.is_org_admin(g.org_id) OR vision.is_platform_admin())));
CREATE POLICY goal_links_delete_admins ON vision.goal_activity_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.goals g WHERE g.id = goal_id
                 AND (vision.is_org_admin(g.org_id) OR vision.is_platform_admin())));

-- projects (mig 006 + 018 tree read)
CREATE POLICY projects_select_members ON vision.projects FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY projects_select_tree ON vision.projects FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY projects_insert_members ON vision.projects FOR INSERT
  WITH CHECK ((vision.is_org_member(org_id) AND created_by = auth.uid()) OR vision.is_platform_admin());
CREATE POLICY projects_update_role ON vision.projects FOR UPDATE
  USING (
    vision.is_org_admin(org_id) OR vision.is_platform_admin() OR created_by = auth.uid()
    OR (vision.get_user_org_role(org_id) = 'org_manager' AND department_id IN (
          SELECT uor.department_id FROM vision.user_org_roles uor
          WHERE uor.user_id = auth.uid() AND uor.org_id = projects.org_id)))
  WITH CHECK (
    vision.is_org_admin(org_id) OR vision.is_platform_admin() OR created_by = auth.uid()
    OR (vision.get_user_org_role(org_id) = 'org_manager' AND department_id IN (
          SELECT uor.department_id FROM vision.user_org_roles uor
          WHERE uor.user_id = auth.uid() AND uor.org_id = projects.org_id)));
CREATE POLICY projects_delete_admins ON vision.projects FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- milestones (mig 006)
CREATE POLICY milestones_select_members ON vision.milestones FOR SELECT
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY milestones_insert_members ON vision.milestones FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY milestones_update_role ON vision.milestones FOR UPDATE
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id AND (
            vision.is_org_admin(p.org_id) OR vision.is_platform_admin() OR p.created_by = auth.uid()
            OR (vision.get_user_org_role(p.org_id) = 'org_manager' AND p.department_id IN (
                  SELECT uor.department_id FROM vision.user_org_roles uor
                  WHERE uor.user_id = auth.uid() AND uor.org_id = p.org_id)))));
CREATE POLICY milestones_delete_role ON vision.milestones FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id AND (
            vision.is_org_admin(p.org_id) OR vision.is_platform_admin() OR p.created_by = auth.uid())));

-- project_goal_links (mig 006)
CREATE POLICY project_goal_links_select ON vision.project_goal_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY project_goal_links_insert ON vision.project_goal_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY project_goal_links_delete ON vision.project_goal_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id AND (
            vision.is_org_admin(p.org_id) OR vision.is_platform_admin() OR p.created_by = auth.uid())));

-- project_activities (mig 006)
CREATE POLICY project_activities_select ON vision.project_activities FOR SELECT
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY project_activities_insert ON vision.project_activities FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id
                 AND (vision.is_org_member(p.org_id) OR vision.is_platform_admin())));
CREATE POLICY project_activities_delete ON vision.project_activities FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.projects p WHERE p.id = project_id AND (
            vision.is_org_admin(p.org_id) OR vision.is_platform_admin() OR p.created_by = auth.uid())));

-- advisory_templates / advisory_rules (mig 009)
CREATE POLICY advisory_templates_select_authenticated ON vision.advisory_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY advisory_templates_all_platform_admin ON vision.advisory_templates FOR ALL USING (vision.is_platform_admin());
CREATE POLICY advisory_rules_select_authenticated ON vision.advisory_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY advisory_rules_all_platform_admin ON vision.advisory_rules FOR ALL USING (vision.is_platform_admin());

-- advisory_outputs (mig 009)
CREATE POLICY advisory_outputs_select_members ON vision.advisory_outputs FOR SELECT TO authenticated
  USING (vision.is_org_member(org_id));
CREATE POLICY advisory_outputs_update_admins ON vision.advisory_outputs FOR UPDATE TO authenticated
  USING (vision.get_user_org_role(org_id) IN ('org_admin', 'org_manager'));
CREATE POLICY advisory_outputs_insert_admins ON vision.advisory_outputs FOR INSERT TO authenticated
  WITH CHECK (vision.get_user_org_role(org_id) IN ('org_admin', 'org_manager'));
CREATE POLICY advisory_outputs_all_platform_admin ON vision.advisory_outputs FOR ALL USING (vision.is_platform_admin());

-- geo_boundaries (mig 010)
CREATE POLICY geo_boundaries_select_member ON vision.geo_boundaries FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY geo_boundaries_insert_admin ON vision.geo_boundaries FOR INSERT
  WITH CHECK (vision.get_user_org_role(org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());
CREATE POLICY geo_boundaries_update_admin ON vision.geo_boundaries FOR UPDATE
  USING (vision.get_user_org_role(org_id) IN ('org_admin', 'org_manager') OR vision.is_platform_admin());
CREATE POLICY geo_boundaries_delete_admin ON vision.geo_boundaries FOR DELETE
  USING (vision.get_user_org_role(org_id) = 'org_admin' OR vision.is_platform_admin());

-- org_partnerships (mig 012)
CREATE POLICY partnerships_select ON vision.org_partnerships FOR SELECT
  USING (vision.is_org_member(org_a_id) OR vision.is_org_member(org_b_id) OR vision.is_platform_admin());
CREATE POLICY partnerships_insert ON vision.org_partnerships FOR INSERT
  WITH CHECK (vision.is_org_admin(org_a_id) OR vision.is_platform_admin());
CREATE POLICY partnerships_update ON vision.org_partnerships FOR UPDATE
  USING (vision.is_org_admin(org_a_id) OR vision.is_org_admin(org_b_id) OR vision.is_platform_admin());
CREATE POLICY partnerships_delete ON vision.org_partnerships FOR DELETE
  USING (vision.is_org_admin(org_a_id) OR vision.is_org_admin(org_b_id) OR vision.is_platform_admin());

-- shared_metrics (mig 012)
CREATE POLICY shared_metrics_select ON vision.shared_metrics FOR SELECT
  USING (EXISTS (SELECT 1 FROM vision.org_partnerships p WHERE p.id = partnership_id AND p.status = 'active'
                 AND (vision.is_org_member(p.org_a_id) OR vision.is_org_member(p.org_b_id)))
         OR vision.is_platform_admin());
CREATE POLICY shared_metrics_insert ON vision.shared_metrics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM vision.org_partnerships p WHERE p.id = partnership_id
                 AND (vision.is_org_admin(p.org_a_id) OR vision.is_org_admin(p.org_b_id)))
              OR vision.is_platform_admin());
CREATE POLICY shared_metrics_update ON vision.shared_metrics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM vision.org_partnerships p WHERE p.id = partnership_id
                 AND (vision.is_org_admin(p.org_a_id) OR vision.is_org_admin(p.org_b_id)))
         OR vision.is_platform_admin());
CREATE POLICY shared_metrics_delete ON vision.shared_metrics FOR DELETE
  USING (EXISTS (SELECT 1 FROM vision.org_partnerships p WHERE p.id = partnership_id
                 AND (vision.is_org_admin(p.org_a_id) OR vision.is_org_admin(p.org_b_id)))
         OR vision.is_platform_admin());

-- export_logs (mig 011)
CREATE POLICY export_logs_select_member ON vision.export_logs FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY export_logs_insert_member ON vision.export_logs FOR INSERT
  WITH CHECK (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY export_logs_delete_admin ON vision.export_logs FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- scheduled_reports (mig 011)
CREATE POLICY scheduled_reports_select_member ON vision.scheduled_reports FOR SELECT
  USING (vision.is_org_member(org_id) OR vision.is_platform_admin());
CREATE POLICY scheduled_reports_insert_admin ON vision.scheduled_reports FOR INSERT
  WITH CHECK (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY scheduled_reports_update_admin ON vision.scheduled_reports FOR UPDATE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());
CREATE POLICY scheduled_reports_delete_admin ON vision.scheduled_reports FOR DELETE
  USING (vision.is_org_admin(org_id) OR vision.is_platform_admin());

-- activity_daily_aggregates (mig 015 read + 016 no-writes + 018 tree read)
CREATE POLICY activity_daily_aggregates_select_members ON vision.activity_daily_aggregates FOR SELECT
  USING (vision.is_org_member(org_id));
CREATE POLICY activity_daily_aggregates_select_tree ON vision.activity_daily_aggregates FOR SELECT
  USING (vision.is_org_or_ancestor_member(org_id));
CREATE POLICY activity_daily_aggregates_no_writes ON vision.activity_daily_aggregates FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================
CREATE TRIGGER set_organisations_updated_at BEFORE UPDATE ON vision.organisations
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();
CREATE TRIGGER organisations_prevent_hierarchy_cycle BEFORE INSERT OR UPDATE OF parent_org_id ON vision.organisations
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_org_hierarchy_cycle();

CREATE TRIGGER set_activities_updated_at BEFORE UPDATE ON vision.activities
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();

CREATE TRIGGER set_vision_statements_updated_at BEFORE UPDATE ON vision.vision_statements
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();
CREATE TRIGGER vision_statements_prevent_org_id_change BEFORE UPDATE ON vision.vision_statements
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_org_id_change();

CREATE TRIGGER set_goals_updated_at BEFORE UPDATE ON vision.goals
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();
CREATE TRIGGER goals_prevent_org_id_change BEFORE UPDATE ON vision.goals
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_org_id_change();

CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON vision.projects
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();
CREATE TRIGGER prevent_projects_org_id_change BEFORE UPDATE ON vision.projects
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_project_org_id_change();

CREATE TRIGGER set_geo_boundaries_updated_at BEFORE UPDATE ON vision.geo_boundaries
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();

CREATE TRIGGER set_scheduled_reports_updated_at BEFORE UPDATE ON vision.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION vision.update_updated_at_column();
CREATE TRIGGER prevent_export_logs_org_change BEFORE UPDATE ON vision.export_logs
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_org_id_change();
CREATE TRIGGER prevent_scheduled_reports_org_change BEFORE UPDATE ON vision.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_org_id_change();

CREATE TRIGGER trg_partnership_updated_at BEFORE UPDATE ON vision.org_partnerships
  FOR EACH ROW EXECUTE FUNCTION vision.update_partnership_updated_at();
CREATE TRIGGER trg_prevent_partnership_org_change BEFORE UPDATE ON vision.org_partnerships
  FOR EACH ROW EXECUTE FUNCTION vision.prevent_partnership_org_change();

-- ============================================================================
-- 6. MATERIALIZED VIEWS (mig 003, 004, 010, 015) + aggregate refresh functions (015, 016, 019)
-- ============================================================================

-- 6.1 mv_org_activity_summary (mig 003)
CREATE MATERIALIZED VIEW vision.mv_org_activity_summary AS
SELECT a.org_id,
  COUNT(*)::int AS total_activities,
  COUNT(DISTINCT a.department_id)::int AS active_departments,
  COALESCE(SUM(a.participant_count), 0)::int AS total_participants,
  COUNT(*) FILTER (WHERE a.date >= (CURRENT_DATE - INTERVAL '30 days'))::int AS activities_last_30d,
  COUNT(*) FILTER (WHERE a.date >= (CURRENT_DATE - INTERVAL '60 days')
                     AND a.date < (CURRENT_DATE - INTERVAL '30 days'))::int AS activities_prev_30d,
  a.type AS activity_type,
  d.name AS department_name,
  a.department_id,
  DATE_TRUNC('month', a.date)::date AS month
FROM vision.activities a
LEFT JOIN vision.departments d ON d.id = a.department_id
GROUP BY a.org_id, a.type, d.name, a.department_id, DATE_TRUNC('month', a.date)
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_org_activity_summary
  ON vision.mv_org_activity_summary (org_id, activity_type, department_id, month);

-- 6.2 mv_department_ranking (mig 003)
CREATE MATERIALIZED VIEW vision.mv_department_ranking AS
SELECT a.org_id, a.department_id, d.name AS department_name,
  COUNT(*)::int AS activity_count,
  COALESCE(SUM(a.participant_count), 0)::int AS participant_reach,
  COUNT(DISTINCT a.type)::int AS type_diversity,
  RANK() OVER (PARTITION BY a.org_id ORDER BY COUNT(*) DESC)::int AS rank_by_volume
FROM vision.activities a
INNER JOIN vision.departments d ON d.id = a.department_id
WHERE a.department_id IS NOT NULL
GROUP BY a.org_id, a.department_id, d.name
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_department_ranking ON vision.mv_department_ranking (org_id, department_id);

-- 6.3 mv_goal_alignment_matrix (mig 004)
CREATE MATERIALIZED VIEW vision.mv_goal_alignment_matrix AS
SELECT g.id AS goal_id, g.org_id, g.title AS goal_title, g.priority_weight, g.status, g.deadline,
  vs.title AS vision_title,
  COUNT(gal.id)::int AS linked_activities,
  COUNT(gal.id) FILTER (WHERE gal.link_type = 'explicit')::int AS explicit_links,
  COUNT(gal.id) FILTER (WHERE gal.link_type = 'inferred')::int AS inferred_links,
  COALESCE(SUM(gal.confidence * CASE
      WHEN a.date >= (CURRENT_DATE - INTERVAL '30 days') THEN 1.0
      WHEN a.date >= (CURRENT_DATE - INTERVAL '90 days') THEN 0.7
      WHEN a.date >= (CURRENT_DATE - INTERVAL '365 days') THEN 0.4
      ELSE 0.2 END), 0)::numeric AS weighted_sum,
  CASE WHEN COUNT(gal.id) = 0 THEN 0
    ELSE LEAST(ROUND(COALESCE(SUM(gal.confidence * CASE
        WHEN a.date >= (CURRENT_DATE - INTERVAL '30 days') THEN 1.0
        WHEN a.date >= (CURRENT_DATE - INTERVAL '90 days') THEN 0.7
        WHEN a.date >= (CURRENT_DATE - INTERVAL '365 days') THEN 0.4
        ELSE 0.2 END), 0) / GREATEST(COUNT(gal.id), 1) * 100, 1), 100) END AS alignment_score
FROM vision.goals g
LEFT JOIN vision.vision_statements vs ON vs.id = g.vision_id
LEFT JOIN vision.goal_activity_links gal ON gal.goal_id = g.id
  AND (gal.link_type = 'explicit' OR gal.approved IS NOT FALSE)
LEFT JOIN vision.activities a ON a.id = gal.activity_id
GROUP BY g.id, g.org_id, g.title, g.priority_weight, g.status, g.deadline, vs.title
WITH NO DATA;
CREATE UNIQUE INDEX idx_mv_goal_alignment_matrix ON vision.mv_goal_alignment_matrix (goal_id);
CREATE INDEX idx_mv_goal_alignment_matrix_org ON vision.mv_goal_alignment_matrix (org_id);

-- 6.4 mv_boundary_activity_coverage (mig 010)
CREATE MATERIALIZED VIEW vision.mv_boundary_activity_coverage AS
WITH boundary_rings AS (
  SELECT b.id AS boundary_id, b.org_id, b.name AS boundary_name,
    CASE
      WHEN b.boundary_geojson->>'type' = 'Polygon' THEN b.boundary_geojson->'coordinates'->0
      WHEN b.boundary_geojson->>'type' = 'MultiPolygon' THEN b.boundary_geojson->'coordinates'->0->0
      ELSE '[]'::jsonb END AS ring
  FROM vision.geo_boundaries b WHERE b.active = TRUE),
boundary_bounds AS (
  SELECT br.boundary_id, br.org_id, br.boundary_name,
    MIN((coord->>0)::numeric) AS min_lng, MAX((coord->>0)::numeric) AS max_lng,
    MIN((coord->>1)::numeric) AS min_lat, MAX((coord->>1)::numeric) AS max_lat
  FROM boundary_rings br CROSS JOIN LATERAL jsonb_array_elements(br.ring) AS coord
  GROUP BY br.boundary_id, br.org_id, br.boundary_name)
SELECT bb.boundary_id, bb.org_id, bb.boundary_name,
  COUNT(a.id) AS activity_count,
  COALESCE(SUM(a.participant_count), 0) AS participant_reach,
  COUNT(DISTINCT a.department_id) AS department_count,
  CASE WHEN COUNT(a.id) < 5 THEN 'gap' WHEN COUNT(a.id) < 15 THEN 'low'
       WHEN COUNT(a.id) < 30 THEN 'moderate' ELSE 'well-covered' END AS coverage_level,
  bb.min_lng, bb.max_lng, bb.min_lat, bb.max_lat
FROM boundary_bounds bb
LEFT JOIN vision.activities a ON a.org_id = bb.org_id
  AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
  AND a.latitude BETWEEN bb.min_lat AND bb.max_lat
  AND a.longitude BETWEEN bb.min_lng AND bb.max_lng
  AND a.date >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY bb.boundary_id, bb.org_id, bb.boundary_name, bb.min_lng, bb.max_lng, bb.min_lat, bb.max_lat;
CREATE UNIQUE INDEX idx_mv_boundary_coverage_pk ON vision.mv_boundary_activity_coverage(boundary_id);

CREATE OR REPLACE FUNCTION vision.refresh_boundary_coverage()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_boundary_activity_coverage;
END;
$$;

-- 6.5 mv_org_dashboard_stats (mig 015)
-- NOTE (preserved from source): the `achieved` goals count filters status='achieved',
-- which the goals.status CHECK does not permit (draft/active/completed/archived) — so
-- achieved_goals is always 0. Kept port-faithful; revisit in the Vision app phase.
CREATE MATERIALIZED VIEW vision.mv_org_dashboard_stats AS
SELECT o.id AS org_id,
  COALESCE(act.total, 0) AS total_activities,
  COALESCE(act.last_30d, 0) AS activities_last_30d,
  COALESCE(act.participants_total, 0) AS total_participants,
  COALESCE(proj.total, 0) AS total_projects,
  COALESCE(proj.active, 0) AS active_projects,
  COALESCE(proj.completed, 0) AS completed_projects,
  COALESCE(g.total, 0) AS total_goals,
  COALESCE(g.achieved, 0) AS achieved_goals,
  COALESCE(g.active, 0) AS active_goals,
  COALESCE(dep.total, 0) AS total_departments,
  COALESCE(mem.total, 0) AS total_members,
  act.latest_activity_at AS latest_activity_at,
  now() AS refreshed_at
FROM vision.organisations o
LEFT JOIN LATERAL (
  SELECT count(*) AS total, count(*) FILTER (WHERE a.date >= current_date - 30) AS last_30d,
    sum(a.participant_count) AS participants_total, max(a.date) AS latest_activity_at
  FROM vision.activities a WHERE a.org_id = o.id) act ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total, count(*) FILTER (WHERE p.status = 'active') AS active,
    count(*) FILTER (WHERE p.status = 'completed') AS completed
  FROM vision.projects p WHERE p.org_id = o.id) proj ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total, count(*) FILTER (WHERE gl.status = 'achieved') AS achieved,
    count(*) FILTER (WHERE gl.status = 'active') AS active
  FROM vision.goals gl WHERE gl.org_id = o.id) g ON true
LEFT JOIN LATERAL (SELECT count(*) AS total FROM vision.departments d WHERE d.org_id = o.id) dep ON true
LEFT JOIN LATERAL (SELECT count(*) AS total FROM vision.user_org_roles r WHERE r.org_id = o.id) mem ON true;
CREATE UNIQUE INDEX mv_org_dashboard_stats_org_id_idx ON vision.mv_org_dashboard_stats (org_id);

CREATE OR REPLACE FUNCTION vision.refresh_org_dashboard_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vision.mv_org_dashboard_stats;
EXCEPTION WHEN feature_not_supported THEN
  REFRESH MATERIALIZED VIEW vision.mv_org_dashboard_stats;
END;
$$;
REVOKE ALL ON FUNCTION vision.refresh_org_dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION vision.refresh_org_dashboard_stats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION vision.get_org_dashboard_stats(p_org_id uuid)
RETURNS TABLE (
  org_id uuid, total_activities bigint, activities_last_30d bigint, total_participants bigint,
  total_projects bigint, active_projects bigint, completed_projects bigint, total_goals bigint,
  achieved_goals bigint, active_goals bigint, total_departments bigint, total_members bigint,
  latest_activity_at date, refreshed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
BEGIN
  IF NOT vision.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not a member of org %', p_org_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT s.* FROM vision.mv_org_dashboard_stats s WHERE s.org_id = p_org_id;
END;
$$;
REVOKE ALL ON FUNCTION vision.get_org_dashboard_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION vision.get_org_dashboard_stats(uuid) TO authenticated, service_role;

-- 6.6 activity_daily_aggregates refresh functions (mig 016) + trigger (mig 019)
CREATE OR REPLACE FUNCTION vision.refresh_activity_daily_aggregates(p_org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
BEGIN
  IF p_org_id IS NULL THEN
    DELETE FROM vision.activity_daily_aggregates;
    INSERT INTO vision.activity_daily_aggregates
      (org_id, day, activity_type, activity_count, participant_total, hours_total)
    SELECT a.org_id, a.date, a.type, count(*), COALESCE(sum(a.participant_count), 0),
      COALESCE(sum(CASE WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0 ELSE 0 END), 0)
    FROM vision.activities a GROUP BY a.org_id, a.date, a.type;
  ELSE
    DELETE FROM vision.activity_daily_aggregates WHERE org_id = p_org_id;
    INSERT INTO vision.activity_daily_aggregates
      (org_id, day, activity_type, activity_count, participant_total, hours_total)
    SELECT a.org_id, a.date, a.type, count(*), COALESCE(sum(a.participant_count), 0),
      COALESCE(sum(CASE WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0 ELSE 0 END), 0)
    FROM vision.activities a WHERE a.org_id = p_org_id GROUP BY a.org_id, a.date, a.type;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION vision.refresh_activity_daily_aggregates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION vision.refresh_activity_daily_aggregates(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION vision.refresh_activity_day(p_org_id uuid, p_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
BEGIN
  DELETE FROM vision.activity_daily_aggregates WHERE org_id = p_org_id AND day = p_day;
  INSERT INTO vision.activity_daily_aggregates
    (org_id, day, activity_type, activity_count, participant_total, hours_total)
  SELECT a.org_id, a.date, a.type, count(*), COALESCE(sum(a.participant_count), 0),
    COALESCE(sum(CASE WHEN a.start_time IS NOT NULL AND a.end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 3600.0 ELSE 0 END), 0)
  FROM vision.activities a WHERE a.org_id = p_org_id AND a.date = p_day
  GROUP BY a.org_id, a.date, a.type;
END;
$$;
REVOKE ALL ON FUNCTION vision.refresh_activity_day(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION vision.refresh_activity_day(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION vision.trg_refresh_activities_aggregates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = vision, pg_catalog AS $$
DECLARE rec record;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR rec IN SELECT DISTINCT org_id, date FROM new_table LOOP
      PERFORM vision.refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  ELSIF (TG_OP = 'DELETE') THEN
    FOR rec IN SELECT DISTINCT org_id, date FROM old_table LOOP
      PERFORM vision.refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  ELSE
    FOR rec IN SELECT DISTINCT org_id, date FROM old_table
               UNION SELECT DISTINCT org_id, date FROM new_table LOOP
      PERFORM vision.refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION vision.trg_refresh_activities_aggregates() FROM public;

CREATE TRIGGER activities_aggregate_insert AFTER INSERT ON vision.activities
  REFERENCING NEW TABLE AS new_table FOR EACH STATEMENT
  EXECUTE FUNCTION vision.trg_refresh_activities_aggregates();
CREATE TRIGGER activities_aggregate_update AFTER UPDATE ON vision.activities
  REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table FOR EACH STATEMENT
  EXECUTE FUNCTION vision.trg_refresh_activities_aggregates();
CREATE TRIGGER activities_aggregate_delete AFTER DELETE ON vision.activities
  REFERENCING OLD TABLE AS old_table FOR EACH STATEMENT
  EXECUTE FUNCTION vision.trg_refresh_activities_aggregates();

-- Prime materialized views + aggregate table (empty base tables → instant)
REFRESH MATERIALIZED VIEW vision.mv_org_activity_summary;
REFRESH MATERIALIZED VIEW vision.mv_department_ranking;
REFRESH MATERIALIZED VIEW vision.mv_goal_alignment_matrix;
REFRESH MATERIALIZED VIEW vision.mv_boundary_activity_coverage;
REFRESH MATERIALIZED VIEW vision.mv_org_dashboard_stats;
SELECT vision.refresh_activity_daily_aggregates(NULL);

-- ============================================================================
-- 7. SECURITY-DEFINER helper hardening (R3.3): revoke from public, grant to roles
-- ============================================================================
REVOKE EXECUTE ON FUNCTION vision.is_org_member(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.is_org_admin(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.get_user_org_role(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.is_platform_admin() FROM public;
REVOKE EXECUTE ON FUNCTION vision.get_org_ancestors(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.get_org_descendants(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.is_in_org_tree(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.is_org_or_ancestor_member(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.can_access_goal(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION vision.refresh_boundary_coverage() FROM public;
REVOKE EXECUTE ON FUNCTION vision.search_activities_similar(uuid, text, int) FROM public;
REVOKE EXECUTE ON FUNCTION vision.search_projects_similar(uuid, text, int) FROM public;
REVOKE EXECUTE ON FUNCTION vision.search_goals_similar(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION vision.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.is_org_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.get_user_org_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.get_org_ancestors(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.get_org_descendants(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.is_in_org_tree(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.is_org_or_ancestor_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.can_access_goal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.refresh_boundary_coverage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.search_activities_similar(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.search_projects_similar(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.search_goals_similar(uuid, text, int) TO authenticated, service_role;
-- SECURITY INVOKER analytics fns: callable by authenticated + service_role
GRANT EXECUTE ON FUNCTION vision.compute_org_kpis(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.compute_alignment_score(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.compute_org_alignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION vision.compute_trend_regression(uuid, date, date, text) TO authenticated, service_role;

-- ============================================================================
-- 8. TABLE GRANTS — base tables to authenticated (RLS gates) + service_role.
--    Materialized views are SERVICE_ROLE ONLY (they bypass RLS); end users read
--    them via the SECURITY DEFINER reader functions above.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'vision' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON vision.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON vision.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT ON vision.mv_org_activity_summary       TO service_role;
GRANT SELECT ON vision.mv_department_ranking         TO service_role;
GRANT SELECT ON vision.mv_goal_alignment_matrix      TO service_role;
GRANT SELECT ON vision.mv_boundary_activity_coverage TO service_role;
GRANT SELECT ON vision.mv_org_dashboard_stats        TO service_role;

-- ============================================================================
-- 9. ADVISORY SEED (mig 009 + 010 coverage rule)
-- ============================================================================
INSERT INTO vision.advisory_templates (type, title_template, body_template, severity) VALUES
  ('alignment_gap', 'Goal alignment low: {goal_name}', 'Goal ''{goal_name}'' has only {score}% alignment. Consider scheduling activities in: {suggested_categories}', 'warning'),
  ('coverage_gap', 'Low activity coverage: {boundary_name}', 'Your {boundary_name} area shows low activity ({count} in {period}). Nearby orgs are active in: {areas}', 'warning'),
  ('trend_alert', 'Activity volume decrease', 'Activity volume decreased {pct}% compared to last month. Departments most affected: {departments}', 'critical'),
  ('milestone_risk', 'Milestone at risk: {milestone_name}', 'Milestone ''{milestone_name}'' in project ''{project_name}'' is at risk. {days_remaining} days remain, {completion}% complete', 'critical'),
  ('impact_highlight', 'Positive trend: {metric_name}', 'Your {metric_name} improved {pct}% this {period}. Top contributors: {entities}', 'info'),
  ('cc_sync_insight', 'New Connect matches', '{count} new events on Citizens Connect match your goals. Review and claim: {link}', 'info')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  t_alignment UUID; t_coverage UUID; t_trend UUID; t_milestone UUID; t_impact UUID; t_cc UUID;
BEGIN
  SELECT id INTO t_alignment FROM vision.advisory_templates WHERE type = 'alignment_gap' LIMIT 1;
  SELECT id INTO t_coverage FROM vision.advisory_templates WHERE type = 'coverage_gap' LIMIT 1;
  SELECT id INTO t_trend FROM vision.advisory_templates WHERE type = 'trend_alert' LIMIT 1;
  SELECT id INTO t_milestone FROM vision.advisory_templates WHERE type = 'milestone_risk' LIMIT 1;
  SELECT id INTO t_impact FROM vision.advisory_templates WHERE type = 'impact_highlight' LIMIT 1;
  SELECT id INTO t_cc FROM vision.advisory_templates WHERE type = 'cc_sync_insight' LIMIT 1;

  IF t_alignment IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_alignment) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_alignment, 'goal_alignment_pct', '<', 30, 30, 168);
  END IF;
  IF t_coverage IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_coverage) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_coverage, 'area_activity_count', '<', 5, 90, 168);
  END IF;
  IF t_trend IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_trend) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_trend, 'activity_volume_change_pct', '<', -25, 30, 72);
  END IF;
  IF t_milestone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_milestone) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_milestone, 'milestone_completion_pct', '<', 50, 14, 48);
  END IF;
  IF t_impact IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_impact) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_impact, 'metric_improvement_pct', '>', 20, 30, 168);
  END IF;
  IF t_cc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vision.advisory_rules WHERE template_id = t_cc) THEN
    INSERT INTO vision.advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_cc, 'new_cc_event_matches', '>', 0, 7, 24);
  END IF;
END $$;

-- ============================================================================
-- 10. PLATFORM ADMIN BOOTSTRAP (mig 021) — made NON-FATAL for the consolidation.
--     Promotes the founder account to platform_admin if it exists in the shared
--     auth.users. If absent (e.g. branch with no auth rows), it logs a notice and
--     skips rather than aborting the whole schema port.
-- ============================================================================
DO $$
DECLARE
  TARGET_EMAIL  CONSTANT TEXT := 'citizensnetworkpbo@gmail.com';
  PLATFORM_SLUG CONSTANT TEXT := 'platform';
  PLATFORM_NAME CONSTANT TEXT := 'Platform';
  v_user_id UUID; v_org_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(TARGET_EMAIL) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Vision platform-admin bootstrap skipped: no auth.users row for %. Re-run vision.bootstrap when present.', TARGET_EMAIL;
    RETURN;
  END IF;
  SELECT id INTO v_org_id FROM vision.organisations WHERE slug = PLATFORM_SLUG LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO vision.organisations (name, slug, description, created_by)
    VALUES (PLATFORM_NAME, PLATFORM_SLUG,
      'System organisation. Holds platform_admin role bindings. Do not add operational data here.', v_user_id)
    RETURNING id INTO v_org_id;
  END IF;
  INSERT INTO vision.user_org_roles (user_id, org_id, role)
  VALUES (v_user_id, v_org_id, 'platform_admin')
  ON CONFLICT (user_id, org_id) DO UPDATE SET role = 'platform_admin';
  RAISE NOTICE 'Vision platform-admin bootstrap: % is now platform_admin on org %.', TARGET_EMAIL, v_org_id;
END $$;

-- ============================================================================
-- 11. SCHEDULED REFRESH (pg_cron, if installed) — qualified to vision.*
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vision_refresh_org_dashboard_stats';
    PERFORM cron.schedule('vision_refresh_org_dashboard_stats', '*/10 * * * *',
      $cron$ SELECT vision.refresh_org_dashboard_stats(); $cron$);

    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'vision_refresh_activity_daily_aggregates';
    PERFORM cron.schedule('vision_refresh_activity_daily_aggregates', '*/30 * * * *',
      $cron$ SELECT vision.refresh_activity_daily_aggregates(NULL); $cron$);
  END IF;
END $$;
