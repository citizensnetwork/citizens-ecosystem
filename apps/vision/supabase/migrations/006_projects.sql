-- Migration 006: Projects & Milestones
-- Phase 5: Group activities into projects with timelines and trackable milestones
-- Creates: projects, milestones, project_goal_links, project_activities

-- ============================================================
-- 1. projects — grouping of activities with defined timelines
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES departments(id) ON DELETE SET NULL,
  name            text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 300),
  description     text CHECK (description IS NULL OR char_length(description) <= 5000),
  status          text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','completed','archived')),
  start_date      date,
  end_date        date,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects(org_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);

-- Trigger: auto-update updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'set_projects_updated_at'
  ) THEN
    CREATE TRIGGER set_projects_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Trigger: prevent org_id mutation
CREATE OR REPLACE FUNCTION prevent_project_org_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Cannot change org_id on projects';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'prevent_projects_org_id_change'
  ) THEN
    CREATE TRIGGER prevent_projects_org_id_change
      BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION prevent_project_org_id_change();
  END IF;
END $$;

-- RLS: members can read, members can create, admins/creator can update, admins can delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_select_members') THEN
    CREATE POLICY projects_select_members ON projects
      FOR SELECT USING (is_org_member(org_id) OR is_platform_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_insert_members') THEN
    CREATE POLICY projects_insert_members ON projects
      FOR INSERT WITH CHECK (
        (is_org_member(org_id) AND created_by = auth.uid())
        OR is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_update_role') THEN
    CREATE POLICY projects_update_role ON projects
      FOR UPDATE USING (
        is_org_admin(org_id)
        OR is_platform_admin()
        OR created_by = auth.uid()
        OR (
          get_user_org_role(org_id) = 'org_manager'
          AND department_id IN (
            SELECT uor.department_id FROM user_org_roles uor
            WHERE uor.user_id = auth.uid() AND uor.org_id = projects.org_id
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
            WHERE uor.user_id = auth.uid() AND uor.org_id = projects.org_id
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_delete_admins') THEN
    CREATE POLICY projects_delete_admins ON projects
      FOR DELETE USING (is_org_admin(org_id) OR is_platform_admin());
  END IF;
END $$;

-- ============================================================
-- 2. milestones — trackable checkpoints within a project
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 300),
  target_date   date,
  completed_at  timestamptz,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_sort_order ON milestones(project_id, sort_order);

-- RLS: milestones inherit org access via project
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'milestones_select_members') THEN
    CREATE POLICY milestones_select_members ON milestones
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'milestones_insert_members') THEN
    CREATE POLICY milestones_insert_members ON milestones
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'milestones_update_role') THEN
    CREATE POLICY milestones_update_role ON milestones
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (
            is_org_admin(p.org_id)
            OR is_platform_admin()
            OR p.created_by = auth.uid()
            OR (
              get_user_org_role(p.org_id) = 'org_manager'
              AND p.department_id IN (
                SELECT uor.department_id FROM user_org_roles uor
                WHERE uor.user_id = auth.uid() AND uor.org_id = p.org_id
              )
            )
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'milestones_delete_role') THEN
    CREATE POLICY milestones_delete_role ON milestones
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (
            is_org_admin(p.org_id) OR is_platform_admin() OR p.created_by = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- ============================================================
-- 3. project_goal_links — many-to-many projects ↔ goals
-- ============================================================
CREATE TABLE IF NOT EXISTS project_goal_links (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, goal_id)
);

ALTER TABLE project_goal_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_goal_links_goal ON project_goal_links(goal_id);

-- RLS: inherit from project org
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_goal_links_select') THEN
    CREATE POLICY project_goal_links_select ON project_goal_links
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_goal_links_insert') THEN
    CREATE POLICY project_goal_links_insert ON project_goal_links
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_goal_links_delete') THEN
    CREATE POLICY project_goal_links_delete ON project_goal_links
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (
            is_org_admin(p.org_id) OR is_platform_admin() OR p.created_by = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. project_activities — many-to-many projects ↔ activities
-- ============================================================
CREATE TABLE IF NOT EXISTS project_activities (
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_id  uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, activity_id)
);

ALTER TABLE project_activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_activities_activity ON project_activities(activity_id);

-- RLS: inherit from project org
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_activities_select') THEN
    CREATE POLICY project_activities_select ON project_activities
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_activities_insert') THEN
    CREATE POLICY project_activities_insert ON project_activities
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (is_org_member(p.org_id) OR is_platform_admin())
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'project_activities_delete') THEN
    CREATE POLICY project_activities_delete ON project_activities
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM projects p
          WHERE p.id = project_id AND (
            is_org_admin(p.org_id) OR is_platform_admin() OR p.created_by = auth.uid()
          )
        )
      );
  END IF;
END $$;
