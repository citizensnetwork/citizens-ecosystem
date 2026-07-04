-- Phase 7: Citizens Connect Integration — Mirror Tables & Sync Log
-- Depends on: 001_foundation.sql (organisations), 006_projects.sql (projects), 002_activities.sql (activities)

-- ============================================================
-- cc_events_mirror — Synced events from Citizens Connect
-- ============================================================
CREATE TABLE IF NOT EXISTS cc_events_mirror (
  cc_event_id    UUID PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  date           TIMESTAMPTZ,
  end_time       TIMESTAMPTZ,
  location       TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  category       TEXT,
  status         TEXT,
  created_by     UUID,
  rsvp_count     INTEGER DEFAULT 0,
  avg_rating     NUMERIC(3,2),
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- CV enrichment columns
  cv_org_id      UUID REFERENCES organisations(id) ON DELETE SET NULL,
  cv_project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  cv_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL
);

-- ============================================================
-- cc_places_mirror — Synced places from Citizens Connect
-- ============================================================
CREATE TABLE IF NOT EXISTS cc_places_mirror (
  cc_place_id    UUID PRIMARY KEY,
  name           TEXT NOT NULL,
  address        TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  category       TEXT,
  verified       BOOLEAN DEFAULT false,
  avg_rating     NUMERIC(3,2),
  cv_org_id      UUID REFERENCES organisations(id) ON DELETE SET NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- cc_profiles_mirror — Synced user profiles from Citizens Connect
-- ============================================================
CREATE TABLE IF NOT EXISTS cc_profiles_mirror (
  cc_user_id     UUID PRIMARY KEY,
  email          TEXT,
  full_name      TEXT,
  avatar_url     TEXT,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- cc_sync_log — Audit log for sync operations
-- ============================================================
CREATE TABLE IF NOT EXISTS cc_sync_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type      TEXT NOT NULL CHECK (sync_type IN ('events', 'places', 'profiles', 'full')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  errors         JSONB DEFAULT '[]'::jsonb,
  org_id         UUID REFERENCES organisations(id) ON DELETE CASCADE
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cc_events_cv_org ON cc_events_mirror(cv_org_id);
CREATE INDEX IF NOT EXISTS idx_cc_events_date ON cc_events_mirror(date);
CREATE INDEX IF NOT EXISTS idx_cc_events_category ON cc_events_mirror(category);
CREATE INDEX IF NOT EXISTS idx_cc_events_cv_activity ON cc_events_mirror(cv_activity_id);
CREATE INDEX IF NOT EXISTS idx_cc_places_cv_org ON cc_places_mirror(cv_org_id);
CREATE INDEX IF NOT EXISTS idx_cc_places_category ON cc_places_mirror(category);
CREATE INDEX IF NOT EXISTS idx_cc_places_synced ON cc_places_mirror(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_sync_log_org ON cc_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_cc_sync_log_started ON cc_sync_log(started_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE cc_events_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_places_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_profiles_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_sync_log ENABLE ROW LEVEL SECURITY;

-- cc_events_mirror: members see claimed org records + unclaimed public records
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_events_select_members') THEN
    CREATE POLICY cc_events_select_members ON cc_events_mirror FOR SELECT USING (
      cv_org_id IS NULL
      OR EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_events_mirror.cv_org_id
      )
      OR is_platform_admin()
    );
  END IF;
END $$;

-- cc_events_mirror: admin can claim (update cv_org_id, cv_project_id, cv_activity_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_events_update_admin') THEN
    CREATE POLICY cc_events_update_admin ON cc_events_mirror FOR UPDATE USING (
      -- Allow claiming unclaimed records (any admin/manager)
      (cv_org_id IS NULL AND EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.role IN ('org_admin', 'org_manager')
      ))
      -- Allow updating own org's claimed records
      OR EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_events_mirror.cv_org_id
          AND user_org_roles.role IN ('org_admin', 'org_manager')
      )
      OR is_platform_admin()
    );
  END IF;
END $$;

-- cc_events_mirror: insert via sync (service role only in practice, but allow platform admin)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_events_insert_admin') THEN
    CREATE POLICY cc_events_insert_admin ON cc_events_mirror FOR INSERT WITH CHECK (
      is_platform_admin()
    );
  END IF;
END $$;

-- cc_places_mirror: members see claimed org records + unclaimed
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_places_select_members') THEN
    CREATE POLICY cc_places_select_members ON cc_places_mirror FOR SELECT USING (
      cv_org_id IS NULL
      OR EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_places_mirror.cv_org_id
      )
      OR is_platform_admin()
    );
  END IF;
END $$;

-- cc_places_mirror: admin can associate
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_places_update_admin') THEN
    CREATE POLICY cc_places_update_admin ON cc_places_mirror FOR UPDATE USING (
      -- Allow claiming unclaimed records (any admin/manager)
      (cv_org_id IS NULL AND EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.role IN ('org_admin', 'org_manager')
      ))
      -- Allow updating own org's claimed records
      OR EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_places_mirror.cv_org_id
          AND user_org_roles.role IN ('org_admin', 'org_manager')
      )
      OR is_platform_admin()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_places_insert_admin') THEN
    CREATE POLICY cc_places_insert_admin ON cc_places_mirror FOR INSERT WITH CHECK (
      is_platform_admin()
    );
  END IF;
END $$;

-- cc_profiles_mirror: any authenticated user can read (public profiles)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_profiles_select_authenticated') THEN
    CREATE POLICY cc_profiles_select_authenticated ON cc_profiles_mirror FOR SELECT USING (
      auth.uid() IS NOT NULL OR is_platform_admin()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_profiles_insert_admin') THEN
    CREATE POLICY cc_profiles_insert_admin ON cc_profiles_mirror FOR INSERT WITH CHECK (
      is_platform_admin()
    );
  END IF;
END $$;

-- cc_sync_log: org members see their org's logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_sync_log_select_members') THEN
    CREATE POLICY cc_sync_log_select_members ON cc_sync_log FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_sync_log.org_id
      )
      OR is_platform_admin()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cc_sync_log_insert_admin') THEN
    CREATE POLICY cc_sync_log_insert_admin ON cc_sync_log FOR INSERT WITH CHECK (
      is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM user_org_roles
        WHERE user_org_roles.user_id = auth.uid()
          AND user_org_roles.org_id = cc_sync_log.org_id
          AND user_org_roles.role IN ('org_admin')
      )
    );
  END IF;
END $$;
