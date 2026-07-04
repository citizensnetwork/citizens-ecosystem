-- Phase 8: Advisory Engine
-- Tables: advisory_templates, advisory_rules, advisory_outputs

-- ============================================================
-- 1. advisory_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS advisory_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'alignment_gap', 'coverage_gap', 'trend_alert',
    'milestone_risk', 'impact_highlight', 'cc_sync_insight'
  )),
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. advisory_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS advisory_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES advisory_templates(id) ON DELETE CASCADE,
  metric_slug TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('<', '<=', '>', '>=', '=', '!=')),
  threshold NUMERIC NOT NULL,
  lookback_days INTEGER NOT NULL DEFAULT 30,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisory_rules_template ON advisory_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_advisory_rules_active ON advisory_rules(active) WHERE active = true;

-- ============================================================
-- 3. advisory_outputs
-- ============================================================
CREATE TABLE IF NOT EXISTS advisory_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES advisory_templates(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES advisory_rules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  data JSONB NOT NULL DEFAULT '{}',
  dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  dismissed_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisory_outputs_org ON advisory_outputs(org_id);
CREATE INDEX IF NOT EXISTS idx_advisory_outputs_severity ON advisory_outputs(org_id, severity);
CREATE INDEX IF NOT EXISTS idx_advisory_outputs_active ON advisory_outputs(org_id, dismissed) WHERE dismissed = false;
CREATE INDEX IF NOT EXISTS idx_advisory_outputs_created ON advisory_outputs(org_id, created_at DESC);

-- ============================================================
-- 4. RLS Policies
-- ============================================================
ALTER TABLE advisory_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_outputs ENABLE ROW LEVEL SECURITY;

-- advisory_templates: readable by all authenticated users, writable by platform_admin
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_templates_select_authenticated') THEN
    CREATE POLICY advisory_templates_select_authenticated ON advisory_templates
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_templates_all_platform_admin') THEN
    CREATE POLICY advisory_templates_all_platform_admin ON advisory_templates
      FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- advisory_rules: readable by all authenticated users, writable by platform_admin
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_rules_select_authenticated') THEN
    CREATE POLICY advisory_rules_select_authenticated ON advisory_rules
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_rules_all_platform_admin') THEN
    CREATE POLICY advisory_rules_all_platform_admin ON advisory_rules
      FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- advisory_outputs: org members can see their org's outputs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_outputs_select_members') THEN
    CREATE POLICY advisory_outputs_select_members ON advisory_outputs
      FOR SELECT TO authenticated USING (is_org_member(org_id));
  END IF;
END $$;

-- advisory_outputs: org admins can update (dismiss)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_outputs_update_admins') THEN
    CREATE POLICY advisory_outputs_update_admins ON advisory_outputs
      FOR UPDATE TO authenticated USING (
        get_user_org_role(org_id) IN ('org_admin', 'org_manager')
      );
  END IF;
END $$;

-- advisory_outputs: org admins can insert (generate advisories)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_outputs_insert_admins') THEN
    CREATE POLICY advisory_outputs_insert_admins ON advisory_outputs
      FOR INSERT TO authenticated WITH CHECK (
        get_user_org_role(org_id) IN ('org_admin', 'org_manager')
      );
  END IF;
END $$;

-- advisory_outputs: platform_admin full access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'advisory_outputs_all_platform_admin') THEN
    CREATE POLICY advisory_outputs_all_platform_admin ON advisory_outputs
      FOR ALL USING (is_platform_admin());
  END IF;
END $$;

-- ============================================================
-- 5. Seed: Advisory Templates (6 types from Section 5.2)
-- ============================================================
INSERT INTO advisory_templates (type, title_template, body_template, severity) VALUES
  ('alignment_gap', 'Goal alignment low: {goal_name}', 'Goal ''{goal_name}'' has only {score}% alignment. Consider scheduling activities in: {suggested_categories}', 'warning'),
  ('coverage_gap', 'Low activity coverage: {boundary_name}', 'Your {boundary_name} area shows low activity ({count} in {period}). Nearby orgs are active in: {areas}', 'warning'),
  ('trend_alert', 'Activity volume decrease', 'Activity volume decreased {pct}% compared to last month. Departments most affected: {departments}', 'critical'),
  ('milestone_risk', 'Milestone at risk: {milestone_name}', 'Milestone ''{milestone_name}'' in project ''{project_name}'' is at risk. {days_remaining} days remain, {completion}% complete', 'critical'),
  ('impact_highlight', 'Positive trend: {metric_name}', 'Your {metric_name} improved {pct}% this {period}. Top contributors: {entities}', 'info'),
  ('cc_sync_insight', 'New Connect matches', '{count} new events on Citizens Connect match your goals. Review and claim: {link}', 'info')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Seed: Default Advisory Rules
-- ============================================================

-- We need template IDs — use a DO block to look them up
DO $$
DECLARE
  t_alignment UUID;
  t_coverage UUID;
  t_trend UUID;
  t_milestone UUID;
  t_impact UUID;
  t_cc UUID;
BEGIN
  SELECT id INTO t_alignment FROM advisory_templates WHERE type = 'alignment_gap' LIMIT 1;
  SELECT id INTO t_coverage FROM advisory_templates WHERE type = 'coverage_gap' LIMIT 1;
  SELECT id INTO t_trend FROM advisory_templates WHERE type = 'trend_alert' LIMIT 1;
  SELECT id INTO t_milestone FROM advisory_templates WHERE type = 'milestone_risk' LIMIT 1;
  SELECT id INTO t_impact FROM advisory_templates WHERE type = 'impact_highlight' LIMIT 1;
  SELECT id INTO t_cc FROM advisory_templates WHERE type = 'cc_sync_insight' LIMIT 1;

  IF t_alignment IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_alignment) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_alignment, 'goal_alignment_pct', '<', 30, 30, 168);
  END IF;

  IF t_coverage IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_coverage) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_coverage, 'area_activity_count', '<', 5, 90, 168);
  END IF;

  IF t_trend IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_trend) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_trend, 'activity_volume_change_pct', '<', -25, 30, 72);
  END IF;

  IF t_milestone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_milestone) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_milestone, 'milestone_completion_pct', '<', 50, 14, 48);
  END IF;

  IF t_impact IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_impact) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_impact, 'metric_improvement_pct', '>', 20, 30, 168);
  END IF;

  IF t_cc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM advisory_rules WHERE template_id = t_cc) THEN
    INSERT INTO advisory_rules (template_id, metric_slug, operator, threshold, lookback_days, cooldown_hours)
    VALUES (t_cc, 'new_cc_event_matches', '>', 0, 7, 24);
  END IF;
END $$;
