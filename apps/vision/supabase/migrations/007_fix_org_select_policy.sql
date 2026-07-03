-- Migration: 007_fix_org_select_policy
-- Fix: Allow org creators to SELECT their own org immediately after INSERT.
-- Without this, INSERT ... RETURNING fails because the user is not yet a member
-- when the org is first created (the user_org_roles row hasn't been inserted yet).

-- Drop and recreate the SELECT policy to include created_by check
DROP POLICY IF EXISTS "organisations_select_member" ON organisations;

CREATE POLICY "organisations_select_member"
  ON organisations FOR SELECT
  USING (
    is_org_member(id)
    OR is_platform_admin()
    OR created_by = auth.uid()
  );
