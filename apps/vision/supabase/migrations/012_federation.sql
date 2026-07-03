-- ============================================================
-- Migration 012: Multi-Org Federation (Phase 11)
-- ============================================================
-- Tables: org_partnerships, shared_metrics
-- RLS: strict org isolation, sharing is opt-in
-- ============================================================

-- ── Partnership Status Type ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE partnership_status AS ENUM ('pending', 'active', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sharing_level AS ENUM ('none', 'summary', 'detailed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── org_partnerships ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_partnerships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  org_b_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  status        partnership_status NOT NULL DEFAULT 'pending',
  sharing_level sharing_level NOT NULL DEFAULT 'summary',
  initiated_by  UUID NOT NULL REFERENCES auth.users(id),
  responded_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_partnership CHECK (org_a_id <> org_b_id),
  CONSTRAINT unique_partnership UNIQUE (org_a_id, org_b_id)
);

CREATE INDEX IF NOT EXISTS idx_partnerships_org_a ON org_partnerships(org_a_id);
CREATE INDEX IF NOT EXISTS idx_partnerships_org_b ON org_partnerships(org_b_id);
CREATE INDEX IF NOT EXISTS idx_partnerships_status ON org_partnerships(status);

-- ── shared_metrics ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES org_partnerships(id) ON DELETE CASCADE,
  metric_slug     TEXT NOT NULL,
  visible         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_shared_metric UNIQUE (partnership_id, metric_slug)
);

CREATE INDEX IF NOT EXISTS idx_shared_metrics_partnership ON shared_metrics(partnership_id);

-- ── updated_at trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_partnership_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_partnership_updated_at
    BEFORE UPDATE ON org_partnerships
    FOR EACH ROW
    EXECUTE FUNCTION update_partnership_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Prevent org_id mutation ─────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_partnership_org_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_a_id <> OLD.org_a_id OR NEW.org_b_id <> OLD.org_b_id THEN
    RAISE EXCEPTION 'Cannot change organisation IDs on a partnership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_prevent_partnership_org_change
    BEFORE UPDATE ON org_partnerships
    FOR EACH ROW
    EXECUTE FUNCTION prevent_partnership_org_change();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS Policies ────────────────────────────────────────────

ALTER TABLE org_partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_metrics ENABLE ROW LEVEL SECURITY;

-- Partnerships: members of either org can read
DO $$ BEGIN
  CREATE POLICY "partnerships_select"
    ON org_partnerships FOR SELECT
    USING (
      is_org_member(org_a_id) OR is_org_member(org_b_id) OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partnerships: only admins of either org can insert
DO $$ BEGIN
  CREATE POLICY "partnerships_insert"
    ON org_partnerships FOR INSERT
    WITH CHECK (
      is_org_admin(org_a_id) OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partnerships: only admins of either org can update (respond/revoke)
DO $$ BEGIN
  CREATE POLICY "partnerships_update"
    ON org_partnerships FOR UPDATE
    USING (
      is_org_admin(org_a_id) OR is_org_admin(org_b_id) OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partnerships: only admins can delete
DO $$ BEGIN
  CREATE POLICY "partnerships_delete"
    ON org_partnerships FOR DELETE
    USING (
      is_org_admin(org_a_id) OR is_org_admin(org_b_id) OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shared metrics: visible to members of either partnered org
DO $$ BEGIN
  CREATE POLICY "shared_metrics_select"
    ON shared_metrics FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM org_partnerships p
        WHERE p.id = partnership_id
        AND p.status = 'active'
        AND (is_org_member(p.org_a_id) OR is_org_member(p.org_b_id))
      )
      OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shared metrics: only admins of the partnership initiator can manage
DO $$ BEGIN
  CREATE POLICY "shared_metrics_insert"
    ON shared_metrics FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM org_partnerships p
        WHERE p.id = partnership_id
        AND (is_org_admin(p.org_a_id) OR is_org_admin(p.org_b_id))
      )
      OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shared_metrics_update"
    ON shared_metrics FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM org_partnerships p
        WHERE p.id = partnership_id
        AND (is_org_admin(p.org_a_id) OR is_org_admin(p.org_b_id))
      )
      OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shared_metrics_delete"
    ON shared_metrics FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM org_partnerships p
        WHERE p.id = partnership_id
        AND (is_org_admin(p.org_a_id) OR is_org_admin(p.org_b_id))
      )
      OR is_platform_admin()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
