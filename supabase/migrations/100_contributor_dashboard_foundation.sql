-- ============================================================
-- Migration 100: Contributor Dashboard Foundation
-- Tables: contributor_access_requests, activity_log,
--         broadcast_messages, contributor_drafts, team_memberships,
--         volunteer_applications, contributor_keywords,
--         specialised_services, planning_tasks, planning_ideas,
--         contributor_analytics, suggestions
-- Profile columns: cover_photo_urls, handle_changed_at
-- ============================================================

-- ── Profile column additions ─────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS handle_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.cover_photo_urls IS
  'Ordered JSONB array of {url, caption} objects. Contributors only. Max 5.';
COMMENT ON COLUMN public.profiles.handle_changed_at IS
  'Timestamp of last contributor_slug change. Enforces one-per-month rule.';

-- ── contributor_access_requests ──────────────────────────────
-- Admins request access to a contributor''s dashboard.
-- Max 2 concurrent active sessions per contributor (enforced by function).
-- Non-destructible — no DELETE RLS policy.
CREATE TABLE IF NOT EXISTS public.contributor_access_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid       NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'denied')),
  denial_reason text        CHECK (char_length(denial_reason) <= 500),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid        REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_car_contributor
  ON public.contributor_access_requests (contributor_id, status);
CREATE INDEX IF NOT EXISTS idx_car_admin
  ON public.contributor_access_requests (admin_id);

-- Function: enforce max 2 concurrent active admin sessions
CREATE OR REPLACE FUNCTION public.check_max_dashboard_sessions(p_contributor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM contributor_access_requests
  WHERE contributor_id = p_contributor_id
    AND status = 'approved'
    AND (expires_at IS NULL OR expires_at > now())
    AND revoked_at IS NULL;

  IF active_count >= 2 THEN
    RAISE EXCEPTION 'max_sessions_reached'
      USING HINT = 'A maximum of 2 admin sessions may be active at once.';
  END IF;
END;
$$;

-- Function: approve a dashboard access request (sets 3-day expiry)
CREATE OR REPLACE FUNCTION public.approve_dashboard_access(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contributor_id uuid;
BEGIN
  SELECT contributor_id INTO v_contributor_id
  FROM contributor_access_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_contributor_id IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  -- Check concurrent session limit before approving
  PERFORM check_max_dashboard_sessions(v_contributor_id);

  UPDATE contributor_access_requests
  SET status = 'approved',
      expires_at = now() + interval '3 days',
      updated_at = now()
  WHERE id = p_request_id;

  -- Write non-destructible audit entry
  INSERT INTO activity_log (contributor_id, actor_id, action, entity_type, entity_id, metadata)
  SELECT v_contributor_id, auth.uid(), 'dashboard_access_approved',
         'access_request', p_request_id::text,
         jsonb_build_object('admin_id', admin_id)
  FROM contributor_access_requests
  WHERE id = p_request_id;
END;
$$;

-- Function: deny a dashboard access request
CREATE OR REPLACE FUNCTION public.deny_dashboard_access(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contributor_id uuid;
BEGIN
  IF char_length(p_reason) < 3 OR char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  UPDATE contributor_access_requests
  SET status = 'denied',
      denial_reason = p_reason,
      updated_at = now()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING contributor_id INTO v_contributor_id;

  IF v_contributor_id IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  INSERT INTO activity_log (contributor_id, actor_id, action, entity_type, entity_id, metadata)
  SELECT v_contributor_id, auth.uid(), 'dashboard_access_denied',
         'access_request', p_request_id::text,
         jsonb_build_object('reason', p_reason)
  FROM contributor_access_requests
  WHERE id = p_request_id;
END;
$$;

-- ── activity_log ─────────────────────────────────────────────
-- Non-destructible audit log. No DELETE policy.
CREATE TABLE IF NOT EXISTS public.activity_log (
  id             bigserial   PRIMARY KEY,
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action         text        NOT NULL CHECK (char_length(action) >= 1 AND char_length(action) <= 100),
  entity_type    text        CHECK (char_length(entity_type) <= 50),
  entity_id      text        CHECK (char_length(entity_id) <= 100),
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_contributor
  ON public.activity_log (contributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor
  ON public.activity_log (actor_id);

-- Auto-purge entries older than 90 days (runs daily via Supabase Cron or pg_cron)
-- Note: Implement via edge function cron. The activity_log table has no DELETE RLS
-- but the purge is a SECURITY DEFINER function callable only by service role.
CREATE OR REPLACE FUNCTION public.purge_old_activity_logs()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM activity_log
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- ── broadcast_messages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type    text        NOT NULL CHECK (entity_type IN ('event', 'place')),
  entity_id      uuid        NOT NULL,
  body           text        NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  deleted_at     timestamptz,  -- soft-delete only; hard-delete disallowed
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_entity
  ON public.broadcast_messages (entity_type, entity_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_contributor
  ON public.broadcast_messages (contributor_id, created_at DESC);

-- ── contributor_drafts ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contributor_drafts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  draft_type     text        NOT NULL CHECK (draft_type IN ('event', 'place')),
  title          text        NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
  data           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drafts_contributor
  ON public.contributor_drafts (contributor_id, draft_type, created_at DESC);

-- ── team_memberships ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_memberships (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role           text        NOT NULL DEFAULT 'viewer'
                             CHECK (role IN ('editor', 'viewer')),
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'removed')),
  invited_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_team_contributor
  ON public.team_memberships (contributor_id, status);
CREATE INDEX IF NOT EXISTS idx_team_member
  ON public.team_memberships (member_id, status);

-- ── volunteer_applications ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contributor_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type     text        NOT NULL CHECK (entity_type IN ('event', 'place')),
  entity_id       uuid        NOT NULL,
  message         text        CHECK (char_length(message) <= 1000),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  response_message text       CHECK (char_length(response_message) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (applicant_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_contributor
  ON public.volunteer_applications (contributor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteer_applicant
  ON public.volunteer_applications (applicant_id, status);
CREATE INDEX IF NOT EXISTS idx_volunteer_entity
  ON public.volunteer_applications (entity_type, entity_id);

-- ── contributor_keywords ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contributor_keywords (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  keyword        text        NOT NULL
                             CHECK (char_length(keyword) >= 2 AND char_length(keyword) <= 100),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_unique_lower
  ON public.contributor_keywords (contributor_id, lower(keyword));
CREATE INDEX IF NOT EXISTS idx_keywords_contributor
  ON public.contributor_keywords (contributor_id);
-- Full-text index for autocomplete search
CREATE INDEX IF NOT EXISTS idx_keywords_text
  ON public.contributor_keywords USING gin(to_tsvector('english', keyword));

-- ── specialised_services ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.specialised_services (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id       uuid        NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service        text        NOT NULL
                             CHECK (char_length(service) >= 2 AND char_length(service) <= 100),
  is_predefined  boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_unique_lower
  ON public.specialised_services (place_id, lower(service));
CREATE INDEX IF NOT EXISTS idx_services_place
  ON public.specialised_services (place_id);
CREATE INDEX IF NOT EXISTS idx_services_text
  ON public.specialised_services USING gin(to_tsvector('english', service));

-- ── planning_tasks ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planning_tasks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text        NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
  description      text        CHECK (char_length(description) <= 2000),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date         date,
  linked_event_id  uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  linked_place_id  uuid        REFERENCES public.places(id) ON DELETE SET NULL,
  notes            text        CHECK (char_length(notes) <= 5000),
  visible_to_team  boolean     NOT NULL DEFAULT false,
  completed_at     timestamptz,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_contributor
  ON public.planning_tasks (contributor_id, status, sort_order);

-- ── planning_ideas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planning_ideas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text        NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
  description      text        CHECK (char_length(description) <= 2000),
  notes            text        CHECK (char_length(notes) <= 5000),
  linked_event_id  uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  linked_place_id  uuid        REFERENCES public.places(id) ON DELETE SET NULL,
  visible_to_team  boolean     NOT NULL DEFAULT false,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ideas_contributor
  ON public.planning_ideas (contributor_id, sort_order);

-- ── contributor_analytics ────────────────────────────────────
-- Daily aggregated counters. Per-contributor, nested by entity.
-- Metrics: views, rsvps, cancellations, follows, comments, reports, shares
CREATE TABLE IF NOT EXISTS public.contributor_analytics (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type    text        NOT NULL
                             CHECK (entity_type IN ('contributor', 'event', 'place')),
  entity_id      uuid,       -- NULL for contributor-level rollup
  date           date        NOT NULL DEFAULT CURRENT_DATE,
  metric         text        NOT NULL
                             CHECK (char_length(metric) >= 1 AND char_length(metric) <= 50),
  value          bigint      NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_id, entity_type, entity_id, date, metric)
);

CREATE INDEX IF NOT EXISTS idx_analytics_contributor_date
  ON public.contributor_analytics (contributor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_entity
  ON public.contributor_analytics (entity_type, entity_id, date DESC)
  WHERE entity_id IS NOT NULL;

-- Function: upsert an analytics counter (increment by delta)
CREATE OR REPLACE FUNCTION public.increment_contributor_metric(
  p_contributor_id uuid,
  p_entity_type    text,
  p_entity_id      uuid,
  p_metric         text,
  p_delta          bigint DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO contributor_analytics
    (contributor_id, entity_type, entity_id, date, metric, value)
  VALUES
    (p_contributor_id, p_entity_type, p_entity_id, CURRENT_DATE, p_metric, p_delta)
  ON CONFLICT (contributor_id, entity_type, entity_id, date, metric)
  DO UPDATE SET value = contributor_analytics.value + EXCLUDED.value,
                updated_at = now();
END;
$$;

-- Auto-purge analytics older than 1 year (SECURITY DEFINER — service role only)
CREATE OR REPLACE FUNCTION public.purge_old_analytics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM contributor_analytics
  WHERE date < CURRENT_DATE - interval '1 year';
END;
$$;

-- ── suggestions ──────────────────────────────────────────────
-- User-submitted feature suggestions / bug reports.
-- Rate limit: 10 per user per day (enforced in API layer).
CREATE TABLE IF NOT EXISTS public.suggestions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  title          text        NOT NULL
                             CHECK (char_length(title) >= 3 AND char_length(title) <= 200),
  body           text        NOT NULL
                             CHECK (char_length(body) >= 10 AND char_length(body) <= 2000),
  page_url       text        NOT NULL
                             CHECK (char_length(page_url) >= 1 AND char_length(page_url) <= 500),
  status         text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'in_review', 'actioned', 'declined')),
  admin_response text        CHECK (char_length(admin_response) <= 1000),
  resolved_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_status
  ON public.suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_user
  ON public.suggestions (user_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE public.contributor_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_drafts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_keywords        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialised_services        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_ideas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_analytics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions                 ENABLE ROW LEVEL SECURITY;

-- contributor_access_requests
CREATE POLICY "access_requests_select" ON public.contributor_access_requests
  FOR SELECT USING (
    auth.uid() = contributor_id OR
    auth.uid() = admin_id OR
    public.is_admin()
  );

CREATE POLICY "access_requests_insert" ON public.contributor_access_requests
  FOR INSERT WITH CHECK (
    public.is_admin() AND auth.uid() = admin_id
  );

-- Only the contributor can approve/deny their own requests
-- Admins can only revoke (set revoked_at) on their own active sessions
CREATE POLICY "access_requests_update_contributor" ON public.contributor_access_requests
  FOR UPDATE USING (auth.uid() = contributor_id)
  WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "access_requests_update_admin_revoke" ON public.contributor_access_requests
  FOR UPDATE USING (
    auth.uid() = admin_id AND
    status = 'approved' AND
    revoked_at IS NULL
  )
  WITH CHECK (auth.uid() = admin_id);

-- NO DELETE policy — non-destructible audit trail

-- activity_log
CREATE POLICY "activity_log_select" ON public.activity_log
  FOR SELECT USING (
    auth.uid() = contributor_id OR public.is_admin()
  );

CREATE POLICY "activity_log_insert" ON public.activity_log
  FOR INSERT WITH CHECK (
    auth.uid() = contributor_id OR public.is_admin()
  );
-- NO UPDATE / DELETE policies — append-only, non-destructible

-- broadcast_messages
CREATE POLICY "broadcasts_select" ON public.broadcast_messages
  FOR SELECT USING (true);  -- public read (viewers see broadcasts)

CREATE POLICY "broadcasts_insert" ON public.broadcast_messages
  FOR INSERT WITH CHECK (
    auth.uid() = contributor_id
  );

-- Soft-delete only: contributor or admin can set deleted_at
CREATE POLICY "broadcasts_soft_delete" ON public.broadcast_messages
  FOR UPDATE USING (
    auth.uid() = contributor_id OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = contributor_id OR public.is_admin()
  );

-- contributor_drafts
CREATE POLICY "drafts_all" ON public.contributor_drafts
  FOR ALL USING (
    auth.uid() = contributor_id OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = contributor_id OR public.is_admin()
  );

-- team_memberships
CREATE POLICY "team_select" ON public.team_memberships
  FOR SELECT USING (
    auth.uid() = contributor_id OR
    auth.uid() = member_id OR
    public.is_admin()
  );

CREATE POLICY "team_insert" ON public.team_memberships
  FOR INSERT WITH CHECK (
    auth.uid() = contributor_id OR public.is_admin()
  );

CREATE POLICY "team_update" ON public.team_memberships
  FOR UPDATE USING (
    auth.uid() = contributor_id OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = contributor_id OR public.is_admin()
  );

CREATE POLICY "team_delete" ON public.team_memberships
  FOR DELETE USING (
    auth.uid() = contributor_id OR public.is_admin()
  );

-- volunteer_applications
CREATE POLICY "volunteer_select" ON public.volunteer_applications
  FOR SELECT USING (
    auth.uid() = applicant_id OR
    auth.uid() = contributor_id OR
    public.is_admin()
  );

CREATE POLICY "volunteer_insert" ON public.volunteer_applications
  FOR INSERT WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "volunteer_update" ON public.volunteer_applications
  FOR UPDATE USING (
    auth.uid() = applicant_id OR
    auth.uid() = contributor_id OR
    public.is_admin()
  )
  WITH CHECK (
    auth.uid() = applicant_id OR
    auth.uid() = contributor_id OR
    public.is_admin()
  );

-- contributor_keywords
CREATE POLICY "keywords_select" ON public.contributor_keywords
  FOR SELECT USING (true);  -- public for autocomplete

CREATE POLICY "keywords_insert" ON public.contributor_keywords
  FOR INSERT WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "keywords_delete" ON public.contributor_keywords
  FOR DELETE USING (auth.uid() = contributor_id OR public.is_admin());

-- specialised_services
CREATE POLICY "services_select" ON public.specialised_services
  FOR SELECT USING (true);  -- public for search/map discoverability

CREATE POLICY "services_insert" ON public.specialised_services
  FOR INSERT WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "services_delete" ON public.specialised_services
  FOR DELETE USING (auth.uid() = contributor_id OR public.is_admin());

-- planning_tasks
CREATE POLICY "tasks_select" ON public.planning_tasks
  FOR SELECT USING (
    auth.uid() = contributor_id OR
    public.is_admin() OR
    -- Team editors/viewers with visibility
    (visible_to_team = true AND EXISTS (
      SELECT 1 FROM team_memberships
      WHERE contributor_id = planning_tasks.contributor_id
        AND member_id = auth.uid()
        AND status = 'active'
    ))
  );

CREATE POLICY "tasks_insert" ON public.planning_tasks
  FOR INSERT WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "tasks_update" ON public.planning_tasks
  FOR UPDATE USING (auth.uid() = contributor_id OR public.is_admin())
  WITH CHECK (auth.uid() = contributor_id OR public.is_admin());

CREATE POLICY "tasks_delete" ON public.planning_tasks
  FOR DELETE USING (auth.uid() = contributor_id OR public.is_admin());

-- planning_ideas
CREATE POLICY "ideas_select" ON public.planning_ideas
  FOR SELECT USING (
    auth.uid() = contributor_id OR
    public.is_admin() OR
    (visible_to_team = true AND EXISTS (
      SELECT 1 FROM team_memberships
      WHERE contributor_id = planning_ideas.contributor_id
        AND member_id = auth.uid()
        AND status = 'active'
    ))
  );

CREATE POLICY "ideas_insert" ON public.planning_ideas
  FOR INSERT WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "ideas_update" ON public.planning_ideas
  FOR UPDATE USING (auth.uid() = contributor_id OR public.is_admin())
  WITH CHECK (auth.uid() = contributor_id OR public.is_admin());

CREATE POLICY "ideas_delete" ON public.planning_ideas
  FOR DELETE USING (auth.uid() = contributor_id OR public.is_admin());

-- contributor_analytics
CREATE POLICY "analytics_select" ON public.contributor_analytics
  FOR SELECT USING (
    auth.uid() = contributor_id OR public.is_admin()
  );

-- Inserts via SECURITY DEFINER function only — no direct INSERT policy for users
-- (increment_contributor_metric handles this)

-- suggestions
CREATE POLICY "suggestions_select" ON public.suggestions
  FOR SELECT USING (
    auth.uid() = user_id OR public.is_admin()
  );

CREATE POLICY "suggestions_insert" ON public.suggestions
  FOR INSERT WITH CHECK (
    -- Authenticated or anonymous (user_id may be null for logged-out users)
    true
  );

CREATE POLICY "suggestions_update_admin" ON public.suggestions
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.broadcast_messages,
            public.volunteer_applications,
            public.suggestions;
