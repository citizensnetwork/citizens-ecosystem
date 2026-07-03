-- Migration: 001_foundation
-- Foundation schema for Citizens Vision multi-tenant platform
-- Creates: organisations, departments, user_org_roles, RLS policies, helper functions

-- ============================================================
-- HELPER FUNCTIONS (must exist before RLS policies reference them)
-- ============================================================

-- Check if current user is a member of an organisation
CREATE OR REPLACE FUNCTION is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_org_roles
    WHERE user_id = auth.uid()
      AND org_id = target_org_id
  );
$$;

-- Check if current user is an admin of an organisation
CREATE OR REPLACE FUNCTION is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_org_roles
    WHERE user_id = auth.uid()
      AND org_id = target_org_id
      AND role = 'org_admin'
  );
$$;

-- Get user's role in an organisation (returns NULL if not a member)
CREATE OR REPLACE FUNCTION get_user_org_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_org_roles
  WHERE user_id = auth.uid()
    AND org_id = target_org_id
  LIMIT 1;
$$;

-- Check if current user is a platform admin
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_org_roles
    WHERE user_id = auth.uid()
      AND role = 'platform_admin'
  );
$$;

-- ============================================================
-- TABLES
-- ============================================================

-- Organisations (tenant root)
CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url    TEXT,
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisations_slug ON organisations(slug);
CREATE INDEX IF NOT EXISTS idx_organisations_created_by ON organisations(created_by);

-- Departments (recursive hierarchy within an org)
CREATE TABLE IF NOT EXISTS departments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  parent_department_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_org_id ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);

-- User-Organisation Roles (RBAC junction)
CREATE TABLE IF NOT EXISTS user_org_roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN (
    'platform_admin', 'org_admin', 'org_manager', 'org_member', 'org_viewer'
  )),
  department_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_roles_user_id ON user_org_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_org_id ON user_org_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_department ON user_org_roles(department_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at on organisations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER set_organisations_updated_at
    BEFORE UPDATE ON organisations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_org_roles ENABLE ROW LEVEL SECURITY;

-- Organisations policies
CREATE POLICY "organisations_select_member"
  ON organisations FOR SELECT
  USING (is_org_member(id) OR is_platform_admin());

CREATE POLICY "organisations_insert_authenticated"
  ON organisations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "organisations_update_admin"
  ON organisations FOR UPDATE
  USING (is_org_admin(id) OR is_platform_admin())
  WITH CHECK (is_org_admin(id) OR is_platform_admin());

CREATE POLICY "organisations_delete_admin"
  ON organisations FOR DELETE
  USING (is_org_admin(id) OR is_platform_admin());

-- Departments policies
CREATE POLICY "departments_select_member"
  ON departments FOR SELECT
  USING (is_org_member(org_id) OR is_platform_admin());

CREATE POLICY "departments_insert_admin"
  ON departments FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

CREATE POLICY "departments_update_admin"
  ON departments FOR UPDATE
  USING (is_org_admin(org_id) OR is_platform_admin())
  WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

CREATE POLICY "departments_delete_admin"
  ON departments FOR DELETE
  USING (is_org_admin(org_id) OR is_platform_admin());

-- User Org Roles policies
CREATE POLICY "user_org_roles_select_member"
  ON user_org_roles FOR SELECT
  USING (
    is_org_member(org_id)
    OR user_id = auth.uid()
    OR is_platform_admin()
  );

CREATE POLICY "user_org_roles_insert_admin"
  ON user_org_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Org admins can add members, or user can add themselves (org creation)
    is_org_admin(org_id)
    OR user_id = auth.uid()
    OR is_platform_admin()
  );

CREATE POLICY "user_org_roles_update_admin"
  ON user_org_roles FOR UPDATE
  USING (is_org_admin(org_id) OR is_platform_admin())
  WITH CHECK (is_org_admin(org_id) OR is_platform_admin());

CREATE POLICY "user_org_roles_delete_admin"
  ON user_org_roles FOR DELETE
  USING (
    is_org_admin(org_id)
    OR user_id = auth.uid()
    OR is_platform_admin()
  );
