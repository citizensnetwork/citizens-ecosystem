-- Migration 106: Tighten specialised_services + contributor_keywords constraints,
-- add RLS, and ensure unique constraints.

-- =============================================================================
-- 1. specialised_services
-- =============================================================================

-- Tighten length check and add allowlist (A-Za-z0-9 space ._-)
ALTER TABLE public.specialised_services
  DROP CONSTRAINT IF EXISTS specialised_services_service_check;

ALTER TABLE public.specialised_services
  ADD CONSTRAINT specialised_services_service_check CHECK (
    char_length(service) >= 2
    AND char_length(service) <= 40
    AND service ~ '^[A-Za-z0-9 ._-]+$'
  );

-- Unique per place
ALTER TABLE public.specialised_services
  DROP CONSTRAINT IF EXISTS specialised_services_place_id_service_key;

ALTER TABLE public.specialised_services
  ADD CONSTRAINT specialised_services_place_id_service_key
  UNIQUE (place_id, service);

-- Max 10 per place (enforced by API + this constraint helper via trigger)
-- We keep the cap at the API level (no DB trigger needed for now).

-- Enable RLS
ALTER TABLE public.specialised_services ENABLE ROW LEVEL SECURITY;

-- Public read
DROP POLICY IF EXISTS "services_public_read" ON public.specialised_services;
CREATE POLICY "services_public_read"
  ON public.specialised_services
  FOR SELECT
  USING (true);

-- Owner write (insert)
DROP POLICY IF EXISTS "services_owner_insert" ON public.specialised_services;
CREATE POLICY "services_owner_insert"
  ON public.specialised_services
  FOR INSERT
  WITH CHECK (contributor_id = auth.uid());

-- Owner delete
DROP POLICY IF EXISTS "services_owner_delete" ON public.specialised_services;
CREATE POLICY "services_owner_delete"
  ON public.specialised_services
  FOR DELETE
  USING (contributor_id = auth.uid() OR public.is_admin());

-- =============================================================================
-- 2. contributor_keywords
-- =============================================================================

-- Tighten length check and add allowlist (A-Za-z0-9 space ._-)
ALTER TABLE public.contributor_keywords
  DROP CONSTRAINT IF EXISTS contributor_keywords_keyword_check;

ALTER TABLE public.contributor_keywords
  ADD CONSTRAINT contributor_keywords_keyword_check CHECK (
    char_length(keyword) >= 2
    AND char_length(keyword) <= 40
    AND keyword ~ '^[A-Za-z0-9 ._-]+$'
  );

-- Unique per contributor
ALTER TABLE public.contributor_keywords
  DROP CONSTRAINT IF EXISTS contributor_keywords_contributor_id_keyword_key;

ALTER TABLE public.contributor_keywords
  ADD CONSTRAINT contributor_keywords_contributor_id_keyword_key
  UNIQUE (contributor_id, keyword);

-- Enable RLS
ALTER TABLE public.contributor_keywords ENABLE ROW LEVEL SECURITY;

-- Public read
DROP POLICY IF EXISTS "keywords_public_read" ON public.contributor_keywords;
CREATE POLICY "keywords_public_read"
  ON public.contributor_keywords
  FOR SELECT
  USING (true);

-- Owner write (insert)
DROP POLICY IF EXISTS "keywords_owner_insert" ON public.contributor_keywords;
CREATE POLICY "keywords_owner_insert"
  ON public.contributor_keywords
  FOR INSERT
  WITH CHECK (contributor_id = auth.uid());

-- Owner delete
DROP POLICY IF EXISTS "keywords_owner_delete" ON public.contributor_keywords;
CREATE POLICY "keywords_owner_delete"
  ON public.contributor_keywords
  FOR DELETE
  USING (contributor_id = auth.uid() OR public.is_admin());
