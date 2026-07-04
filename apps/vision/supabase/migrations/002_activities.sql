-- Migration: 002_activities
-- Entity & Activity Tracking for Citizens Vision
-- Creates: activities, activity_tags tables with indexes, RLS policies, triggers

-- ============================================================
-- TABLES
-- ============================================================

-- Activities (atomic units of organisational work)
CREATE TABLE IF NOT EXISTS activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES departments(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL CHECK (type IN (
    'event', 'meeting', 'outreach', 'workshop', 'service', 'training', 'other'
  )),
  date              DATE NOT NULL,
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  location_name     TEXT,
  participant_count INTEGER NOT NULL DEFAULT 0,
  source_type       TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (
    'manual', 'citizens_connect', 'bulk_import', 'api'
  )),
  source_id         TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity Tags (freeform tags for later alignment matching)
CREATE TABLE IF NOT EXISTS activity_tags (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (activity_id, tag)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_activities_org_date ON activities(org_id, date);
CREATE INDEX IF NOT EXISTS idx_activities_department ON activities(department_id);
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(org_id, type);
CREATE INDEX IF NOT EXISTS idx_activity_tags_tag ON activity_tags(tag);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Reuse update_updated_at_column() from 001_foundation.sql
DO $$ BEGIN
  CREATE TRIGGER set_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_tags ENABLE ROW LEVEL SECURITY;

-- Activities: org members can read all activities in their org
CREATE POLICY "activities_select_member"
  ON activities FOR SELECT
  USING (is_org_member(org_id) OR is_platform_admin());

-- Activities: authenticated org members can create
CREATE POLICY "activities_insert_member"
  ON activities FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(org_id)
    AND created_by = auth.uid()
  );

-- Activities: creator, dept managers, or admins can update
CREATE POLICY "activities_update_role"
  ON activities FOR UPDATE
  USING (
    is_org_admin(org_id)
    OR is_platform_admin()
    OR created_by = auth.uid()
    OR (
      get_user_org_role(org_id) = 'org_manager'
      AND department_id IN (
        SELECT uor.department_id FROM user_org_roles uor
        WHERE uor.user_id = auth.uid() AND uor.org_id = activities.org_id
      )
    )
  )
  WITH CHECK (
    is_org_admin(org_id)
    OR is_platform_admin()
    OR created_by = auth.uid()
    OR (
      get_user_org_role(org_id) = 'org_manager'
      AND department_id IN (
        SELECT uor.department_id FROM user_org_roles uor
        WHERE uor.user_id = auth.uid() AND uor.org_id = activities.org_id
      )
    )
  );

-- Activities: admins only can delete
CREATE POLICY "activities_delete_admin"
  ON activities FOR DELETE
  USING (is_org_admin(org_id) OR is_platform_admin());

-- Activity Tags: readable if parent activity is readable
CREATE POLICY "activity_tags_select"
  ON activity_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_tags.activity_id
        AND (is_org_member(a.org_id) OR is_platform_admin())
    )
  );

-- Activity Tags: insertable by activity creator or org admin
CREATE POLICY "activity_tags_insert"
  ON activity_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_tags.activity_id
        AND (a.created_by = auth.uid() OR is_org_admin(a.org_id) OR is_platform_admin())
    )
  );

-- Activity Tags: deletable by activity creator or org admin
CREATE POLICY "activity_tags_delete"
  ON activity_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM activities a
      WHERE a.id = activity_tags.activity_id
        AND (a.created_by = auth.uid() OR is_org_admin(a.org_id) OR is_platform_admin())
    )
  );
