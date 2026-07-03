-- ============================================================
-- Migration 113: Stage I — Planning card fields
-- ============================================================
-- Extends planning_tasks AND planning_ideas with:
--   • checklist          jsonb  — array of {id, text, done} sub-items
--   • links              jsonb  — array of {url, label} reference links
--   • assigned_place_ids uuid[] — multi-place assignment (single-place
--                                 linked_place_id stays for back-compat)
--
-- CHECK constraints cap each collection so a runaway payload can't blow
-- past sensible UI limits:
--   • checklist: max 50 items
--   • links:     max 20 items
--   • assigned_place_ids: max 10 items
--
-- All fields default to empty so the existing rows + existing inserts
-- continue to work without code change.
-- ============================================================

-- ── planning_tasks ───────────────────────────────────────────
ALTER TABLE public.planning_tasks
  ADD COLUMN IF NOT EXISTS checklist          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS links              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_place_ids uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.planning_tasks
  DROP CONSTRAINT IF EXISTS planning_tasks_checklist_shape,
  ADD  CONSTRAINT planning_tasks_checklist_shape CHECK (
    jsonb_typeof(checklist) = 'array'
    AND jsonb_array_length(checklist) <= 50
  );

ALTER TABLE public.planning_tasks
  DROP CONSTRAINT IF EXISTS planning_tasks_links_shape,
  ADD  CONSTRAINT planning_tasks_links_shape CHECK (
    jsonb_typeof(links) = 'array'
    AND jsonb_array_length(links) <= 20
  );

ALTER TABLE public.planning_tasks
  DROP CONSTRAINT IF EXISTS planning_tasks_assigned_places_size,
  ADD  CONSTRAINT planning_tasks_assigned_places_size CHECK (
    array_length(assigned_place_ids, 1) IS NULL
    OR array_length(assigned_place_ids, 1) <= 10
  );

-- ── planning_ideas ───────────────────────────────────────────
ALTER TABLE public.planning_ideas
  ADD COLUMN IF NOT EXISTS checklist          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS links              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_place_ids uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.planning_ideas
  DROP CONSTRAINT IF EXISTS planning_ideas_checklist_shape,
  ADD  CONSTRAINT planning_ideas_checklist_shape CHECK (
    jsonb_typeof(checklist) = 'array'
    AND jsonb_array_length(checklist) <= 50
  );

ALTER TABLE public.planning_ideas
  DROP CONSTRAINT IF EXISTS planning_ideas_links_shape,
  ADD  CONSTRAINT planning_ideas_links_shape CHECK (
    jsonb_typeof(links) = 'array'
    AND jsonb_array_length(links) <= 20
  );

ALTER TABLE public.planning_ideas
  DROP CONSTRAINT IF EXISTS planning_ideas_assigned_places_size,
  ADD  CONSTRAINT planning_ideas_assigned_places_size CHECK (
    array_length(assigned_place_ids, 1) IS NULL
    OR array_length(assigned_place_ids, 1) <= 10
  );

COMMENT ON COLUMN public.planning_tasks.checklist IS
  'Stage I: jsonb array of {id, text, done} sub-items. Max 50.';
COMMENT ON COLUMN public.planning_tasks.links IS
  'Stage I: jsonb array of {url, label}. URL must be http(s) — enforced in API layer.';
COMMENT ON COLUMN public.planning_tasks.assigned_place_ids IS
  'Stage I: places this task targets. Each id must belong to the contributor — enforced in API layer.';

COMMENT ON COLUMN public.planning_ideas.checklist IS
  'Stage I: jsonb array of {id, text, done} sub-items. Max 50.';
COMMENT ON COLUMN public.planning_ideas.links IS
  'Stage I: jsonb array of {url, label}. URL must be http(s) — enforced in API layer.';
COMMENT ON COLUMN public.planning_ideas.assigned_place_ids IS
  'Stage I: places this idea targets. Each id must belong to the contributor — enforced in API layer.';
